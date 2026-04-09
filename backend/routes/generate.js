import { Router } from "express";
import crypto from "crypto";
import multer from "multer";
import { researcherAgent } from "../agents/researcher.js";
import { writerAgent } from "../agents/writer.js";
import { editorAgent } from "../agents/editor.js";
import { assertUnlocked, isLocked, withActionLock } from "../utils/actionLocks.js";
import { addStream, publish, removeStream } from "../utils/requestEvents.js";
import { delay } from "../utils/delay.js";
import { mergeCampaignContent, normalizeCampaignContent } from "../utils/contentShape.js";
import { AppError, badRequest, notFound, timeoutError } from "../utils/errors.js";
import { extractPdfText } from "../utils/pdfExtractor.js";
import { logEvent } from "../utils/logger.js";
import { getCampaignByRequestId, saveCampaign } from "../repositories/campaignRepository.js";
import {
  appendRevision,
  buildCampaignState,
  createEmptyApprovalMeta,
  createEmptyRevisionHistory,
  createSourceDescriptor
} from "../utils/campaignState.js";
import { requireNonEmptyString, requireObject, requireOneOf } from "../utils/validation.js";
import { extractUrlText } from "../utils/urlExtractor.js";
import { truncateModelInput } from "../utils/inputTruncation.js";
import { getSocialPlatformLabel, normalizeSocialPlatform } from "../utils/platformRules.js";

const router = Router();
const MAX_ATTEMPTS = 2;
const STREAM_BOOT_DELAY_MS = 700;
const STAGE_TRANSITION_DELAY_MS = 1600;
const ATTEMPT_START_DELAY_MS = 900;
const RETRY_FEEDBACK_DELAY_MS = 1200;
const REGENERATE_REVIEW_DELAY_MS = 1800;
const REGENERATE_MAX_ATTEMPTS = 2;
const AGENT_RETRY_LIMIT = 2;
const AGENT_TIMEOUT_MS = 45000;
const PREVIEW_RETRY_INTERVAL_MS = 8000;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});
const approvalStore = new Map();
const approvalMetaStore = new Map();
const deploymentStore = new Map();
const resultStore = new Map();
const requestToCampaignStore = new Map();
const instructionStore = new Map();
const pendingGuidanceStore = new Map();
const lastAppliedGuidanceStore = new Map();

function createDefaultApprovals() {
  return {
    blog: false,
    tweets: false,
    email: false
  };
}

function createDefaultDeployment() {
  return {
    deployed: false,
    deployedAt: null,
    deployedChannels: []
  };
}

function createOperatorInstruction(message) {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    message: String(message || "").trim()
  };
}

function cacheCampaign(payload) {
  if (!payload?.requestId) {
    return payload;
  }

  resultStore.set(payload.requestId, payload);
  if (payload.campaignId) {
    requestToCampaignStore.set(payload.campaignId, payload.requestId);
  }
  approvalStore.set(payload.requestId, payload.approvals || createDefaultApprovals());
  approvalMetaStore.set(payload.requestId, payload.approvalMeta || createEmptyApprovalMeta());
  deploymentStore.set(payload.requestId, payload.deployment || createDefaultDeployment());
  instructionStore.set(payload.requestId, Array.isArray(payload.manualInstructions) ? payload.manualInstructions : []);
  pendingGuidanceStore.set(payload.requestId, payload.pendingGuidance || null);
  lastAppliedGuidanceStore.set(payload.requestId, payload.lastAppliedGuidance || null);

  return payload;
}

function removeCachedCampaign(payload) {
  if (!payload) {
    return;
  }

  if (payload.requestId) {
    resultStore.delete(payload.requestId);
    approvalStore.delete(payload.requestId);
    approvalMetaStore.delete(payload.requestId);
    deploymentStore.delete(payload.requestId);
    instructionStore.delete(payload.requestId);
    pendingGuidanceStore.delete(payload.requestId);
    lastAppliedGuidanceStore.delete(payload.requestId);
  }

  if (payload.campaignId) {
    requestToCampaignStore.delete(payload.campaignId);
  }
}

function startTimer() {
  return Date.now();
}

function endTimer(startedAt) {
  return Date.now() - startedAt;
}

function clampQualityScore(value) {
  const numeric = typeof value === "number" ? value : Number.parseFloat(value);

  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Math.max(0, Math.min(99, Math.round(numeric)));
}

function buildQualityTelemetry(review, attempts = 1, maxAttempts = MAX_ATTEMPTS) {
  const confidence =
    typeof review?.confidence === "number"
      ? Math.max(0, Math.min(1, review.confidence))
      : review?.status === "APPROVED"
        ? 0.82
        : 0.48;
  const statusModifier = review?.status === "APPROVED" ? 6 : -8;
  const attemptModifier = Math.max(0, maxAttempts - attempts) * 2;
  const score = clampQualityScore(confidence * 100 + statusModifier + attemptModifier);

  return {
    score,
    confidence: Number(confidence.toFixed(2)),
    source: "editor",
    reason: review?.reason || "",
    reviewStatus: review?.status || "PENDING",
    platformFit: clampQualityScore(
      typeof review?.platformReview?.violations?.length === "number"
        ? 92 - review.platformReview.violations.length * 14
        : confidence * 100
    ),
    riskLevel: review?.platformReview?.riskLevel || "low"
  };
}

function buildAiTelemetry(agentMeta = {}) {
  const researcher = agentMeta.researcher || {};
  const writer = agentMeta.writer || {};
  const editor = agentMeta.editor || {};
  const fallbackUsed = Boolean(researcher.fallbackUsed || writer.fallbackUsed || editor.fallbackUsed);

  return {
    fallbackUsed,
    agents: {
      researcher,
      writer,
      editor
    }
  };
}

