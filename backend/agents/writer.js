import { groq, MODEL } from "../config/groq.js";
import { logAgentRun } from "../utils/agentLogger.js";
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
        content: `You are a senior marketing copywriter.

STRICT RULES:
- Use ONLY the provided facts
- Do NOT write generic content
- Make it product-specific and persuasive
- Highlight the value proposition clearly
- Do NOT invent metrics, percentages, pricing, ROI, or case-study outcomes unless they are explicitly present in the provided facts
- Do NOT use placeholders such as [Name], [Company], [CTA], or bracketed instructions
- Do NOT include meta labels like "[CTA button]" or template markers

OUTPUT FORMAT:

BLOG:
- 400-500 words
- Strong hook in first paragraph
- Clearly explain the workflow
- Emphasize benefits

TWEETS:
- 5 tweets
- Engaging, punchy, non-repetitive

EMAIL:
- Short, compelling, CTA-driven
- Write it as a real email teaser for immediate use
- Begin with "Subject: ..."
- Next line must begin with "Preview: ..."
- Then write a short email body in 2-3 compact paragraphs
- Use a direct CTA sentence in plain text, not a bracketed placeholder
- Never write in all caps

Return structured JSON:
{
  "blog": "...",
  "tweets": ["...", "..."],
  "email": "..."
}`
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
