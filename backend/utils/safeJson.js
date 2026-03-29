export function safeJsonParse(rawText) {
  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const wrappedError = new Error(`Failed to parse model JSON response: ${cleaned}`);
    wrappedError.cause = error;
    throw wrappedError;
  }
}
