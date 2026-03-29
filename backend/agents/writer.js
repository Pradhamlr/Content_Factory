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
        content: `You are a marketing copywriter.
Use ONLY the provided facts. Do not invent features, pricing, numbers, integrations, or claims.
Return STRICT JSON only with this shape:
{
  "blog": "300-500 word blog post",
  "tweets": ["tweet1", "tweet2", "tweet3", "tweet4", "tweet5"],
  "email": "short email teaser"
}
If feedback is provided, improve the output using that feedback while still using only the facts.`
      },
      {
        role: "user",
        content: JSON.stringify({
          facts,
          feedback
        })
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
