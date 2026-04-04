function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtml(html) {
  return decodeHtmlEntities(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|section|article|h1|h2|h3|li|ul|ol)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
  );
}

function pickReadableHtml(html) {
  const articleMatch = html.match(/<article[\s\S]*?<\/article>/i);
  if (articleMatch?.[0]) {
    return articleMatch[0];
  }

  const mainMatch = html.match(/<main[\s\S]*?<\/main>/i);
  if (mainMatch?.[0]) {
    return mainMatch[0];
  }

  const bodyMatch = html.match(/<body[\s\S]*?<\/body>/i);
  if (bodyMatch?.[0]) {
    return bodyMatch[0];
  }

  return html;
}

export async function extractUrlText(url) {
  let parsedUrl;

  try {
    parsedUrl = new URL(url);
  } catch {
    const error = new Error("Please provide a valid URL.");
    error.statusCode = 400;
    throw error;
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    const error = new Error("Only http and https URLs are supported.");
    error.statusCode = 400;
    throw error;
  }

  let response;

  try {
    response = await fetch(parsedUrl.toString(), {
      signal: AbortSignal.timeout(15000),
      headers: {
        "User-Agent": "AutonomousContentFactory/1.0"
      }
    });
  } catch {
    const error = new Error("The URL could not be reached.");
    error.statusCode = 400;
    throw error;
  }

  if (!response.ok) {
    const error = new Error(`The URL returned ${response.status}.`);
    error.statusCode = 400;
    throw error;
  }

  const html = await response.text();
  const readableHtml = pickReadableHtml(html);
  const extractedText = stripHtml(readableHtml);
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = decodeHtmlEntities(titleMatch?.[1] || parsedUrl.hostname).trim();

  if (!extractedText || extractedText.length < 120) {
    const error = new Error("The URL did not contain enough readable text to build a campaign.");
    error.statusCode = 400;
    throw error;
  }

  return {
    title,
    extractedText,
    finalUrl: parsedUrl.toString()
  };
}
