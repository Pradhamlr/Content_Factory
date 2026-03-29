import { groq, MODEL } from "../config/groq.js";
import { safeJsonParse } from "../utils/safeJson.js";

export async function editorAgent(content, facts) {
  const response = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content: `You are an editor and quality gate.
Validate the content against the facts for hallucinations, tone, and clarity.
Return STRICT JSON only with this exact shape:
{
  "status": "APPROVED" or "REJECTED",
  "content": {
    "blog": "string",
    "tweets": ["string"],
    "email": "string"
  },
  "feedback": "string"
}
If approved, return the original content in the content field.
If rejected, keep the submitted content in the content field and provide concise actionable feedback.`
      },
      {
        role: "user",
        content: JSON.stringify({ facts, content })
      }
    ]
  });

  const result = safeJsonParse(response.choices?.[0]?.message?.content || "");

  if (!result.status || !result.content) {
    throw new Error("Editor agent returned an invalid response shape.");
  }

  return result;
}
