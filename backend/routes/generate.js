import { Router } from "express";
import crypto from "crypto";
import multer from "multer";
import { researcherAgent } from "../agents/researcher.js";
import { writerAgent } from "../agents/writer.js";
import { editorAgent } from "../agents/editor.js";
import { addStream, publish, removeStream } from "../utils/requestEvents.js";
import { delay } from "../utils/delay.js";
import { mergeCampaignContent, normalizeCampaignContent } from "../utils/contentShape.js";
import { extractPdfText } from "../utils/pdfExtractor.js";
import { appendRevision, buildCampaignState, createEmptyRevisionHistory, createSourceDescriptor } from "../utils/campaignState.js";

const router = Router();
const MAX_RETRIES = 2;
const UX_DELAY_MS = 900;
const AGENT_RETRY_LIMIT = 2;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});
const approvalStore = new Map();
const deploymentStore = new Map();
const resultStore = new Map();

function startTimer() {
  return Date.now();
}

function endTimer(startedAt) {
  return Date.now() - startedAt;
}

async function runWithRecovery(taskName, requestId, runner) {
  let lastError;

  for (let attempt = 1; attempt <= AGENT_RETRY_LIMIT; attempt += 1) {
    try {
      return await runner();
    } catch (error) {
      lastError = error;

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
  return approvalStore.get(requestId) || {
    blog: false,
    tweets: false,
    email: false
  };
}

function getDeployment(requestId) {
  return deploymentStore.get(requestId) || {
    deployed: false,
    deployedAt: null,
    deployedChannels: []
  };
}

function getStoredResult(requestId) {
  return resultStore.get(requestId) || null;
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
    const draft = await runWithRecovery("Writer", requestId, () => writerAgent(facts, feedback, { requestId }));
    stageTimings.writerMs += endTimer(writerStartedAt);
    await delay(UX_DELAY_MS);

    const editorStartedAt = startTimer();
    const review = await runWithRecovery("Editor", requestId, () =>
      editorAgent(draft, facts, {
        requestId,
        attempt: attempts,
        maxAttempts: MAX_RETRIES + 1,
        previousFeedback: feedback
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
    deployment: getDeployment(requestId),
    telemetry: {
      requestStartedAt: new Date(requestStartedAt).toISOString(),
      requestCompletedAt: new Date().toISOString(),
      durationMs: endTimer(requestStartedAt),
      stageTimings,
      ambiguityCount: Array.isArray(facts?.ambiguities) ? facts.ambiguities.length : 0,
      featureCount: Array.isArray(facts?.features) ? facts.features.length : 0,
      audienceCount: Array.isArray(facts?.targetAudience) ? facts.targetAudience.length : 0
    },
    revisionHistory: createEmptyRevisionHistory()
  });

  payload.attempts = attempts;
  payload.feedback = finalReview?.feedback || "";

  resultStore.set(requestId, payload);
  return payload;
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

  const payload = getStoredResult(requestId);
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
    const input = req.body?.input;
    const requestId = req.body?.requestId || crypto.randomUUID();

    if (!input || typeof input !== "string" || !input.trim()) {
      return res.status(400).json({
        error: 'Request body must include a non-empty "input" string.'
      });
    }

    const payload = await runCampaignPipeline(
      input,
      requestId,
      createSourceDescriptor({
        type: "text",
        label: "Pasted source",
        originalInput: input,
        extractedText: input
      })
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
      return res.status(400).json({ error: "Please upload a PDF file." });
    }

    const isPdfMime = file.mimetype === "application/pdf";
    const isPdfName = file.originalname?.toLowerCase().endsWith(".pdf");

    if (!isPdfMime && !isPdfName) {
      return res.status(400).json({ error: "Only PDF uploads are supported right now." });
    }

    publish(requestId, "lifecycle", {
      requestId,
      status: "started",
      message: `PDF upload received: ${file.originalname}`
    });

    const extractedText = await extractPdfText(file.buffer);

    if (!extractedText.trim()) {
      return res.status(400).json({ error: "No extractable text was found in this PDF." });
    }

    publish(requestId, "lifecycle", {
      requestId,
      status: "processing",
      message: "PDF text extracted successfully. Starting campaign generation."
    });

    const payload = await runCampaignPipeline(
      extractedText,
      requestId,
      createSourceDescriptor({
        type: "pdf",
        label: file.originalname,
        originalInput: file.originalname,
        extractedText
      })
    );
    res.json({
      ...payload,
      uploadedFile: {
        name: file.originalname,
        size: file.size,
        mimeType: file.mimetype
      },
      extractedText
    });
  } catch (error) {
    next(error);
  }
});

router.post("/extract-pdf", upload.single("file"), async (req, res, next) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "Please upload a PDF file." });
    }

    const isPdfMime = file.mimetype === "application/pdf";
    const isPdfName = file.originalname?.toLowerCase().endsWith(".pdf");

    if (!isPdfMime && !isPdfName) {
      return res.status(400).json({ error: "Only PDF uploads are supported right now." });
    }

    const extractedText = await extractPdfText(file.buffer);

    if (!extractedText.trim()) {
      return res.status(400).json({ error: "No extractable text was found in this PDF." });
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

router.post("/regenerate", async (req, res, next) => {
  try {
    const channel = req.body?.channel;
    const facts = req.body?.facts;
    const currentContent = req.body?.currentContent;
    const requestId = req.body?.requestId || crypto.randomUUID();

    if (!["blog", "tweets", "email"].includes(channel)) {
      return res.status(400).json({ error: 'Request body must include a valid "channel".' });
    }

    if (!facts || typeof facts !== "object") {
      return res.status(400).json({ error: 'Request body must include "facts".' });
    }

    const existing = getStoredResult(requestId);
    const previousApprovals = existing?.approvals || getApprovals(requestId);
    const previousDeployment = existing?.deployment || getDeployment(requestId);
    const previousRevisionHistory = existing?.revisionHistory || createEmptyRevisionHistory();
    const hadApprovedBaseline = existing?.status === "APPROVED" && existing?.content;

    const channelLabel = channel === "tweets" ? "social thread" : channel === "email" ? "email teaser" : "blog post";
    const feedback =
      channel === "email"
        ? "Regenerate only the email teaser. Return a clear email-style asset with a concise subject line, a short preview line, and a brief body made of 2-3 compact paragraphs. Do not use all caps, placeholders like [Name], or generic filler."
        : `Regenerate only the ${channelLabel}. Keep every claim grounded in the provided facts and improve specificity, clarity, and structure for this one asset.`;

    const draft = await runWithRecovery("Writer", requestId, () => writerAgent(facts, feedback, { requestId }));
    await delay(UX_DELAY_MS);
    const review = await runWithRecovery("Editor", requestId, () =>
      editorAgent(draft, facts, {
        requestId,
        attempt: 1,
        maxAttempts: 1,
        previousFeedback: feedback
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
    const preservedPrevious = review.status !== "APPROVED" && hadApprovedBaseline;
    const content = preservedPrevious
      ? normalizeCampaignContent(existing.content)
      : replaceChannelContent(currentContent, reviewedContent, channel);
    const campaignStatus = preservedPrevious ? existing.status : review.status;

    approvalStore.set(requestId, nextApprovals);

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
      deployment: previousDeployment,
      telemetry: existing?.telemetry || {},
      revisionHistory: appendRevision(previousRevisionHistory, channel, {
        reviewStatus: review.status,
        campaignStatus,
        preservedPrevious,
        feedback: review.feedback || "",
        content: reviewedContent
      })
    };

    if (existing) {
      resultStore.set(requestId, {
        ...existing,
        reviewStatus: payload.reviewStatus,
        content,
        status: campaignStatus,
        feedback: preservedPrevious ? existing?.feedback || "" : review.feedback || "",
        approvals: nextApprovals,
        deployment: previousDeployment,
        revisionHistory: payload.revisionHistory
      });
    }

    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.post("/approve", (req, res) => {
  const requestId = req.body?.requestId;
  const channel = req.body?.channel;

  if (!requestId || typeof requestId !== "string") {
    return res.status(400).json({ error: 'Request body must include "requestId".' });
  }

  if (!["blog", "tweets", "email"].includes(channel)) {
    return res.status(400).json({ error: 'Request body must include a valid "channel".' });
  }

  const approvals = {
    ...getApprovals(requestId),
    [channel]: true
  };

  approvalStore.set(requestId, approvals);

  const existing = getStoredResult(requestId);

  if (existing) {
    resultStore.set(requestId, {
      ...existing,
      approvals,
      reviewStatus: existing.reviewStatus || existing.status
    });
  }

  res.json({
    requestId,
    channel,
    approvals
  });
});

router.post("/deploy", (req, res) => {
  const requestId = req.body?.requestId;
  const approvals = getApprovals(requestId);
  const approvedChannels = Object.entries(approvals)
    .filter(([, approved]) => approved)
    .map(([channel]) => channel);

  if (!requestId || typeof requestId !== "string") {
    return res.status(400).json({ error: 'Request body must include "requestId".' });
  }

  if (!approvedChannels.length) {
    return res.status(400).json({ error: "Approve at least one channel before deployment." });
  }

  const deployment = {
    deployed: true,
    deployedAt: new Date().toISOString(),
    deployedChannels: approvedChannels
  };

  deploymentStore.set(requestId, deployment);

  const existing = getStoredResult(requestId);

  if (existing) {
    resultStore.set(requestId, {
      ...existing,
      deployment,
      reviewStatus: existing.reviewStatus || existing.status
    });
  }

  res.json({
    requestId,
    deployment
  });
});

export default router;
