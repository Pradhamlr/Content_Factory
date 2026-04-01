import { groq, MODEL } from "../config/groq.js";
import { logAgentRun } from "../utils/agentLogger.js";
import { safeJsonParse } from "../utils/safeJson.js";
import { publish } from "../utils/requestEvents.js";

export async function researcherAgent(input, context = {}) {
  if (context.requestId) {
    publish(context.requestId, "stage", {
      stage: "researcher",
      status: "running",
      message: "Analytical Brain is extracting the source of truth."
    });
  }

  const response = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: `You are a precise product research analyst.

Your job is to extract the truth from raw source material.

STRICT RULES:
- Use only what is explicitly supported by the input
- Do not infer extra features or claims
- Keep output specific, short, and usable by downstream agents
- Flag anything unclear or ambiguous

Extract:
- features
- target audience
- value proposition
- ambiguities

Return STRICT JSON only:
{
  "features": ["string"],
  "targetAudience": ["string"],
  "valueProposition": "string",
  "ambiguities": ["string"]
}

Do not add explanations, markdown, or extra keys.`
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
    requestId: context.requestId,
    model: MODEL,
    inputPreview: input.slice(0, 400),
    output: parsed
  });

  if (context.requestId) {
    publish(context.requestId, "stage", {
      stage: "researcher",
      status: "complete",
      message: "Analytical Brain completed extraction."
    });
  }

  return parsed;
}
