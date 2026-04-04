import { groq, MODEL } from "../config/groq.js";
import { logAgentRun } from "../utils/agentLogger.js";
import { WRITER_SYSTEM_PROMPT } from "../utils/prompts.js";
import { safeJsonParse } from "../utils/safeJson.js";
import { publish } from "../utils/requestEvents.js";
import { normalizeCampaignContent } from "../utils/contentShape.js";

export async function writerAgent(facts, feedback = "", context = {}) {
  if (context.requestId) {
    publish(context.requestId, "stage", {
      stage: "writer",
      status: "running",
      message: feedback ? "The Voice is revising the draft with editor feedback." : "The Voice is generating channel content."
    });
  }

  const response = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0.5,
    messages: [
      {
        role: "system",
        content: WRITER_SYSTEM_PROMPT
      },
      {
        role: "user",
        content: `FACTS:
${JSON.stringify(facts, null, 2)}

${feedback ? `Fix based on this feedback: ${feedback}` : ""}

Return structured JSON:
{
  "blog": "...",
  "tweets": ["...", "..."],
  "email": "..."
}`
      }
    ]
  });

  const content = response.choices?.[0]?.message?.content || "";
  const rawParsed = safeJsonParse(content);
  const parsed = normalizeCampaignContent({
    ...rawParsed,
    tweets:
      Array.isArray(rawParsed?.tweets)
        ? rawParsed.tweets
        : typeof rawParsed?.thread === "string"
        ? rawParsed.thread.split(/\n+/).filter(Boolean)
        : rawParsed?.tweets
  });

  await logAgentRun("writer", {
    requestId: context.requestId,
    model: MODEL,
    feedback,
    facts,
    output: parsed
  });

  if (context.requestId) {
    publish(context.requestId, "stage", {
      stage: "writer",
      status: "complete",
      message: "The Voice delivered a structured content draft."
    });
  }

  return parsed;
}
