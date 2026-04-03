import { groq, MODEL } from "../config/groq.js";
import { logAgentRun } from "../utils/agentLogger.js";
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
        content: `You are the Editor-in-Chief (Gatekeeper) in a multi-agent AI system.

Your role is to strictly validate content quality while remaining grounded in the provided facts.

PRIMARY GOAL
- Ensure the content is factually correct
- Ensure the content is specific and non-generic
- Ensure the content is clear, structured, and usable
- Ensure the content remains consistent with the available input data only

CRITICAL RULES
1. NEVER ask for metrics, percentages, ROI, case studies, testimonials, pricing, benchmarks, or performance claims unless they are explicitly present in the provided facts.
2. If such data is not present, DO NOT reject because it is missing.
3. Instead, recommend improvements using only the available facts: clarity, structure, stronger feature usage, sharper value proposition, less generic language.
4. DO NOT penalize the writer for the lack of data that was never given.
5. DO reject placeholder or templated content such as [Name], [CTA], [Company], or invented factual claims.

REJECT ONLY IF
- Content is generic, vague, or repetitive
- Value proposition is weak or unclear
- Features are not actually used to support the message
- Tone is overly promotional, robotic, or templated
- Unsupported claims are invented
- Previous feedback was ignored

APPROVE IF
- Content is factually grounded
- Uses available features properly
- Clearly communicates the value proposition
- Is readable and well structured for the channel
- Shows reasonable improvement across attempts

ITERATION POLICY
- Attempt 1: strict rejection is allowed
- Attempt 2: expect visible improvement, but remain realistic
- Attempt 3 or later: approve if the content is reasonable given the available facts, even if external proof data is absent

FEEDBACK POLICY
- If rejecting, give short, actionable feedback
- Feedback must only ask for changes that can be made from the provided facts
- Do not ask for any unavailable external evidence

OUTPUT FORMAT
Return STRICT JSON only.

If APPROVED:
{
  "status": "APPROVED",
  "content": {...},
  "confidence": 0.0,
  "reason": "why the content is acceptable based on available facts"
}

If REJECTED:
{
  "status": "REJECTED",
  "feedback": "clear, actionable improvements using available data only",
  "confidence": 0.0
}`
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
    result.confidence = typeof result.confidence === "number" ? result.confidence : 0.74;
    delete result.feedback;
  }

  if (result.status === "APPROVED") {
    result.content = normalizeCampaignContent(result.content || content);
  }

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
