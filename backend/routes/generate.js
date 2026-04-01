import { Router } from "express";
import crypto from "crypto";
import { researcherAgent } from "../agents/researcher.js";
import { writerAgent } from "../agents/writer.js";
import { editorAgent } from "../agents/editor.js";
import { addStream, publish, removeStream } from "../utils/requestEvents.js";
import { delay } from "../utils/delay.js";
import { mergeCampaignContent, normalizeCampaignContent } from "../utils/contentShape.js";

const router = Router();
const MAX_RETRIES = 2;
const UX_DELAY_MS = 900;
const AGENT_RETRY_LIMIT = 2;
const approvalStore = new Map();
const deploymentStore = new Map();

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

router.post("/", async (req, res, next) => {
  try {
    const input = req.body?.input;
    const requestId = req.body?.requestId || crypto.randomUUID();
    const requestStartedAt = startTimer();

    if (!input || typeof input !== "string" || !input.trim()) {
      return res.status(400).json({
        error: 'Request body must include a non-empty "input" string.'
      });
    }

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
      const review = await runWithRecovery("Editor", requestId, () => editorAgent(draft, facts, { requestId }));
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

    res.json({
      requestId,
      facts,
      content: finalContent,
      attempts,
      status: finalReview?.status || "REJECTED",
      feedback: finalReview?.feedback || "",
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

    approvalStore.set(requestId, {
      ...getApprovals(requestId),
      [channel]: false
    });

    const channelLabel = channel === "tweets" ? "social thread" : channel === "email" ? "email teaser" : "blog post";
    const feedback =
      channel === "email"
        ? "Regenerate only the email teaser. Return a clear email-style asset with a concise subject line, a short preview line, and a brief body made of 2-3 compact paragraphs. Do not use all caps, placeholders like [Name], or generic filler."
        : `Regenerate only the ${channelLabel}. Keep every claim grounded in the provided facts and improve specificity, clarity, and structure for this one asset.`;

    const draft = await runWithRecovery("Writer", requestId, () => writerAgent(facts, feedback, { requestId }));
    await delay(UX_DELAY_MS);
    const review = await runWithRecovery("Editor", requestId, () => editorAgent(draft, facts, { requestId }));

    const reviewedContent = review.status === "APPROVED" ? mergeCampaignContent(review.content, draft) : mergeCampaignContent(draft, {});
    const content = replaceChannelContent(currentContent, reviewedContent, channel);

    res.json({
      requestId,
      channel,
      content,
      status: review.status,
      feedback: review.feedback || "",
      approved: review.status === "APPROVED",
      approvals: getApprovals(requestId),
      deployment: getDeployment(requestId)
    });
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

  res.json({
    requestId,
    deployment
  });
});

export default router;
