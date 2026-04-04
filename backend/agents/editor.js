import { groq, MODEL } from "../config/groq.js";
import { logAgentRun } from "../utils/agentLogger.js";
import { EDITOR_SYSTEM_PROMPT } from "../utils/prompts.js";
import { safeJsonParse } from "../utils/safeJson.js";
import { publish } from "../utils/requestEvents.js";
import { normalizeCampaignContent } from "../utils/contentShape.js";

function factsContainExternalProofData(facts) {
  const serializedFacts = JSON.stringify(facts || {}).toLowerCase();

  return (
    /\b\d+(?:\.\d+)?\s?(?:%|percent|roi|revenue|latency|ms|gb|users?|customers?)\b/.test(serializedFacts) ||
    /case stud|testimonial|customer story|success story|benchmark|performance data|adoption data/.test(serializedFacts)
  );
}

function feedbackDemandsMissingProof(feedback = "") {
  const normalized = String(feedback).toLowerCase();

  return /metric|percentage|roi|performance data|case stud|testimonial|customer story|benchmark|quantitative|numerical/.test(normalized);
}

function normalizeConfidence(value, fallback = 0.5) {
  const numeric = typeof value === "number" ? value : Number.parseFloat(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, numeric));
}

export async function editorAgent(content, facts, context = {}) {
  if (context.requestId) {
    publish(context.requestId, "stage", {
      stage: "editor",
      status: "running",
      message: "The Gatekeeper is auditing the draft for specificity and fact use."
    });
  }

  const response = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content: EDITOR_SYSTEM_PROMPT
      },
      {
        role: "user",
        content: JSON.stringify({
          attempt: context.attempt || 1,
          maxAttempts: context.maxAttempts || 1,
          facts,
          content,
          previousFeedback: context.previousFeedback || ""
        })
      }
    ]
  });

  const result = safeJsonParse(response.choices?.[0]?.message?.content || "");

  if (!result.status) {
    throw new Error("Editor agent returned an invalid response shape.");
  }

  if (result.status === "APPROVED" && !result.content) {
    throw new Error("Editor agent approved content without returning content.");
  }

  if (result.status === "REJECTED" && !result.feedback) {
    throw new Error("Editor agent rejected content without feedback.");
  }

  const mustConverge =
    (context.attempt || 1) >= (context.maxAttempts || 1) &&
    !factsContainExternalProofData(facts) &&
    result.status === "REJECTED" &&
    feedbackDemandsMissingProof(result.feedback);

  if (mustConverge) {
    result.status = "APPROVED";
    result.content = normalizeCampaignContent(content);
    result.reason = "Approved on the final allowed attempt because the content is reasonable given the available facts and the missing proof data was not present in the input.";
    result.confidence = normalizeConfidence(result.confidence, 0.74);
    delete result.feedback;
  }

  if (result.status === "APPROVED") {
    result.content = normalizeCampaignContent(result.content || content);
  }

  result.confidence = normalizeConfidence(result.confidence, result.status === "APPROVED" ? 0.82 : 0.48);

  await logAgentRun("editor", {
    requestId: context.requestId,
    model: MODEL,
    facts,
    submittedContent: content,
    output: result
  });

  if (context.requestId) {
    publish(context.requestId, "stage", {
      stage: "editor",
      status: result.status === "APPROVED" ? "complete" : "rejected",
      message:
        result.status === "APPROVED"
          ? "The Gatekeeper approved the campaign output."
          : result.feedback || "The Gatekeeper rejected the draft."
    });
  }

  return result;
}
