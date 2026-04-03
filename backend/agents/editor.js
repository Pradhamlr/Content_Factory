import { groq, MODEL } from "../config/groq.js";
import { logAgentRun } from "../utils/agentLogger.js";
import { safeJsonParse } from "../utils/safeJson.js";
import { publish } from "../utils/requestEvents.js";
import { normalizeCampaignContent } from "../utils/contentShape.js";

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
        content: `You are a strict Editor-in-Chief.

Reject if:
- content is generic
- value proposition is weak
- facts are not used properly
- tone is boring or repetitive
- content contains placeholders like [Name], [CTA], [Company], or bracketed template text
- content invents unsupported metrics, percentages, ROI, pricing, customer results, or case-study outcomes not present in the facts

Approve ONLY if:
- content is specific
- clearly uses facts
- compelling and structured
- email content is immediately usable and not templated

Return STRICT JSON:

If approved:
{
  "status": "APPROVED",
  "content": ...
}

If rejected:
{
  "status": "REJECTED",
  "feedback": "specific improvements needed"
}`
      },
      {
        role: "user",
        content: JSON.stringify({ facts, content })
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

  if (result.status === "APPROVED") {
    result.content = normalizeCampaignContent(result.content);
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
