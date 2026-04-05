import { Router } from "express";
import crypto from "crypto";
import multer from "multer";
import { researcherAgent } from "../agents/researcher.js";
import { writerAgent } from "../agents/writer.js";
import { editorAgent } from "../agents/editor.js";
import { assertUnlocked, withActionLock } from "../utils/actionLocks.js";
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

const router = Router();
const MAX_RETRIES = 2;
const UX_DELAY_MS = 900;
const AGENT_RETRY_LIMIT = 2;
const AGENT_TIMEOUT_MS = 45000;
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

function buildQualityTelemetry(review, attempts = 1, maxAttempts = MAX_RETRIES + 1) {
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
    reviewStatus: review?.status || "PENDING"
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

      await delay(700);
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
  const titleLines = wrapSvgText(title, variant === "mobile" ? 22 : 30).map(escapeSvgText);
  const safeVariant = escapeSvgText(variant === "mobile" ? "SOCIAL VISUAL" : "BLOG HERO");
  const subtitle = escapeSvgText("Topic-aware branded fallback rendered locally.");
  const titleY = variant === "mobile" ? 350 : 320;
  const titleSize = variant === "mobile" ? 58 : 64;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900" viewBox="0 0 1400 900">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#081121"/>
      <stop offset="100%" stop-color="#0f1b34"/>
    </linearGradient>
    <radialGradient id="glow" cx="35%" cy="30%" r="40%">
      <stop offset="0%" stop-color="#00f0ff" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#00f0ff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="card" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#111a2e" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#091120" stop-opacity="0.98"/>
    </linearGradient>
  </defs>
  <rect width="1400" height="900" fill="url(#bg)"/>
  <rect x="72" y="72" width="1256" height="756" rx="28" fill="#ffffff" fill-opacity="0.02" stroke="#ffffff" stroke-opacity="0.08"/>
  <circle cx="500" cy="310" r="240" fill="url(#glow)"/>
  <rect x="160" y="178" width="240" height="44" rx="12" fill="#4f46e5"/>
  <text x="190" y="206" fill="#ffffff" font-family="Arial, sans-serif" font-size="24" font-weight="700">${safeVariant}</text>
  <g fill="#eff6ff" font-family="Arial, sans-serif" font-size="${titleSize}" font-weight="700">
    ${titleLines.map((line, index) => `<text x="160" y="${titleY + index * 78}">${line}</text>`).join("")}
  </g>
  <text x="160" y="${titleY + titleLines.length * 78 + 28}" fill="#94a3b8" font-family="Arial, sans-serif" font-size="32">${subtitle}</text>
  <rect x="160" y="560" width="920" height="180" rx="24" fill="url(#card)" stroke="#ffffff" stroke-opacity="0.06"/>
  <text x="210" y="626" fill="#94a3b8" font-family="Arial, sans-serif" font-size="24" font-weight="700">PREVIEW STATUS</text>
  <text x="210" y="682" fill="#eff6ff" font-family="Arial, sans-serif" font-size="42" font-weight="700">AI image provider unavailable right now</text>
  <text x="210" y="726" fill="#94a3b8" font-family="Arial, sans-serif" font-size="26">The app is still rendering a topic-driven fallback visual so the preview never appears broken.</text>
</svg>`;
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

  return { buffer, contentType };
}

async function runCampaignPipeline(input, requestId, source = createSourceDescriptor({ type: "text", originalInput: input })) {
  const requestStartedAt = startTimer();
  logEvent("campaign_started", {
    requestId,
    sourceType: source?.type || "text"
  });

  publish(requestId, "lifecycle", {
    requestId,
    status: "started",
    message: "Campaign generation started."
  });
  await delay(500);

  const stageTimings = {
    researcherMs: 0,
    writerMs: 0,
    editorMs: 0
  };

  const researcherStartedAt = startTimer();
  const facts = await runWithRecovery("Researcher", requestId, () => researcherAgent(input.trim(), { requestId }));
  stageTimings.researcherMs = endTimer(researcherStartedAt);
  await delay(UX_DELAY_MS);

  let attempts = 0;
  let feedback = "";
  let finalContent = null;
  let finalReview = null;

  while (attempts <= MAX_RETRIES) {
    attempts += 1;
    publish(requestId, "attempt", {
      requestId,
      attempt: attempts,
      message: `Writer attempt ${attempts} started.`
    });
    await delay(500);

    const writerStartedAt = startTimer();
    const operatorGuidance = getLatestOperatorGuidance(requestId);
    if (operatorGuidance) {
      publish(requestId, "attempt", {
        requestId,
        attempt: attempts,
        message: "Operator guidance is being applied to the next draft cycle."
      });
    }
    const draft = await runWithRecovery("Writer", requestId, () =>
      writerAgent(facts, feedback, { requestId, operatorGuidance })
    );
    stageTimings.writerMs += endTimer(writerStartedAt);
    await delay(UX_DELAY_MS);

    const editorStartedAt = startTimer();
    const review = await runWithRecovery("Editor", requestId, () =>
      editorAgent(draft, facts, {
        requestId,
        attempt: attempts,
        maxAttempts: MAX_RETRIES + 1,
        previousFeedback: feedback,
        operatorGuidance
      })
    );
    stageTimings.editorMs += endTimer(editorStartedAt);
    await delay(UX_DELAY_MS);

    finalContent = review.status === "APPROVED" ? mergeCampaignContent(review.content, draft) : mergeCampaignContent(draft, {});
    finalReview = review;

    if (review.status === "APPROVED") {
      break;
    }

    feedback = review.feedback || "Please improve clarity and align strictly with the facts.";
    await delay(700);
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
      quality: buildQualityTelemetry(finalReview, attempts)
    },
    revisionHistory: createEmptyRevisionHistory()
  });

  payload.attempts = attempts;
  payload.feedback = finalReview?.feedback || "";
  payload.manualInstructions = getManualInstructions(requestId);

  const savedPayload = await saveCampaign(payload);
  cacheCampaign(savedPayload || payload);
  logEvent("campaign_completed", {
    requestId,
    campaignId: (savedPayload || payload).campaignId,
    status: (savedPayload || payload).status,
    reviewStatus: (savedPayload || payload).reviewStatus,
    attempts
  });
  return savedPayload || payload;
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
  const title = getImageTitle(payload);

  if (!payload) {
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.send(buildFallbackSvg("Campaign Preview", variant));
    return;
  }

  try {
    const { buffer, contentType } = await fetchPreviewImage(payload, variant);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(buffer);
  } catch (error) {
    console.error(`Preview image fallback used for ${requestId}/${variant}:`, error.message);
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.send(buildFallbackSvg(title, variant));
  }
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
            extractedText: typeof sourceOverride.extractedText === "string" ? sourceOverride.extractedText : input
          })
        : createSourceDescriptor({
            type: "text",
            label: "Pasted source",
            originalInput: input,
            extractedText: input
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
          extractedText
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
          extractedText: extracted.extractedText
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

    const channelLabel = channel === "tweets" ? "social thread" : channel === "email" ? "email teaser" : "blog post";
    const feedback =
      channel === "email"
        ? "Regenerate only the email teaser. Return a clear email-style asset with a concise subject line, a short preview line, and a brief body made of 2-3 compact paragraphs. Do not use all caps, placeholders like [Name], or generic filler."
        : `Regenerate only the ${channelLabel}. Keep every claim grounded in the provided facts and improve specificity, clarity, and structure for this one asset.`;

    const { payload, nextStoredCampaign } = await withActionLock(`regenerate:${requestId}:${channel}`, async () => {
      const operatorGuidance = getLatestOperatorGuidance(requestId);
      const draft = await runWithRecovery("Writer", requestId, () => writerAgent(facts, feedback, { requestId, operatorGuidance }));
      await delay(UX_DELAY_MS);
      const review = await runWithRecovery("Editor", requestId, () =>
        editorAgent(draft, facts, {
          requestId,
          attempt: 1,
          maxAttempts: 1,
          previousFeedback: feedback,
          operatorGuidance
        })
      );

      const reviewedContent = review.status === "APPROVED" ? mergeCampaignContent(review.content, draft) : mergeCampaignContent(draft, {});
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
        approvals: nextApprovals,
        approvalMeta: nextApprovalMeta,
        deployment: previousDeployment,
        telemetry: preservedPrevious
          ? existing?.telemetry || {}
          : {
              ...(existing?.telemetry || {}),
              quality: buildQualityTelemetry(review, 1, 1)
            },
        revisionHistory: appendRevision(previousRevisionHistory, channel, {
          reviewStatus: review.status,
          campaignStatus,
          preservedPrevious,
          feedback: review.feedback || "",
          content: reviewedContent
        }),
        manualInstructions: getManualInstructions(requestId)
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
        manualInstructions: payload.manualInstructions
      };

      return { payload, nextStoredCampaign };
    });

    const savedCampaign = await saveCampaign(nextStoredCampaign);
    cacheCampaign(savedCampaign || nextStoredCampaign);

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

    instructionStore.set(requestId, instructions);

    const existing = await getStoredResult(requestId);
    if (existing) {
      const nextStoredCampaign = {
        ...existing,
        manualInstructions: instructions
      };
      const savedCampaign = await saveCampaign(nextStoredCampaign);
      cacheCampaign(savedCampaign || nextStoredCampaign);
    }

    publish(requestId, "attempt", {
      requestId,
      attempt: "operator",
      message: "Operator guidance received and queued for the next draft or review cycle."
    });

    logEvent("campaign_operator_input", {
      requestId,
      message
    });

    res.json({
      requestId,
      manualInstructions: instructions
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
