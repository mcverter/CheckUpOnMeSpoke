import express from "express";
const router = express.Router();

import logger from "../../logger";
import {createCampaign, addContactToCampaign} from "../api/lib/reachforhelp";

router.post("/reachforhelp/create-campaign", async (req, res) => {
    try {
        const campaignId = await createCampaign(req.body);
        res.send(campaignId);
    } catch (ex) {
        logger.error("Error creating campaign", ex);
        res.status(500).send(ex.message);
      }
});

router.post("/reachforhelp/add-contacts", async (req, res) => {
    try {
        const contactId = await addContactToCampaign(req.body);
        res.send(contactId);
    } catch (ex) {
        logger.error("Error adding users to campaign", ex);
        res.status(500).send(ex.message);
      }
});

export default router;