async function runWithRecovery(taskName, requestId, runner) {
  let lastError;

  for (let attempt = 1; attempt <= AGENT_RETRY_LIMIT; attempt += 1) {
    try {
      return await withTimeout(taskName, runner);
    } catch (error) {
      lastError = error;

      logEvent("agent_recovery_retry", {
        requestId,
        taskName,
        attempt,
        error: error.message
      });

      publish(requestId, "attempt", {
        requestId,
        attempt,
        message: `${taskName} hit a formatting issue. Recovering automatically (${attempt}/${AGENT_RETRY_LIMIT}).`
      });

      await delay(RETRY_FEEDBACK_DELAY_MS);
    }
  }

  throw lastError;
}

async function withTimeout(taskName, runner, timeoutMs = AGENT_TIMEOUT_MS) {
  let timeoutId;

  try {
    return await Promise.race([
      runner(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(timeoutError(`${taskName} timed out. Please try again.`, { taskName, timeoutMs }));
        }, timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function replaceChannelContent(currentContent, nextContent, channel) {
  const current = normalizeCampaignContent(currentContent);
  const next = normalizeCampaignContent(nextContent);

  if (channel === "blog") {
    return { ...current, blog: next.blog || current.blog };
  }

  if (channel === "tweets") {
    return { ...current, tweets: next.tweets.length ? next.tweets : current.tweets };
  }

  if (channel === "email") {
    return { ...current, email: next.email || current.email };
  }

  return current;
}

function getChannelContent(content, channel) {
  const normalized = normalizeCampaignContent(content);

  if (channel === "blog") {
    return normalized.blog || "";
  }

  if (channel === "tweets") {
    return normalized.tweets || [];
  }

  if (channel === "email") {
    return normalized.email || "";
  }

  return "";
}

function getApprovals(requestId) {
  return approvalStore.get(requestId) || createDefaultApprovals();
}

function getDeployment(requestId) {
  return deploymentStore.get(requestId) || createDefaultDeployment();
}

function getApprovalMeta(requestId) {
  return approvalMetaStore.get(requestId) || createEmptyApprovalMeta();
}

function getManualInstructions(requestId) {
  return instructionStore.get(requestId) || [];
}

function getLatestOperatorGuidance(requestId) {
  const instructions = getManualInstructions(requestId);
  return instructions.length ? instructions[instructions.length - 1].message : "";
}

function getLatestOperatorInstruction(requestId) {
  const instructions = getManualInstructions(requestId);
  return instructions.length ? instructions[instructions.length - 1] : null;
}

function getPendingGuidance(requestId) {
  return pendingGuidanceStore.get(requestId) || null;
}

function getLastAppliedGuidance(requestId) {
  return lastAppliedGuidanceStore.get(requestId) || null;
}

function isCampaignProcessing(requestId) {
  return (
    isLocked(`generate:${requestId}`) ||
    isLocked(`regenerate:${requestId}:blog`) ||
    isLocked(`regenerate:${requestId}:tweets`) ||
    isLocked(`regenerate:${requestId}:email`)
  );
}

async function getStoredResult(requestId) {
  const cached = resultStore.get(requestId) || null;

  if (cached) {
    return cached;
  }

  const stored = await getCampaignByRequestId(requestId);

  if (stored) {
    cacheCampaign(stored);
  }

  return stored || null;
}

function getImageTitle(payload) {
  const blog = payload?.content?.blog || "";
  const firstLine = blog
    .replace(/^#+\s*/gm, "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  return firstLine || payload?.facts?.valueProposition || "Campaign Preview";
}

function buildPreviewSignature(payload, variant = "desktop") {
  const content = normalizeCampaignContent(payload?.content || {});
  const facts = payload?.facts || {};
  const source = payload?.source || {};

  return crypto
    .createHash("sha1")
    .update(
      JSON.stringify({
        variant,
        valueProposition: facts.valueProposition || "",
        features: Array.isArray(facts.features) ? facts.features.slice(0, 5) : [],
        audience: Array.isArray(facts.targetAudience) ? facts.targetAudience.slice(0, 3) : [],
        blog: content.blog || "",
        tweets: Array.isArray(content.tweets) ? content.tweets.slice(0, 3) : [],
        email: content.email || "",
        sourceLabel: source.label || ""
      })
    )
    .digest("hex");
}

function buildImagePrompt(payload, variant = "desktop") {
  const facts = payload?.facts || {};
  const title = getImageTitle(payload);
  const value = facts.valueProposition || "";
  const features = Array.isArray(facts.features) ? facts.features.slice(0, 3).join(", ") : "";
  const audience = Array.isArray(facts.targetAudience) ? facts.targetAudience.slice(0, 2).join(", ") : "";
  const style =
    variant === "mobile"
      ? "premium social media visual, editorial, modern, high contrast, topic relevant, no text overlay"
      : "premium website hero image, editorial product storytelling, cinematic lighting, topic relevant, no text overlay";

  return [title, value, features, audience, style].filter(Boolean).join(", ");
}

function escapeSvgText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapSvgText(value, maxLength = 30) {
  const words = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) {
    return ["Campaign Preview"];
  }

  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.slice(0, 3);
}

function buildFallbackSvg(title, variant = "desktop") {
  const titleLines = wrapSvgText(title, variant === "mobile" ? 24 : 34).map(escapeSvgText);
  const width = variant === "mobile" ? 1080 : 1400;
  const height = variant === "mobile" ? 1080 : 760;
  const titleSize = variant === "mobile" ? 56 : 60;
  const titleY = variant === "mobile" ? 410 : 330;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#081121"/>
      <stop offset="100%" stop-color="#0d172b"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="45%" r="45%">
      <stop offset="0%" stop-color="#00f0ff" stop-opacity="0.42"/>
      <stop offset="45%" stop-color="#00f0ff" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#00f0ff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" rx="24" fill="url(#bg)"/>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="24" fill="none" stroke="rgba(255,255,255,0.05)"/>
  <ellipse cx="${Math.round(width * 0.48)}" cy="${Math.round(height * 0.44)}" rx="${Math.round(width * 0.18)}" ry="${Math.round(height * 0.25)}" fill="url(#glow)"/>
  <g fill="none" stroke="#38e4ff" stroke-opacity="0.72" stroke-width="3">
    <path d="M 40 ${Math.round(height * 0.34)} C ${Math.round(width * 0.18)} ${Math.round(height * 0.18)}, ${Math.round(width * 0.36)} ${Math.round(height * 0.5)}, ${Math.round(width * 0.52)} ${Math.round(height * 0.34)} S ${Math.round(width * 0.84)} ${Math.round(height * 0.18)}, ${width - 40} ${Math.round(height * 0.34)}" />
    <path d="M 40 ${Math.round(height * 0.39)} C ${Math.round(width * 0.18)} ${Math.round(height * 0.24)}, ${Math.round(width * 0.36)} ${Math.round(height * 0.55)}, ${Math.round(width * 0.52)} ${Math.round(height * 0.39)} S ${Math.round(width * 0.84)} ${Math.round(height * 0.24)}, ${width - 40} ${Math.round(height * 0.39)}" opacity="0.75" />
    <path d="M 40 ${Math.round(height * 0.62)} C ${Math.round(width * 0.2)} ${Math.round(height * 0.75)}, ${Math.round(width * 0.38)} ${Math.round(height * 0.48)}, ${Math.round(width * 0.56)} ${Math.round(height * 0.62)} S ${Math.round(width * 0.84)} ${Math.round(height * 0.75)}, ${width - 40} ${Math.round(height * 0.62)}" opacity="0.55" />
  </g>
  <g fill="none" stroke="#6366f1" stroke-opacity="0.24" stroke-width="1.5">
    <path d="M 60 ${Math.round(height * 0.18)} L ${width - 60} ${Math.round(height * 0.18)}"/>
    <path d="M 60 ${Math.round(height * 0.82)} L ${width - 60} ${Math.round(height * 0.82)}"/>
  </g>
  <g fill="#eff6ff" font-family="Inter, Arial, sans-serif" font-size="${titleSize}" font-weight="700">
    ${titleLines.map((line, index) => `<text x="${variant === "mobile" ? 80 : 120}" y="${titleY + index * Math.round(titleSize * 1.2)}">${line}</text>`).join("")}
  </g>
</svg>`;
}

function buildPreviewAssetFromBuffer(payload, variant, prompt, buffer, contentType) {
  return {
    variant,
    provider: "pollinations",
    status: "generated",
    prompt,
    title: getImageTitle(payload),
    signature: buildPreviewSignature(payload, variant),
    contentType,
    data: buffer.toString("base64"),
    generatedAt: new Date().toISOString()
  };
}

function buildPreviewAssetFromFallback(payload, variant) {
  const svg = buildFallbackSvg(getImageTitle(payload), variant);

  return {
    variant,
    provider: "local-svg",
    status: "fallback",
    prompt: buildImagePrompt(payload, variant),
    title: getImageTitle(payload),
    signature: buildPreviewSignature(payload, variant),
    contentType: "image/svg+xml; charset=utf-8",
    data: Buffer.from(svg, "utf8").toString("base64"),
    generatedAt: new Date().toISOString()
  };
}

async function fetchPreviewImage(payload, variant) {
  const prompt = buildImagePrompt(payload, variant);
  const seed = `${payload?.requestId || "campaign"}-${variant}`;
  const width = variant === "mobile" ? 1024 : 1400;
  const height = variant === "mobile" ? 1400 : 900;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${encodeURIComponent(seed)}&nologo=true`;
  let response = null;
  let lastStatus = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    response = await fetch(url, {
      signal: AbortSignal.timeout(20000)
    });

    if (response.ok) {
      break;
    }

    lastStatus = response.status;
    await delay(500);
  }

  if (!response?.ok) {
    throw new Error(`Image service responded with ${lastStatus || "an error"}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "image/jpeg";

  return { buffer, contentType, prompt };
}

function getPreviewAsset(payload, variant) {
  const asset = payload?.previewAssets?.[variant];
  const signature = buildPreviewSignature(payload, variant);

  if (asset?.data && asset?.signature === signature && !isLegacyFallbackAsset(asset)) {
    return asset;
  }

  return null;
}

function isLegacyFallbackAsset(asset) {
  if (!asset || asset.status !== "fallback" || !asset.data || !String(asset.contentType || "").includes("svg")) {
    return false;
  }

  try {
    const svg = Buffer.from(asset.data, "base64").toString("utf8");
    return svg.includes("AI image provider unavailable") || svg.includes("AI VISUAL") || svg.includes("SOCIAL VISUAL");
  } catch {
    return false;
  }
}

function shouldRetryPreviewAsset(asset) {
  if (!asset || asset.status !== "fallback") {
    return false;
  }

  const generatedAt = Date.parse(asset.generatedAt || "");

  if (!Number.isFinite(generatedAt)) {
    return true;
  }

  return Date.now() - generatedAt >= PREVIEW_RETRY_INTERVAL_MS;
}

async function ensurePreviewAsset(payload, variant, options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  const existing = getPreviewAsset(payload, variant);

  if (existing && !forceRefresh) {
    return { asset: existing, payload };
  }

  return withActionLock(`preview-image:${payload.requestId}:${variant}`, async () => {
    const refreshedPayload = await getStoredResult(payload.requestId);
    const refreshedExisting = getPreviewAsset(refreshedPayload || payload, variant);

    if (refreshedExisting && (!forceRefresh || refreshedExisting.status === "generated")) {
      return { asset: refreshedExisting, payload: refreshedPayload || payload };
    }

    let asset;

    try {
      const { buffer, contentType, prompt } = await fetchPreviewImage(refreshedPayload || payload, variant);
      asset = buildPreviewAssetFromBuffer(refreshedPayload || payload, variant, prompt, buffer, contentType);
      logEvent("preview_asset_generated", {
        requestId: payload.requestId,
        campaignId: payload.campaignId,
        variant,
        provider: asset.provider
      });
    } catch (error) {
      asset = buildPreviewAssetFromFallback(refreshedPayload || payload, variant);
      logEvent("preview_asset_fallback", {
        requestId: payload.requestId,
        campaignId: payload.campaignId,
        variant,
        message: error.message
      });
    }

    const nextPayload = {
      ...(refreshedPayload || payload),
      previewAssets: {
        ...((refreshedPayload || payload)?.previewAssets || {}),
        [variant]: asset
      }
    };

    const saved = await saveCampaign(nextPayload);
    const cached = cacheCampaign(saved || nextPayload);

    return { asset, payload: cached };
  });
}

function prewarmPreviewAssets(payload) {
  if (!payload?.requestId) {
    return;
  }

  for (const variant of ["desktop", "mobile"]) {
    ensurePreviewAsset(payload, variant).catch((error) => {
      logEvent("preview_asset_prewarm_error", {
        requestId: payload.requestId,
        campaignId: payload.campaignId,
        variant,
        message: error.message
      });
    });
  }
}

async function runCampaignPipeline(input, requestId, source = createSourceDescriptor({ type: "text", originalInput: input })) {
  const requestStartedAt = startTimer();
  const preparedSource = truncateModelInput(input);
  const socialPlatform = normalizeSocialPlatform(source?.socialPlatform);
  const socialLabel = getSocialPlatformLabel(socialPlatform);
  logEvent("campaign_started", {
    requestId,
    sourceType: source?.type || "text",
    socialPlatform,
    truncatedInput: preparedSource.truncated,
    originalLength: preparedSource.originalLength,
    finalLength: preparedSource.finalLength
  });

  publish(requestId, "lifecycle", {
    requestId,
    status: "started",
    message: "Campaign generation started."
  });
  if (preparedSource.truncated) {
    publish(requestId, "lifecycle", {
      requestId,
      status: "processing",
      message: "Source content exceeded the safe model window and was compressed for reliable processing."
    });
  }
  await delay(STREAM_BOOT_DELAY_MS);

  const stageTimings = {
    researcherMs: 0,
    writerMs: 0,
    editorMs: 0,
    inputTruncated: preparedSource.truncated,
    originalInputLength: preparedSource.originalLength,
    finalInputLength: preparedSource.finalLength
  };
  const agentMeta = {};

  const researcherStartedAt = startTimer();
  const researchRun = await runWithRecovery("Researcher", requestId, () => researcherAgent(preparedSource.text, { requestId }));
  const facts = researchRun.data;
  agentMeta.researcher = researchRun.meta;
  stageTimings.researcherMs = endTimer(researcherStartedAt);
  await delay(STAGE_TRANSITION_DELAY_MS);

  let attempts = 0;
  let feedback = "";
  let finalContent = null;
  let finalReview = null;

  while (attempts < MAX_ATTEMPTS) {
    attempts += 1;
    publish(requestId, "attempt", {
      requestId,
      attempt: attempts,
      message: `Writer attempt ${attempts} started.`
    });
    await delay(ATTEMPT_START_DELAY_MS);

    const writerStartedAt = startTimer();
    const operatorGuidance = getLatestOperatorGuidance(requestId);
    if (operatorGuidance) {
      publish(requestId, "attempt", {
        requestId,
        attempt: attempts,
        message: "Operator guidance is being applied to the next draft cycle."
      });
    }
    const writerRun = await runWithRecovery("Writer", requestId, () =>
      writerAgent(facts, feedback, { requestId, operatorGuidance, socialPlatform })
    );
    const draft = writerRun.data;
    agentMeta.writer = writerRun.meta;
    stageTimings.writerMs += endTimer(writerStartedAt);
    await delay(STAGE_TRANSITION_DELAY_MS);

    const editorStartedAt = startTimer();
    const editorRun = await runWithRecovery("Editor", requestId, () =>
      editorAgent(draft, facts, {
        requestId,
        attempt: attempts,
        maxAttempts: MAX_ATTEMPTS,
        previousFeedback: feedback,
        operatorGuidance,
        socialPlatform
      })
    );
    const review = editorRun.data;
    agentMeta.editor = editorRun.meta;
    stageTimings.editorMs += endTimer(editorStartedAt);
    await delay(STAGE_TRANSITION_DELAY_MS);

    finalContent = review.status === "APPROVED" ? mergeCampaignContent(review.content, draft) : mergeCampaignContent(draft, {});
    finalReview = review;

    if (review.status === "APPROVED") {
      break;
    }

    feedback = review.feedback || "Please improve clarity and align strictly with the facts.";
    await delay(RETRY_FEEDBACK_DELAY_MS);
  }

  publish(requestId, "complete", {
    requestId,
    status: finalReview?.status || "REJECTED",
    attempts,
    message: "Campaign generation finished."
  });

  const payload = buildCampaignState({
    campaignId: requestId,
    requestId,
    source,
    facts,
    content: finalContent,
    status: finalReview?.status || "REJECTED",
    reviewStatus: finalReview?.status || "REJECTED",
    approvals: getApprovals(requestId),
    approvalMeta: getApprovalMeta(requestId),
    deployment: getDeployment(requestId),
    telemetry: {
      requestStartedAt: new Date(requestStartedAt).toISOString(),
      requestCompletedAt: new Date().toISOString(),
      durationMs: endTimer(requestStartedAt),
      stageTimings,
      ambiguityCount: Array.isArray(facts?.ambiguities) ? facts.ambiguities.length : 0,
      featureCount: Array.isArray(facts?.features) ? facts.features.length : 0,
      audienceCount: Array.isArray(facts?.targetAudience) ? facts.targetAudience.length : 0,
      socialPlatform,
      socialPlatformLabel: socialLabel,
      platformReview: finalReview?.platformReview || {
        platform: socialPlatform,
        violations: [],
        riskLevel: finalReview?.status === "APPROVED" ? "low" : "medium"
      },
      ai: buildAiTelemetry(agentMeta),
      quality: buildQualityTelemetry(finalReview, attempts, MAX_ATTEMPTS)
    },
    revisionHistory: createEmptyRevisionHistory()
  });

  payload.attempts = attempts;
  payload.feedback = finalReview?.feedback || "";
  payload.manualInstructions = getManualInstructions(requestId);
  payload.pendingGuidance = getPendingGuidance(requestId);
  payload.lastAppliedGuidance = getLastAppliedGuidance(requestId);

  const savedPayload = await saveCampaign(payload);
  const cachedPayload = cacheCampaign(savedPayload || payload);
  prewarmPreviewAssets(cachedPayload);
  logEvent("campaign_completed", {
    requestId,
    campaignId: cachedPayload.campaignId,
    status: cachedPayload.status,
    reviewStatus: cachedPayload.reviewStatus,
    attempts
  });
  return cachedPayload;
}

router.get("/stream", (req, res) => {
  const requestId = req.query.requestId;

  if (!requestId || typeof requestId !== "string") {
    res.status(400).json({ error: "requestId query parameter is required." });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });

  addStream(requestId, res);
  publish(requestId, "connected", {
    requestId,
    message: "War room stream connected."
  });

  req.on("close", () => {
    removeStream(requestId, res);
  });
});

router.get("/preview-image", async (req, res) => {
  const requestId = req.query.requestId;
  const variant = req.query.variant === "mobile" ? "mobile" : "desktop";

  if (!requestId || typeof requestId !== "string") {
    res.status(400).json({ error: "requestId query parameter is required." });
    return;
  }

  const payload = await getStoredResult(requestId);

  if (!payload) {
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.send(buildFallbackSvg("Campaign Preview", variant));
    return;
  }

  try {
    const { asset } = await ensurePreviewAsset(payload, variant);
    res.setHeader("Content-Type", asset.contentType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(Buffer.from(asset.data, "base64"));
  } catch (error) {
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.send(buildFallbackSvg(getImageTitle(payload), variant));
  }
});

router.get("/preview-image-status", async (req, res) => {
  const requestId = req.query.requestId;
  const variant = req.query.variant === "mobile" ? "mobile" : "desktop";

  if (!requestId || typeof requestId !== "string") {
    res.status(400).json({ error: "requestId query parameter is required." });
    return;
  }

  const payload = await getStoredResult(requestId);

  if (!payload) {
    res.json({
      ready: false,
      status: "missing",
      variant
    });
    return;
  }

  const asset = getPreviewAsset(payload, variant);

  if (!asset) {
    ensurePreviewAsset(payload, variant).catch((error) => {
      logEvent("preview_asset_status_error", {
        requestId,
        campaignId: payload.campaignId,
        variant,
        message: error.message
      });
    });

    res.json({
      ready: false,
      status: "pending",
      variant
    });
    return;
  }

  if (shouldRetryPreviewAsset(asset)) {
    ensurePreviewAsset(payload, variant, { forceRefresh: true }).catch((error) => {
      logEvent("preview_asset_retry_error", {
        requestId,
        campaignId: payload.campaignId,
        variant,
        message: error.message
      });
    });
  }

  res.json({
    ready: asset.status === "generated",
    status: asset.status || "pending",
    provider: asset.provider || null,
    generatedAt: asset.generatedAt || null,
    variant
  });
});

router.post("/", async (req, res, next) => {
  try {
    const input = requireNonEmptyString(req.body?.input, "input");
    const requestId = req.body?.requestId || crypto.randomUUID();
    const sourceOverride = req.body?.source;
    const sourceDescriptor =
      sourceOverride && typeof sourceOverride === "object"
        ? createSourceDescriptor({
            type: ["text", "pdf", "url"].includes(sourceOverride.type) ? sourceOverride.type : "text",
            label: typeof sourceOverride.label === "string" ? sourceOverride.label : "",
            originalInput: typeof sourceOverride.originalInput === "string" ? sourceOverride.originalInput : input,
            extractedText: typeof sourceOverride.extractedText === "string" ? sourceOverride.extractedText : input,
            socialPlatform: normalizeSocialPlatform(sourceOverride.socialPlatform)
          })
        : createSourceDescriptor({
            type: "text",
            label: "Pasted source",
            originalInput: input,
            extractedText: input,
            socialPlatform: normalizeSocialPlatform(req.body?.socialPlatform)
          });

    const payload = await withActionLock(`generate:${requestId}`, () =>
      runCampaignPipeline(input, requestId, sourceDescriptor)
    );
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.post("/upload", upload.single("file"), async (req, res, next) => {
  try {
    const requestId = req.body?.requestId || crypto.randomUUID();
    const file = req.file;
    const socialPlatform = normalizeSocialPlatform(req.body?.socialPlatform);

    if (!file) {
      throw badRequest("Please upload a PDF file.");
    }

    const isPdfMime = file.mimetype === "application/pdf";
    const isPdfName = file.originalname?.toLowerCase().endsWith(".pdf");

    if (!isPdfMime && !isPdfName) {
      throw badRequest("Only PDF uploads are supported right now.");
    }

    publish(requestId, "lifecycle", {
      requestId,
      status: "started",
      message: `PDF upload received: ${file.originalname}`
    });

    const payload = await withActionLock(`generate:${requestId}`, async () => {
      const extractedText = await extractPdfText(file.buffer);

      if (!extractedText.trim()) {
        throw badRequest("No extractable text was found in this PDF.");
      }

      publish(requestId, "lifecycle", {
        requestId,
        status: "processing",
        message: "PDF text extracted successfully. Starting campaign generation."
      });

      const generatedPayload = await runCampaignPipeline(
        extractedText,
        requestId,
        createSourceDescriptor({
          type: "pdf",
          label: file.originalname,
          originalInput: file.originalname,
          extractedText,
          socialPlatform
        })
      );

      return {
        ...generatedPayload,
        uploadedFile: {
          name: file.originalname,
          size: file.size,
          mimeType: file.mimetype
        },
        extractedText
      };
    });
    res.json({
      ...payload
    });
  } catch (error) {
    next(error);
  }
});

router.post("/extract-pdf", upload.single("file"), async (req, res, next) => {
  try {
    const file = req.file;

    if (!file) {
      throw badRequest("Please upload a PDF file.");
    }

    const isPdfMime = file.mimetype === "application/pdf";
    const isPdfName = file.originalname?.toLowerCase().endsWith(".pdf");

    if (!isPdfMime && !isPdfName) {
      throw badRequest("Only PDF uploads are supported right now.");
    }

    const extractedText = await withTimeout("PDF extraction", () => extractPdfText(file.buffer), 20000);

    if (!extractedText.trim()) {
      throw badRequest("No extractable text was found in this PDF.");
    }

    res.json({
      extractedText,
      uploadedFile: {
        name: file.originalname,
        size: file.size,
        mimeType: file.mimetype
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post("/url", async (req, res, next) => {
  try {
    const url = requireNonEmptyString(req.body?.url, "url");
    const requestId = req.body?.requestId || crypto.randomUUID();
    const socialPlatform = normalizeSocialPlatform(req.body?.socialPlatform);

    publish(requestId, "lifecycle", {
      requestId,
      status: "started",
      message: `URL source received: ${url}`
    });

    const payload = await withActionLock(`generate:${requestId}`, async () => {
      const extracted = await withTimeout("URL extraction", () => extractUrlText(url.trim()), 20000);

      publish(requestId, "lifecycle", {
        requestId,
        status: "processing",
        message: "URL content extracted successfully. Starting campaign generation."
      });

      const generatedPayload = await runCampaignPipeline(
        extracted.extractedText,
        requestId,
        createSourceDescriptor({
          type: "url",
          label: extracted.title,
          originalInput: extracted.finalUrl,
          extractedText: extracted.extractedText,
          socialPlatform
        })
      );

      return {
        ...generatedPayload,
        extractedText: extracted.extractedText,
        sourceUrl: extracted.finalUrl
      };
    });

    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.post("/regenerate", async (req, res, next) => {
  try {
    const channel = requireOneOf(req.body?.channel, "channel", ["blog", "tweets", "email"]);
    const facts = requireObject(req.body?.facts, "facts");
    const currentContent = req.body?.currentContent;
    const requestId = requireNonEmptyString(req.body?.requestId, "requestId");

    const existing = await getStoredResult(requestId);
    if (!existing) {
      throw notFound("Campaign not found for regeneration.");
    }
    assertUnlocked([`generate:${requestId}`, `pipeline:${requestId}`, `deploy:${requestId}`]);
    const previousApprovals = existing?.approvals || getApprovals(requestId);
    const previousDeployment = existing?.deployment || getDeployment(requestId);
    const previousRevisionHistory = existing?.revisionHistory || createEmptyRevisionHistory();
    const hadApprovedBaseline = existing?.status === "APPROVED" && existing?.content;
    const socialPlatform = normalizeSocialPlatform(existing?.source?.socialPlatform);
    const currentChannelContent = getChannelContent(existing?.content || currentContent, channel);
    const latestRevision = Array.isArray(previousRevisionHistory?.[channel]) && previousRevisionHistory[channel].length
      ? previousRevisionHistory[channel][previousRevisionHistory[channel].length - 1]
      : null;
    const priorRegenerationFeedback = latestRevision?.feedback || existing?.feedback || "";

    const channelLabel = channel === "tweets" ? `${getSocialPlatformLabel(socialPlatform).toLowerCase()}` : channel === "email" ? "email teaser" : "blog post";
    const baseFeedback =
      channel === "email"
        ? "Regenerate only the email teaser. Return a clear email-style asset with a concise subject line, a short preview line, and a brief body made of 2-3 compact paragraphs. Do not use all caps, placeholders like [Name], or generic filler."
        : `Regenerate only the ${channelLabel}. Keep every claim grounded in the provided facts and improve specificity, clarity, and structure for this one asset.`;

    const { payload, nextStoredCampaign } = await withActionLock(`regenerate:${requestId}:${channel}`, async () => {
      const pendingGuidance = getPendingGuidance(requestId);
      const operatorGuidance = pendingGuidance?.message || getLatestOperatorGuidance(requestId);
      const appliedGuidance = pendingGuidance || (operatorGuidance ? getLatestOperatorInstruction(requestId) : null);
      let regenerateAttempt = 0;
      let review = null;
      let reviewedContent = null;
      let draft = null;
      let lastFeedback = priorRegenerationFeedback;
      const agentMeta = {};

      publish(requestId, "attempt", {
        requestId,
        attempt: "regenerate",
        message: `Targeted ${channelLabel} rewrite started. The Gatekeeper will review only this channel while the other approved assets stay intact.`
      });
      if (pendingGuidance) {
        publish(requestId, "attempt", {
          requestId,
          attempt: "regenerate",
          message: "Pending operator guidance is being applied to this targeted rewrite."
        });
      }

      while (regenerateAttempt < REGENERATE_MAX_ATTEMPTS) {
        regenerateAttempt += 1;
        publish(requestId, "attempt", {
          requestId,
          attempt: `regenerate-${regenerateAttempt}`,
          message: `Targeted rewrite attempt ${regenerateAttempt}/${REGENERATE_MAX_ATTEMPTS} for ${channelLabel}.`
        });
        await delay(ATTEMPT_START_DELAY_MS);

        const combinedFeedback = [baseFeedback, lastFeedback].filter(Boolean).join("\n\n");
        const writerRun = await runWithRecovery("Writer", requestId, () =>
          writerAgent(facts, combinedFeedback, {
            requestId,
            operatorGuidance,
            channel: channelLabel,
            currentChannelContent,
            approvedBaselineExists: hadApprovedBaseline,
            socialPlatform
          })
        );
        draft = writerRun.data;
        agentMeta.writer = writerRun.meta;
        await delay(REGENERATE_REVIEW_DELAY_MS);
        const editorRun = await runWithRecovery("Editor", requestId, () =>
          editorAgent(draft, facts, {
            requestId,
            attempt: regenerateAttempt,
            maxAttempts: REGENERATE_MAX_ATTEMPTS,
            previousFeedback: combinedFeedback,
            operatorGuidance,
            channel: channelLabel,
            targetedRegeneration: true,
            approvedBaselineExists: hadApprovedBaseline,
            approvedBaselineContent: currentChannelContent,
            socialPlatform
          })
        );
        review = editorRun.data;
        agentMeta.editor = editorRun.meta;

        reviewedContent = review.status === "APPROVED" ? mergeCampaignContent(review.content, draft) : mergeCampaignContent(draft, {});

        if (review.status === "APPROVED") {
          break;
        }

        lastFeedback = review.feedback || combinedFeedback;
        await delay(RETRY_FEEDBACK_DELAY_MS);
      }

      const nextApprovals =
        review.status === "APPROVED"
          ? {
              ...previousApprovals,
              [channel]: false
            }
          : previousApprovals;
      const previousApprovalMeta = existing?.approvalMeta || getApprovalMeta(requestId);
      const nextApprovalMeta = review.status === "APPROVED"
        ? {
            ...previousApprovalMeta,
            [channel]: {
              approved: false,
              type: null,
              note: "",
              approvedAt: null
            }
          }
        : previousApprovalMeta;
      const preservedPrevious = review.status !== "APPROVED" && hadApprovedBaseline;
      const content = preservedPrevious
        ? normalizeCampaignContent(existing.content)
        : replaceChannelContent(currentContent, reviewedContent, channel);
      const campaignStatus = preservedPrevious ? existing.status : review.status;

      approvalStore.set(requestId, nextApprovals);
      approvalMetaStore.set(requestId, nextApprovalMeta);
      pendingGuidanceStore.set(requestId, null);
      lastAppliedGuidanceStore.set(requestId, appliedGuidance);

      const payload = {
        campaignId: existing?.campaignId || requestId,
        requestId,
        source: existing?.source || null,
        facts,
        channel,
        content,
        status: campaignStatus,
        reviewStatus: preservedPrevious ? "REJECTED_PRESERVED" : review.status === "APPROVED" ? "APPROVED" : "REJECTED_UNAPPROVED",
        feedback: preservedPrevious ? existing?.feedback || "" : review.feedback || "",
        regenerationFeedback: review.feedback || "",
        approved: review.status === "APPROVED",
        preservedPrevious,
        attempts: regenerateAttempt,
        approvals: nextApprovals,
        approvalMeta: nextApprovalMeta,
        deployment: previousDeployment,
        telemetry: preservedPrevious
          ? existing?.telemetry || {}
          : {
              ...(existing?.telemetry || {}),
              ai: buildAiTelemetry({
                researcher: existing?.telemetry?.ai?.agents?.researcher || null,
                ...agentMeta
              }),
              socialPlatform,
              socialPlatformLabel: getSocialPlatformLabel(socialPlatform),
              platformReview: review?.platformReview || existing?.telemetry?.platformReview || {
                platform: socialPlatform,
                violations: [],
                riskLevel: review?.status === "APPROVED" ? "low" : "medium"
              },
              quality: buildQualityTelemetry(review, 1, 1)
            },
        revisionHistory: appendRevision(previousRevisionHistory, channel, {
          reviewStatus: review.status,
          campaignStatus,
          preservedPrevious,
          feedback: review.feedback || "",
          content: reviewedContent
        }),
        manualInstructions: getManualInstructions(requestId),
        pendingGuidance: null,
        lastAppliedGuidance: appliedGuidance
      };

      const nextStoredCampaign = {
        ...existing,
        reviewStatus: payload.reviewStatus,
        content,
        status: campaignStatus,
        feedback: preservedPrevious ? existing?.feedback || "" : review.feedback || "",
        approvals: nextApprovals,
        approvalMeta: nextApprovalMeta,
        deployment: previousDeployment,
        telemetry: payload.telemetry,
        revisionHistory: payload.revisionHistory,
        manualInstructions: payload.manualInstructions,
        pendingGuidance: payload.pendingGuidance,
        lastAppliedGuidance: payload.lastAppliedGuidance
      };

      return { payload, nextStoredCampaign };
    });

    const savedCampaign = await saveCampaign(nextStoredCampaign);
    const cachedCampaign = cacheCampaign(savedCampaign || nextStoredCampaign);
    if (!payload.preservedPrevious) {
      prewarmPreviewAssets(cachedCampaign);
    }

    logEvent("campaign_regenerated", {
      requestId,
      campaignId: payload.campaignId,
      channel,
      reviewStatus: payload.reviewStatus,
      preservedPrevious: payload.preservedPrevious
    });

    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.post("/approve", async (req, res, next) => {
  try {
  const requestId = requireNonEmptyString(req.body?.requestId, "requestId");
  const channel = requireOneOf(req.body?.channel, "channel", ["blog", "tweets", "email"]);
  assertUnlocked([`generate:${requestId}`, `pipeline:${requestId}`, `deploy:${requestId}`]);

  const approvals = {
    ...getApprovals(requestId),
    [channel]: true
  };
  const approvalMeta = {
    ...getApprovalMeta(requestId),
    [channel]: {
      approved: true,
      type: "editor",
      note: "Approved after Gatekeeper review.",
      approvedAt: new Date().toISOString()
    }
  };

  approvalStore.set(requestId, approvals);
  approvalMetaStore.set(requestId, approvalMeta);

  const existing = await getStoredResult(requestId);
  if (!existing) {
    throw notFound("Campaign not found.");
  }

  const nextStoredCampaign = {
    ...existing,
    approvals,
    approvalMeta,
    reviewStatus: existing.reviewStatus || existing.status
  };

  const savedCampaign = await saveCampaign(nextStoredCampaign);
  cacheCampaign(savedCampaign || nextStoredCampaign);

  logEvent("campaign_channel_approved", {
    requestId,
    campaignId: existing.campaignId,
    channel
  });

  res.json({
    requestId,
    channel,
    approvals,
    approvalMeta
  });
  } catch (error) {
    next(error);
  }
});

router.post("/manual-override", async (req, res, next) => {
  try {
    const requestId = requireNonEmptyString(req.body?.requestId, "requestId");
    const channel = requireOneOf(req.body?.channel, "channel", ["blog", "tweets", "email"]);
    const note = requireNonEmptyString(req.body?.note, "note");
    assertUnlocked([`generate:${requestId}`, `pipeline:${requestId}`, `deploy:${requestId}`]);

    const existing = await getStoredResult(requestId);
    if (!existing) {
      throw notFound("Campaign not found.");
    }

    const approvals = {
      ...getApprovals(requestId),
      [channel]: true
    };
    const approvalMeta = {
      ...getApprovalMeta(requestId),
      [channel]: {
        approved: true,
        type: "manual",
        note,
        approvedAt: new Date().toISOString()
      }
    };

    approvalStore.set(requestId, approvals);
    approvalMetaStore.set(requestId, approvalMeta);

    const nextRevisionHistory = appendRevision(existing.revisionHistory || createEmptyRevisionHistory(), channel, {
      reviewStatus: "MANUAL_OVERRIDE",
      campaignStatus: existing.status,
      preservedPrevious: false,
      feedback: note,
      content: existing.content
    });

    const nextStoredCampaign = {
      ...existing,
      approvals,
      approvalMeta,
      revisionHistory: nextRevisionHistory
    };

    const savedCampaign = await saveCampaign(nextStoredCampaign);
    cacheCampaign(savedCampaign || nextStoredCampaign);

    logEvent("campaign_manual_override", {
      requestId,
      campaignId: existing.campaignId,
      channel
    });

    res.json({
      requestId,
      channel,
      approvals,
      approvalMeta,
      revisionHistory: nextRevisionHistory
    });
  } catch (error) {
    next(error);
  }
});

router.post("/operator-input", async (req, res, next) => {
  try {
    const requestId = requireNonEmptyString(req.body?.requestId, "requestId");
    const message = requireNonEmptyString(req.body?.message, "message");
    const nextInstruction = createOperatorInstruction(message);
    const instructions = [...getManualInstructions(requestId), nextInstruction];
    const processing = isCampaignProcessing(requestId);

    instructionStore.set(requestId, instructions);
    pendingGuidanceStore.set(requestId, processing ? getPendingGuidance(requestId) : nextInstruction);

    const existing = await getStoredResult(requestId);
    if (existing) {
      const nextStoredCampaign = {
        ...existing,
        manualInstructions: instructions,
        pendingGuidance: processing ? existing.pendingGuidance || null : nextInstruction,
        lastAppliedGuidance: existing.lastAppliedGuidance || getLastAppliedGuidance(requestId)
      };
      const savedCampaign = await saveCampaign(nextStoredCampaign);
      cacheCampaign(savedCampaign || nextStoredCampaign);
    }

    publish(requestId, "attempt", {
      requestId,
      attempt: "operator",
      message: processing
        ? "Operator guidance received and queued for the next draft or review cycle."
        : "Operator guidance saved as pending revision guidance for the next targeted rewrite."
    });

    logEvent("campaign_operator_input", {
      requestId,
      message
    });

    res.json({
      requestId,
      manualInstructions: instructions,
      pendingGuidance: processing ? getPendingGuidance(requestId) : nextInstruction,
      lastAppliedGuidance: getLastAppliedGuidance(requestId)
    });
  } catch (error) {
    next(error);
  }
});

router.post("/deploy", async (req, res, next) => {
  try {
  const requestId = requireNonEmptyString(req.body?.requestId, "requestId");
  assertUnlocked([`generate:${requestId}`, `pipeline:${requestId}`]);
  const approvals = getApprovals(requestId);
  const approvedChannels = Object.entries(approvals)
    .filter(([, approved]) => approved)
    .map(([channel]) => channel);
  if (!approvedChannels.length) {
    throw badRequest("Approve at least one channel before deployment.");
  }

  const existing = await getStoredResult(requestId);
  if (!existing) {
    throw notFound("Campaign not found.");
  }

  const deployment = await withActionLock(`deploy:${requestId}`, async () => {
    const nextDeployment = {
      deployed: true,
      deployedAt: new Date().toISOString(),
      deployedChannels: approvedChannels
    };

    deploymentStore.set(requestId, nextDeployment);

    const nextStoredCampaign = {
      ...existing,
      deployment: nextDeployment,
      reviewStatus: existing.reviewStatus || existing.status
    };

    const savedCampaign = await saveCampaign(nextStoredCampaign);
    cacheCampaign(savedCampaign || nextStoredCampaign);
    return nextDeployment;
  });

  logEvent("campaign_deployed", {
    requestId,
    campaignId: existing.campaignId,
    channels: approvedChannels
  });

  res.json({
    requestId,
    deployment
  });
  } catch (error) {
    next(error);
  }
});

export default router;
