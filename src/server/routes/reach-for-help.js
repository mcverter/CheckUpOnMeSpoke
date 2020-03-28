import express from "express";
const router = express.Router();

import logger from "../../logger";
import reachForHelp from "../api/lib/reachforhelp";

router.post("/reachforhelp/create-campaign", async (req, res) => {
    try {
        const campaignId = await reachForHelp.createCampaign(req.body);
        res.send(campaignId);
    } catch (ex) {
        logger.error("Error creating campaign", ex);
        res.status(500).send(ex.message);
      }
});

router.post("/reachforhelp/add-contacts", async (req, res) => {
    try {
        const contactId = await reachForHelp.addContactToCampaign(req.body);
        res.send(contactId);
    } catch (ex) {
        logger.error("Error adding users to campaign", ex);
        res.status(500).send(ex.message);
      }
});