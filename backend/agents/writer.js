import { groq, MODEL } from "../config/groq.js";
import { logAgentRun } from "../utils/agentLogger.js";
import { safeJsonParse } from "../utils/safeJson.js";
import { publish } from "../utils/requestEvents.js";

function normalizeWriterOutput(parsed) {
  const tweets = Array.isArray(parsed?.tweets)
    ? parsed.tweets
    : typeof parsed?.thread === "string"
    ? parsed.thread.split(/\n+/).filter(Boolean)
    : [];

  return {
    blog: typeof parsed?.blog === "string" ? parsed.blog.trim() : "",
    tweets,
    email:
      typeof parsed?.email === "string"
        ? parsed.email.trim()
        : typeof parsed?.emailTeaser === "string"
        ? parsed.emailTeaser.trim()
        : typeof parsed?.email_teaser === "string"
        ? parsed.email_teaser.trim()
        : ""
  };
}

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
  const parsed = normalizeWriterOutput(safeJsonParse(content));

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
