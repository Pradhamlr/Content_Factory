import crypto from "crypto";
import { normalizeCampaignContent } from "./contentShape.js";

export function createSourceDescriptor({ type = "text", label = "", originalInput = "", extractedText = "" } = {}) {
  return {
    type,
    label,
    originalInput,
    extractedText: extractedText || originalInput
  };
}

export function createEmptyRevisionHistory() {
  return {
    blog: [],
    tweets: [],
    email: []
  };
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
  deployment,
  telemetry = {},
  revisionHistory
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
    deployment: deployment || {
      deployed: false,
      deployedAt: null,
      deployedChannels: []
    },
    telemetry,
    revisionHistory: normalizeRevisionHistory(revisionHistory)
  };
}
