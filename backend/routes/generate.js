import { Router } from "express";
import crypto from "crypto";
import { researcherAgent } from "../agents/researcher.js";
import { writerAgent } from "../agents/writer.js";
import { editorAgent } from "../agents/editor.js";
import { addStream, publish, removeStream } from "../utils/requestEvents.js";
import { delay } from "../utils/delay.js";

const router = Router();
const MAX_RETRIES = 2;
const UX_DELAY_MS = 900;

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

    const facts = await researcherAgent(input.trim(), { requestId });
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

      const draft = await writerAgent(facts, feedback, { requestId });
      await delay(UX_DELAY_MS);
      const review = await editorAgent(draft, facts, { requestId });
      await delay(UX_DELAY_MS);

      finalContent = review.content || draft;
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
      feedback: finalReview?.feedback || ""
    });
  } catch (error) {
    next(error);
  }
});

export default router;
