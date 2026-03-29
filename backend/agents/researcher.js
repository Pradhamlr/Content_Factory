import { groq, MODEL } from "../config/groq.js";
import { logAgentRun } from "../utils/agentLogger.js";
import { safeJsonParse } from "../utils/safeJson.js";

export async function researcherAgent(input) {
  const response = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: `You are a research analyst. Extract truth from raw marketing or product text.
Return STRICT JSON only with this exact shape:
{
  "features": ["string"],
  "targetAudience": ["string"],
  "valueProposition": "string",
  "ambiguities": ["string"]
}
Do not add any explanation.`
      },
      {
        role: "user",
        content: input
      }
    ]
  });

  const content = response.choices?.[0]?.message?.content || "";
  const parsed = safeJsonParse(content);

  await logAgentRun("researcher", {
    model: MODEL,
    inputPreview: input.slice(0, 400),
    output: parsed
  });

  return parsed;
}
