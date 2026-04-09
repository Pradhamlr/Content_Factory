function escapeControlCharactersInStrings(input) {
  let output = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (inString) {
      if (escaped) {
        output += char;
        escaped = false;
        continue;
      }

      if (char === "\\") {
        output += char;
        escaped = true;
        continue;
      }

      if (char === "\"") {
        output += char;
        inString = false;
        continue;
      }

      if (char === "\n") {
        output += "\\n";
        continue;
      }

      if (char === "\r") {
        output += "\\r";
        continue;
      }

      if (char === "\t") {
        output += "\\t";
        continue;
      }

      output += char;
      continue;
    }

    if (char === "\"") {
      inString = true;
    }

    output += char;
  }

  return output;
}

function extractJsonObject(input) {
  const start = input.indexOf("{");

  if (start === -1) {
    return input;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < input.length; index += 1) {
    const char = input[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === "\"") {
        inString = false;
      }

      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return input.slice(start, index + 1);
      }
    }
  }

  return input.slice(start);
}

function normalizeJsonCandidate(input) {
  return String(input || "")
    .replace(/^\uFEFF/, "")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, "$1");
}

export function safeJsonParse(rawText) {
  const cleaned = normalizeJsonCandidate(
    extractJsonObject(
      String(rawText || "")
        .trim()
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/, "")
    )
  );

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    try {
      const repaired = normalizeJsonCandidate(escapeControlCharactersInStrings(cleaned));
      return JSON.parse(repaired);
    } catch (repairError) {
      const wrappedError = new Error(`Failed to parse model JSON response: ${cleaned}`);
      wrappedError.cause = repairError;
      throw wrappedError;
    }
  }
}
