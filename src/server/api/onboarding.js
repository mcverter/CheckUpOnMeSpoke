/*
o in this case, I think we could still use a lot of the build in tools that spoke has. Originally as you suggested, the unknown number is added to a "New signup" campaign. Its added with a fake name, so that Spoke knows how to message it.
 */

import { sendMessage } from './lib/assemble-numbers';
import {createUser, createCampaign, createContact, createOrganization, createInvite} from '../../../__test__/backend.test';
const onboardingMessage =
	"Hi there! Thanks for sending a text to CheckUpOn.Me! If you would like to be texted by one of our volunteers, please reply to this message with the word \"YES\".";

const newSignupCampaign = createCampaign({foo: "bar"})

function addPhoneToCampaign(phone) {
	function createUser(cell) {
		sql({
			first_name: "unknown",
			last_name: "unknown",
			cell,
			campaign_id: newSignupCampaign
		})
	}

	const user = createUser(cell);
	sendMessage()
}

function sendOnboardingMessage() {

}

module.exports = {
	onboardingMessage
}