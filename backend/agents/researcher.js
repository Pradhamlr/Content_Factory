import { groq, MODEL } from "../config/groq.js";
import { logAgentRun } from "../utils/agentLogger.js";
import { RESEARCHER_SYSTEM_PROMPT } from "../utils/prompts.js";
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
        content: RESEARCHER_SYSTEM_PROMPT
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
