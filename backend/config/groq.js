import Groq from "groq-sdk";

const apiKey = process.env.GROQ_API_KEY;

if (!apiKey) {
  throw new Error("Missing GROQ_API_KEY in environment variables.");
}

const groq = new Groq({ apiKey });
const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

export { groq, MODEL };
