import { config } from "../../../config";
import logger from "../../../logger";
import Twilio from "twilio";
import _ from "lodash";
import moment from "moment-timezone";
import { getFormattedPhoneNumber } from "../../../lib/phone-format";
import { r } from "../../models";
import { sleep } from "../../../lib/utils";
import {
	getContactMessagingService,
	appendServiceResponse
} from "./message-sending";
import {
	getCampaignContactAndAssignmentForIncomingMessage,
	saveNewIncomingMessage,
	messageComponents
} from "./message-sending";
import { symmetricDecrypt } from "./crypto";
import {getUsersByPhoneNumber} from "../user";

const MAX_SEND_ATTEMPTS = 5;
const MESSAGE_VALIDITY_PADDING_SECONDS = 30;
const MAX_TWILIO_MESSAGE_VALIDITY = 14400;

const headerValidator = () => {
	const { SKIP_TWILIO_VALIDATION, TWILIO_VALIDATION_HOST, BASE_URL } = config;
	if (!!SKIP_TWILIO_VALIDATION) return (req, res, next) => next();

	return async (req, res, next) => {
		const { MessagingServiceSid } = req.body;
		const { authToken } = await getTwilioCredentials(MessagingServiceSid);

		// Allow setting
		const host = TWILIO_VALIDATION_HOST
			? TWILIO_VALIDATION_HOST !== ""
				? TWILIO_VALIDATION_HOST
				: undefined
			: BASE_URL;

		const options = {
			validate: true,
			protocol: "https",
			host
		};

		return Twilio.webhook(authToken, options)(req, res, next);
	};
};

const textIncludingMms = (text, serviceMessages) => {
	const mediaUrls = [];
	serviceMessages.forEach(serviceMessage => {
		const mediaUrlKeys = Object.keys(serviceMessage).filter(key =>
			key.startsWith("MediaUrl")
		);
		mediaUrlKeys.forEach(key => mediaUrls.push(serviceMessage[key]));
	});
	if (mediaUrls.length > 0) {
		const warningText =
			`Spoke Message:\n\nThis message contained ${mediaUrls.length} ` +
			"multimedia attachment(s) which Spoke does not display.";

		if (text === "") {
			text = warningText;
		} else {
			text = `${text}\n\n${warningText}`;
		}
	}

	return text;
};

async function convertMessagePartsToMessage(messageParts) {
	const firstPart = messageParts[0];
	const userNumber = firstPart.user_number;
	const contactNumber = firstPart.contact_number;
	const serviceMessages = messageParts.map(part =>
		JSON.parse(part.service_message)
	);
	const text = serviceMessages
		.map(serviceMessage => serviceMessage.Body)
		.join("")
		.replace(/\0/g, ""); // strip all UTF-8 null characters (0x00)

	const ccInfo = await getCampaignContactAndAssignmentForIncomingMessage({
		service: "twilio",
		contactNumber,
		messaging_service_sid: serviceMessages[0].MessagingServiceSid
	});

	return (
		ccInfo && {
			campaign_contact_id: ccInfo && ccInfo.campaign_contact_id,
			contact_number: contactNumber,
			user_number: userNumber,
			is_from_contact: true,
			text: textIncludingMms(text, serviceMessages),
			service_response: JSON.stringify(serviceMessages).replace(/\0/g, ""),
			service_id: serviceMessages[0].MessagingServiceSid,
			assignment_id: ccInfo && ccInfo.assignment_id,
			service: "twilio",
			send_status: "DELIVERED"
		}
	);
}

async function findNewCell(messagingSericeSid) {
	const twilio = await twilioClient(messagingSericeSid);
	return new Promise((resolve, reject) => {
		twilio.availablePhoneNumbers("US").local.list({}, (err, data) => {
			if (err) {
				reject(new Error(err));
			} else {
				resolve(data);
			}
		});
	});
}

