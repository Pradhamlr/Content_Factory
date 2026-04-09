const DEFAULT_MAX_INPUT_CHARS = Number.parseInt(process.env.MAX_SOURCE_INPUT_CHARS || "18000", 10);

export function truncateModelInput(input, options = {}) {
  const maxChars = Number.isFinite(options.maxChars) ? options.maxChars : DEFAULT_MAX_INPUT_CHARS;
  const safeInput = String(input || "").trim();

  if (safeInput.length <= maxChars) {
    return {
      text: safeInput,
      truncated: false,
      originalLength: safeInput.length,
      finalLength: safeInput.length
    };
  }

  const headLength = Math.max(4000, Math.floor(maxChars * 0.72));
  const tailLength = Math.max(1500, maxChars - headLength - 160);
  const head = safeInput.slice(0, headLength).trimEnd();
  const tail = safeInput.slice(-tailLength).trimStart();
  const separator = "\n\n[Content truncated for model safety. Middle section omitted.]\n\n";
  const text = `${head}${separator}${tail}`.slice(0, maxChars + separator.length);

  return {
    text,
    truncated: true,
    originalLength: safeInput.length,
    finalLength: text.length
  };
}
