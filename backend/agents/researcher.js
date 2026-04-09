import { createChatCompletion, MODELS } from "../config/ai.js";
import { logAgentRun } from "../utils/agentLogger.js";
import { RESEARCHER_SYSTEM_PROMPT } from "../utils/prompts.js";
import { safeJsonParse } from "../utils/safeJson.js";
import { publish } from "../utils/requestEvents.js";

export async function researcherAgent(input, context = {}) {
  const model = MODELS.researcher;

  if (context.requestId) {
    publish(context.requestId, "stage", {
      stage: "researcher",
      status: "running",
      message: "Analytical Brain is extracting the source of truth."
    });
  }

  const response = await createChatCompletion(
    {
      model,
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
    },
    {
      agent: "researcher",
      requestId: context.requestId
    }
  );

  const content = response.choices?.[0]?.message?.content || "";
  const parsed = safeJsonParse(content);
  const meta = {
    provider: response._provider || "unknown",
    model: response._model || model,
    fallbackUsed: Boolean(response._fallbackUsed)
  };

  await logAgentRun("researcher", {
    requestId: context.requestId,
    ...meta,
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

  return {
    data: parsed,
    meta
  };
}