async function rentNewCell(messagingSericeSid) {
	const twilio = await twilioClient(messagingSericeSid);
	const newCell = await findNewCell();

	if (
		newCell &&
		newCell.availablePhoneNumbers &&
		newCell.availablePhoneNumbers[0] &&
		newCell.availablePhoneNumbers[0].phone_number
	) {
		return new Promise((resolve, reject) => {
			twilio.incomingPhoneNumbers.create(
				{
					phoneNumber: newCell.availablePhoneNumbers[0].phone_number,
					smsApplicationSid: messagingSericeSid
				},
				(err, purchasedNumber) => {
					if (err) {
						reject(err);
					} else {
						resolve(purchasedNumber.phone_number);
					}
				}
			);
		});
	}

	throw new Error("Did not find any cell");
}

const getTwilioCredentials = async messagingServiceSid => {
	const { account_sid: accountSid, encrypted_auth_token } = await r
		.reader("messaging_service")
		.first(["account_sid", "encrypted_auth_token"])
		.where({
			messaging_service_sid: messagingServiceSid,
			service_type: "twilio"
		});
	const authToken = symmetricDecrypt(encrypted_auth_token);
	return { accountSid, authToken };
};

const twilioClient = async messagingServiceSid => {
	const { accountSid, authToken } = await getTwilioCredentials(
		messagingServiceSid
	);
	return Twilio(accountSid, authToken);
};

async function sendMessage(message, organizationId, trx = r.knex) {
	const service = await getContactMessagingService(
		message.campaign_contact_id,
		organizationId
	);
	const messagingServiceSid = service.messaging_service_sid;
	const twilio = await twilioClient(messagingServiceSid);

	if (!twilio) {
		logger.error(
			"cannot actually send SMS message -- twilio is not fully configured",
			{ messageId: message.id }
		);
		if (message.id) {
			await trx("message")
				.update({ send_status: "SENT", sent_at: trx.fn.now() })
				.where({ id: message.id });
		}
		return "test_message_uuid";
	}

	// TODO: refactor this -- the Twilio client supports promises now
	return new Promise(async (resolve, reject) => {
		if (message.service !== "twilio") {
			logger.warn("Message not marked as a twilio message", message.id);
		}

		const { body, mediaUrl } = messageComponents(message.text);
		const messageParams = {
			body,
			mediaUrl: mediaUrl || [],
			to: message.contact_number,
			messagingServiceSid: messagingServiceSid,
			statusCallback: config.TWILIO_STATUS_CALLBACK_URL
		};

		let twilioValidityPeriod = config.TWILIO_MESSAGE_VALIDITY_PERIOD;

		if (message.send_before) {
			// the message is valid no longer than the time between now and
			// the send_before time, less 30 seconds
			// we subtract the MESSAGE_VALIDITY_PADDING_SECONDS seconds to allow time for the message to be sent by
			// a downstream service
			const messageValidityPeriod =
				moment(message.send_before).diff(moment(), "seconds") -
				MESSAGE_VALIDITY_PADDING_SECONDS;
			if (messageValidityPeriod < 0) {
				// this is an edge case
				// it means the message arrived in this function already too late to be sent
				// pass the negative validity period to twilio, and let twilio respond with an error
			}

			if (twilioValidityPeriod) {
				twilioValidityPeriod = Math.min(
					twilioValidityPeriod,
					messageValidityPeriod,
					MAX_TWILIO_MESSAGE_VALIDITY
				);
			} else {
				twilioValidityPeriod = Math.min(
					messageValidityPeriod,
					MAX_TWILIO_MESSAGE_VALIDITY
				);
			}
		}

		if (twilioValidityPeriod) {
			messageParams.validityPeriod = twilioValidityPeriod;
		}

		twilio.messages.create(messageParams, (err, response) => {
			const messageToSave = {
				...message
			};
			let hasError = false;
			if (err) {
				hasError = true;
				logger.error(`Error sending message ${message.id}: `, err);
				const jsonErr = typeof err === "object" ? err : { error: err };
				messageToSave.service_response = appendServiceResponse(
					messageToSave.service_response,
					jsonErr
				);
			}
			if (response) {
				messageToSave.service_id = response.sid;
				hasError = !!response.error_code;
				messageToSave.service_response = appendServiceResponse(
					messageToSave.service_response,
					response
				);
			}

			if (hasError) {
				const SENT_STRING = '"status"'; // will appear in responses
				if (
					messageToSave.service_response.split(SENT_STRING).length >=
					MAX_SEND_ATTEMPTS + 1
				) {
					messageToSave.send_status = "ERROR";
				}
				const { id: messageId, ...updatePayload } = messageToSave;
				trx("message")
					.update(updatePayload)
					.where({ id: messageId })
					.then(() =>
						reject(
							err ||
							(response
								? new Error(JSON.stringify(response))
								: new Error("Encountered unknown error"))
						)
					);
			} else {
				const { id: messageId, ...updatePayload } = messageToSave;
				trx("message")
					.update({
						...updatePayload,
						send_status: "SENT",
						service: "twilio",
						sent_at: trx.fn.now()
					})
					.where({ id: messageId })
					.returning("*")
					.then(([newMessage]) => resolve(newMessage));
			}
		});
	});
}

