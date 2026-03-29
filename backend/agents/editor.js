import { groq, MODEL } from "../config/groq.js";
import { logAgentRun } from "../utils/agentLogger.js";
import { safeJsonParse } from "../utils/safeJson.js";

export async function editorAgent(content, facts) {
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

Approve ONLY if:
- content is specific
- clearly uses facts
- compelling and structured

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

  await logAgentRun("editor", {
    model: MODEL,
    facts,
    submittedContent: content,
    output: result
  });

  return result;
}
