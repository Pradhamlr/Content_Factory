import Groq from "groq-sdk";

const apiKey = process.env.GROQ_API_KEY;

if (!apiKey) {
  throw new Error("Missing GROQ_API_KEY in environment variables.");
}

const groq = new Groq({ apiKey });
const MODEL = "mixtral-8x7b-32768";

export { groq, MODEL };
