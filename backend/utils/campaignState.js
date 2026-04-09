import crypto from "crypto";
import { normalizeCampaignContent } from "./contentShape.js";

export function createSourceDescriptor({ type = "text", label = "", originalInput = "", extractedText = "", socialPlatform = "twitter" } = {}) {
  return {
    type,
    label,
    originalInput,
    extractedText: extractedText || originalInput,
    socialPlatform: ["twitter", "linkedin", "reddit"].includes(String(socialPlatform || "").toLowerCase())
      ? String(socialPlatform).toLowerCase()
      : "twitter"
  };
}

export function createEmptyRevisionHistory() {
  return {
    blog: [],
    tweets: [],
    email: []
  };
}

export function createEmptyApprovalMeta() {
  return {
    blog: {
      approved: false,
      type: null,
      note: "",
      approvedAt: null
    },
    tweets: {
      approved: false,
      type: null,
      note: "",
      approvedAt: null
    },
    email: {
      approved: false,
      type: null,
      note: "",
      approvedAt: null
    }
  };
}

export function normalizeApprovalMeta(meta = {}) {
  const base = createEmptyApprovalMeta();

  for (const channel of Object.keys(base)) {
    const entry = meta?.[channel];

    if (entry && typeof entry === "object") {
      base[channel] = {
        approved: Boolean(entry.approved),
        type: entry.type || null,
        note: entry.note || "",
        approvedAt: entry.approvedAt || null
      };
    }
  }

  return base;
}

export function normalizeManualInstructions(instructions = []) {
  return Array.isArray(instructions) ? instructions.filter((item) => item && typeof item === "object" && item.message) : [];
}

export function normalizeRevisionHistory(history = {}) {
  return {
    blog: Array.isArray(history.blog) ? history.blog : [],
    tweets: Array.isArray(history.tweets) ? history.tweets : [],
    email: Array.isArray(history.email) ? history.email : []
  };
}

export function appendRevision(history, channel, entry) {
  const nextHistory = normalizeRevisionHistory(history);

  if (!nextHistory[channel]) {
    return nextHistory;
  }

  nextHistory[channel] = [
    ...nextHistory[channel],
    {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry
    }
  ];

  return nextHistory;
}

export function buildCampaignState({
  campaignId,
  requestId,
  source,
  facts = null,
  content = null,
  status = "PROCESSING",
  reviewStatus = "PENDING",
  approvals,
  approvalMeta,
  deployment,
  telemetry = {},
  revisionHistory,
  manualInstructions = [],
  previewAssets = {},
  pendingGuidance = null,
  lastAppliedGuidance = null
}) {
  return {
    campaignId: campaignId || requestId,
    requestId,
    source,
    facts,
    content: content ? normalizeCampaignContent(content) : null,
    status,
    reviewStatus,
    approvals: approvals || {
      blog: false,
      tweets: false,
      email: false
    },
    approvalMeta: normalizeApprovalMeta(approvalMeta),
    deployment: deployment || {
      deployed: false,
      deployedAt: null,
      deployedChannels: []
    },
    telemetry,
    revisionHistory: normalizeRevisionHistory(revisionHistory),
    manualInstructions: normalizeManualInstructions(manualInstructions),
    previewAssets: previewAssets && typeof previewAssets === "object" ? previewAssets : {},
    pendingGuidance: pendingGuidance && typeof pendingGuidance === "object" && pendingGuidance.message ? pendingGuidance : null,
    lastAppliedGuidance: lastAppliedGuidance && typeof lastAppliedGuidance === "object" && lastAppliedGuidance.message ? lastAppliedGuidance : null
  };
}
