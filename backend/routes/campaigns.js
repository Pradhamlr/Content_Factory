import { Router } from "express";
import { getCampaignById, listCampaigns } from "../repositories/campaignRepository.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const campaigns = await listCampaigns(12);
    res.json({ campaigns });
  } catch (error) {
    next(error);
  }
});

router.get("/:campaignId", async (req, res, next) => {
  try {
    const campaign = await getCampaignById(req.params.campaignId);

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found." });
    }

    res.json(campaign);
  } catch (error) {
    next(error);
  }
});

export default router;
