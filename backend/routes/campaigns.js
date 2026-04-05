import { Router } from "express";
import { deleteCampaignById, getCampaignById, listCampaigns } from "../repositories/campaignRepository.js";
import { buildArtifactFile, buildArtifactMetadata, buildCampaignZip } from "../utils/artifacts.js";
import { notFound } from "../utils/errors.js";

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

router.get("/:campaignId/artifacts", async (req, res, next) => {
  try {
    const campaign = await getCampaignById(req.params.campaignId);

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found." });
    }

    res.json({
      campaignId: campaign.campaignId,
      artifacts: buildArtifactMetadata(campaign)
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:campaignId/artifacts/:artifactKey", async (req, res, next) => {
  try {
    const campaign = await getCampaignById(req.params.campaignId);

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found." });
    }

    const artifact = buildArtifactFile(campaign, req.params.artifactKey);

    if (!artifact) {
      return res.status(404).json({ error: "Artifact not found." });
    }

    res.setHeader("Content-Type", artifact.type);
    res.setHeader("Content-Disposition", `attachment; filename="${artifact.title}"`);
    res.send(artifact.content);
  } catch (error) {
    next(error);
  }
});

router.get("/:campaignId/export", async (req, res, next) => {
  try {
    const campaign = await getCampaignById(req.params.campaignId);

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found." });
    }

    const zipBuffer = await buildCampaignZip(campaign);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="campaign-kit-${campaign.campaignId}.zip"`);
    res.send(zipBuffer);
  } catch (error) {
    next(error);
  }
});

router.delete("/:campaignId", async (req, res, next) => {
  try {
    const deleted = await deleteCampaignById(req.params.campaignId);

    if (!deleted) {
      throw notFound("Campaign not found.");
    }

    res.json({
      campaignId: req.params.campaignId,
      deleted: true
    });
  } catch (error) {
    next(error);
  }
});

export default router;
