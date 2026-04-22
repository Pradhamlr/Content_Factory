import { createChatCompletion, MODELS } from "../config/ai.js";
import { logAgentRun } from "../utils/agentLogger.js";
import { EDITOR_SYSTEM_PROMPT } from "../utils/prompts.js";
import { safeJsonParse } from "../utils/safeJson.js";
import { publish } from "../utils/requestEvents.js";
import { normalizeCampaignContent } from "../utils/contentShape.js";
import { buildPlatformInstructionBlock, getSocialPlatformLabel, normalizeSocialPlatform } from "../utils/platformRules.js";
import { buildChannelReviewFeedback, hasBlockingChannelIssues, normalizeEditorReviews } from "../utils/platformValidation.js";

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

function feedbackSignalsSevereIssue(feedback = "") {
  const normalized = String(feedback).toLowerCase();

  return /unsupported|invented|hallucinat|placeholder|\[name\]|\[cta\]|false|incorrect|not grounded|factually wrong/.test(normalized);
}

function extractJsonStringField(rawText, fieldName) {
  const pattern = new RegExp(`"${fieldName}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "i");
  const match = String(rawText || "").match(pattern);

  if (!match) {
    return "";
  }

  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return match[1].replace(/\\"/g, "\"");
  }
}

function extractJsonNumberField(rawText, fieldName) {
  const pattern = new RegExp(`"${fieldName}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`, "i");
  const match = String(rawText || "").match(pattern);
  return match ? Number.parseFloat(match[1]) : Number.NaN;
}

function parseEditorResult(rawText, submittedContent) {
  try {
    return safeJsonParse(rawText);
  } catch (error) {
    const normalized = String(rawText || "").toLowerCase();

    if (normalized.includes('"status"') && normalized.includes("approved") && normalized.includes('"content"') && normalized.includes("{...}")) {
      return {
        status: "APPROVED",
        content: normalizeCampaignContent(submittedContent),
        confidence: normalizeConfidence(extractJsonNumberField(rawText, "confidence"), 0.78),
        reason:
          extractJsonStringField(rawText, "reason") ||
          "Approved by the Gatekeeper. The model returned a placeholder content object, so the submitted draft was used as the approved content."
      };
    }

    throw error;
  }
}

export async function editorAgent(content, facts, context = {}) {
  const model = MODELS.editor;
  const socialPlatform = normalizeSocialPlatform(context.socialPlatform);
  const socialLabel = getSocialPlatformLabel(socialPlatform);
  const platformInstructions = buildPlatformInstructionBlock(socialPlatform);

  if (context.requestId) {
    publish(context.requestId, "stage", {
      stage: "editor",
      status: "running",
      message: `The Gatekeeper is auditing the draft for specificity, fact use, and ${socialLabel} fit.`
    });
  }

  const response = await createChatCompletion(
    {
      model,
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
            channel: context.channel || "",
            socialPlatform,
            platformInstructions,
            targetedRegeneration: Boolean(context.targetedRegeneration),
            approvedBaselineExists: Boolean(context.approvedBaselineExists),
            approvedBaselineContent: context.approvedBaselineContent || null,
            facts,
            content,
            previousFeedback: context.previousFeedback || "",
            operatorGuidance: context.operatorGuidance || ""
          })
        }
      ]
    },
    {
      agent: "editor",
      requestId: context.requestId
    }
  );

  const result = parseEditorResult(response.choices?.[0]?.message?.content || "", content);
  const meta = {
    provider: response._provider || "unknown",
    model: response._model || model,
    fallbackUsed: Boolean(response._fallbackUsed)
  };
  const normalizedReviews = normalizeEditorReviews(result, content, socialPlatform);
  const platformReview = normalizedReviews.platformReview;
  const channelReviews = normalizedReviews.channelReviews;

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

  const shouldApproveReasonableRewrite =
    Boolean(context.targetedRegeneration) &&
    Boolean(context.approvedBaselineExists) &&
    (context.attempt || 1) >= (context.maxAttempts || 1) &&
    result.status === "REJECTED" &&
    !feedbackSignalsSevereIssue(result.feedback);

  if (mustConverge) {
    result.status = "APPROVED";
    result.content = normalizeCampaignContent(content);
    result.reason = "Approved on the final allowed attempt because the content is reasonable given the available facts and the missing proof data was not present in the input.";
    result.confidence = normalizeConfidence(result.confidence, 0.74);
    delete result.feedback;
  }

  if (shouldApproveReasonableRewrite) {
    result.status = "APPROVED";
    result.content = normalizeCampaignContent(content);
    result.reason =
      "Approved on the final targeted regeneration pass because the rewrite is factually grounded and reasonably comparable to the approved baseline.";
    result.confidence = normalizeConfidence(result.confidence, 0.76);
    delete result.feedback;
  }

  if (result.status === "APPROVED") {
    result.content = normalizeCampaignContent(result.content || content);
  }

  result.platformReview = platformReview;
  result.channelReviews = channelReviews;
  result.confidence = normalizeConfidence(result.confidence, result.status === "APPROVED" ? 0.82 : 0.48);

  if (result.status === "APPROVED" && hasBlockingChannelIssues(channelReviews)) {
    result.status = "REJECTED";
    result.feedback =
      buildChannelReviewFeedback(channelReviews) ||
      `The draft is still not strong enough for ${socialLabel} and needs another refinement pass.`;
    delete result.content;
  }

  if (result.status === "REJECTED" && !result.feedback) {
    result.feedback =
      buildChannelReviewFeedback(channelReviews) ||
      `The draft needs stronger channel alignment before it is ready for ${socialLabel}.`;
  }

  await logAgentRun("editor", {
    requestId: context.requestId,
    ...meta,
    socialPlatform,
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

  return {
    data: result,
    meta
  };
}
