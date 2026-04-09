import { createChatCompletion, MODELS } from "../config/ai.js";
import { logAgentRun } from "../utils/agentLogger.js";
import { WRITER_SYSTEM_PROMPT } from "../utils/prompts.js";
import { safeJsonParse } from "../utils/safeJson.js";
import { publish } from "../utils/requestEvents.js";
import { normalizeCampaignContent } from "../utils/contentShape.js";

export async function writerAgent(facts, feedback = "", context = {}) {
  const model = MODELS.writer;

  if (context.requestId) {
    publish(context.requestId, "stage", {
      stage: "writer",
      status: "running",
      message: feedback ? "The Voice is revising the draft with editor feedback." : "The Voice is generating channel content."
    });
  }

  const response = await createChatCompletion(
    {
      model,
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
${context.operatorGuidance ? `Operator guidance to follow where possible without violating the facts: ${context.operatorGuidance}` : ""}
${context.channel ? `Regenerate only this channel: ${context.channel}` : ""}
${context.currentChannelContent ? `Current approved or latest channel draft to improve from:\n${typeof context.currentChannelContent === "string" ? context.currentChannelContent : JSON.stringify(context.currentChannelContent, null, 2)}` : ""}
${context.approvedBaselineExists ? "An approved baseline already exists for this channel. Preserve what is working and improve clarity, specificity, and usefulness rather than rewriting from scratch." : ""}

Return structured JSON:
{
  "blogTitle": "...",
  "blog": "...",
  "tweets": ["...", "..."],
  "email": "..."
}`
        }
      ]
    },
    {
      agent: "writer",
      requestId: context.requestId
    }
  );

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

  const meta = {
    provider: response._provider || "unknown",
    model: response._model || model,
    fallbackUsed: Boolean(response._fallbackUsed)
  };

  await logAgentRun("writer", {
    requestId: context.requestId,
    ...meta,
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

  return {
    data: parsed,
    meta
  };
}
