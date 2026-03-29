import { groq, MODEL } from "../config/groq.js";
import { logAgentRun } from "../utils/agentLogger.js";
import { safeJsonParse } from "../utils/safeJson.js";

export async function writerAgent(facts, feedback = "") {
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
  const parsed = safeJsonParse(content);

  await logAgentRun("writer", {
    model: MODEL,
    feedback,
    facts,
    output: parsed
  });

  return parsed;
}