// Get appropriate Spoke message status from Twilio status
const getMessageStatus = twilioStatus => {
	if (twilioStatus === "delivered") {
		return "DELIVERED";
	} else if (twilioStatus === "failed" || twilioStatus === "undelivered") {
		return "ERROR";
	}

	// Other Twilio statuses do not map to Spoke statuses and thus are ignored
};

// Delivery reports can arrive before sendMessage() has finished. In these cases,
// the message record in the database will not have a Twilio SID saved and the
// delivery report lookup will fail. To deal with this we prioritize recording
// the delivery report itself rather than updating the message. We can then "replay"
// the delivery reports back on the message table at a later date. We still attempt
// to update the message record status (after a slight delay).
async function handleDeliveryReport(report) {
	const { MessageSid: service_id, MessageStatus } = report;

	// Record the delivery report
	const insertResult = await r.knex("log").insert({
		message_sid: service_id,
		body: JSON.stringify(report)
	});

	// Kick off message update after delay, but don't wait around for result
	sleep(5000)
		.then(() =>
			r
				.knex("message")
				.update({
					service_response_at: r.knex.fn.now(),
					send_status: getMessageStatus(MessageStatus)
				})
				.where({ service_id })
		)
		.then(rowCount => {
			if (rowCount !== 1) {
				logger.warn(
					`Received message report '${MessageStatus}' for Message SID ` +
					`'${service_id}' that matched ${rowCount} messages. Expected only 1 match.`
				);
			}
		})
		.catch(logger.error);

	return insertResult;
}

async function handleIncomingMessage(message) {
	if (
		!message.hasOwnProperty("From") ||
		!message.hasOwnProperty("To") ||
		!message.hasOwnProperty("Body") ||
		!message.hasOwnProperty("MessageSid")
	) {
		logger.error("This is not an incoming message", { payload: message });
	}

	const { From, To, MessageSid } = message;
	const contactNumber = getFormattedPhoneNumber(From);
	const userNumber = To ? getFormattedPhoneNumber(To) : "";


	import {createContact} from '../../../__test__/backend.test';

	if (!getUsersByPhoneNumber(contactNumber)) {
		const onboardingMessage = "Hi there! Thanks for sending a text to CheckUpOn.Me! If you would like to be texted by one of our volunteers, please reply to this message with the word \"YES\"";
    const organizationId = 4;
    const campaignId = 5;
    const contact = createContact({
			first_name: "unknown",
			last_name: "unknown",
			cell: contactNumber,
			campaign_id: campaignId
		});

		sendMessage(onboardingMessage, organizationId)
	}

	let pendingMessagePart = {
		service: "twilio",
		service_id: MessageSid,
		parent_id: null,
		service_message: JSON.stringify(message),
		user_number: userNumber,
		contact_number: contactNumber
	};

	if (!config.JOBS_SAME_PROCESS) {
		// If multiple processes, just insert the message part and let another job handle it
		await r.knex("pending_message_part").insert(pendingMessagePart);
	} else {
		// Handle the message directly and skip saving an intermediate part
		const finalMessage = await convertMessagePartsToMessage([
			pendingMessagePart
		]);
		if (finalMessage) {
			await saveNewIncomingMessage(finalMessage);
		}
	}

}

export default {
	syncMessagePartProcessing: config.JOBS_SAME_PROCESS,
	headerValidator,
	convertMessagePartsToMessage,
	findNewCell,
	rentNewCell,
	sendMessage,
	saveNewIncomingMessage,
	handleDeliveryReport,
	handleIncomingMessage
};
