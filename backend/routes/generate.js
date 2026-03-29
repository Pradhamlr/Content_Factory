import { Router } from "express";
import { researcherAgent } from "../agents/researcher.js";
import { writerAgent } from "../agents/writer.js";
import { editorAgent } from "../agents/editor.js";

const router = Router();
const MAX_RETRIES = 2;

router.post("/", async (req, res, next) => {
  try {
    const input = req.body?.input;

    if (!input || typeof input !== "string" || !input.trim()) {
      return res.status(400).json({
        error: 'Request body must include a non-empty "input" string.'
      });
    }

    const facts = await researcherAgent(input.trim());

    let attempts = 0;
    let feedback = "";
    let finalContent = null;
    let finalReview = null;

    while (attempts <= MAX_RETRIES) {
      attempts += 1;

      const draft = await writerAgent(facts, feedback);
      const review = await editorAgent(draft, facts);

      finalContent = review.content || draft;
      finalReview = review;

      if (review.status === "APPROVED") {
        break;
      }

      feedback = review.feedback || "Please improve clarity and align strictly with the facts.";
    }

    res.json({
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
