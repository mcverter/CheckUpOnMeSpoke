import { config } from "../../../config";
import { r } from "../../models";
import logger from "../../../logger";

export async function createCampaign(message) {
    // assume the org will be created manually, and the API
    // needs to pass in an organizationID
    if (!message.hasOwnProperty("organizationId") ||
        !message.hasOwnProperty("campaignName")) {
            logger.error("organizationId and campagnName are required");
            return;
        }
    const { organizationId, campaignName } = message;
    const [campaignId] = await r
        .knex("campaign")
        .insert({
            name: campaignName,
            organization_id: organizationId
        })
        .returning("id");
    return campaignId;
}

export async function addContactToCampaign(message) {
    if (!message.hasOwnProperty("campaignId") ||
        !message.hasOwnProperty("firstName") ||
        !message.hasOwnProperty("lastName") ||
        !message.hasOwnProperty("cell")) {
            logger.error("campaignId, firstName, lastName, and cell are required");
            return null;
        }
    const { campaignId, firstName, lastName, cell, zip } = message;
    const [contactId] = r
        .knex("campaign_contact")
        .insert({
            campaign_id: campaignId,
            first_name: firstName,
            last_name: lastName,
            cell: cell,
            zip: zip
        })
        .returning("id");
    return contactId;
}