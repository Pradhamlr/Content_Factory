import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { logEvent } from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const PRIMARY_PROVIDER = String(process.env.AI_PRIMARY_PROVIDER || "groq").trim().toLowerCase();
const FALLBACK_PROVIDER = String(process.env.AI_FALLBACK_PROVIDER || "openrouter").trim().toLowerCase();

const PROVIDER_CONFIG = {
  groq: {
    apiKey: process.env.GROQ_API_KEY || "",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: process.env.GROQ_MODEL || "llama-3.3-70b-versatile"
  },
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY || "",
    baseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    defaultModel: process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free"
  }
};

const MODELS = {
  researcher: process.env.RESEARCHER_MODEL || PROVIDER_CONFIG[PRIMARY_PROVIDER]?.defaultModel || "llama-3.3-70b-versatile",
  writer: process.env.WRITER_MODEL || PROVIDER_CONFIG[PRIMARY_PROVIDER]?.defaultModel || "llama-3.3-70b-versatile",
  editor: process.env.EDITOR_MODEL || PROVIDER_CONFIG[PRIMARY_PROVIDER]?.defaultModel || "llama-3.3-70b-versatile"
};

function canUseProvider(provider) {
  return Boolean(PROVIDER_CONFIG[provider]?.apiKey);
}

function shouldFallback(error) {
  const statusCode = error?.statusCode || error?.status;
  const code = String(error?.code || "").toUpperCase();

  return (
    statusCode === 408 ||
    statusCode === 429 ||
    statusCode === 500 ||
    statusCode === 502 ||
    statusCode === 503 ||
    statusCode === 504 ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN"
  );
}

function buildHeaders(provider) {
  const config = PROVIDER_CONFIG[provider];
  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json"
  };

  if (provider === "openrouter") {
    if (process.env.OPENROUTER_HTTP_REFERER) {
      headers["HTTP-Referer"] = process.env.OPENROUTER_HTTP_REFERER;
    }

    if (process.env.OPENROUTER_APP_NAME) {
      headers["X-Title"] = process.env.OPENROUTER_APP_NAME;
    }
  }

  return headers;
}

async function requestChatCompletion(provider, { model, temperature = 0.2, messages, timeoutMs = 45000, ...rest }) {
  const config = PROVIDER_CONFIG[provider];

  if (!config?.apiKey) {
    throw new Error(`Missing API key for provider: ${provider}`);
  }

  const response = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: buildHeaders(provider),
    body: JSON.stringify({
      model,
      temperature,
      messages,
      ...rest
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(
      payload?.error?.message ||
      payload?.message ||
      `Model request failed with status ${response.status}.`
    );
    error.statusCode = response.status;
    throw error;
  }

  return payload;
}

export async function createChatCompletion(options, context = {}) {
  const primaryModel = options?.model || PROVIDER_CONFIG[PRIMARY_PROVIDER]?.defaultModel;

  try {
    const payload = await requestChatCompletion(PRIMARY_PROVIDER, {
      ...options,
      model: primaryModel
    });

    return {
      ...payload,
      _provider: PRIMARY_PROVIDER,
      _model: primaryModel,
      _fallbackUsed: false
    };
  } catch (error) {
    const fallbackModel =
      context.fallbackModel ||
      process.env[`${String(context.agent || "").toUpperCase()}_FALLBACK_MODEL`] ||
      PROVIDER_CONFIG[FALLBACK_PROVIDER]?.defaultModel;

    if (!canUseProvider(FALLBACK_PROVIDER) || !shouldFallback(error)) {
      throw error;
    }

    logEvent("ai_fallback_triggered", {
      requestId: context.requestId,
      agent: context.agent || "unknown",
      fromProvider: PRIMARY_PROVIDER,
      toProvider: FALLBACK_PROVIDER,
      reason: error.message,
      statusCode: error.statusCode || null
    });

    const payload = await requestChatCompletion(FALLBACK_PROVIDER, {
      ...options,
      model: fallbackModel
    });

    return {
      ...payload,
      _provider: FALLBACK_PROVIDER,
      _model: fallbackModel,
      _fallbackUsed: true
    };
  }
}

export { FALLBACK_PROVIDER, MODELS, PRIMARY_PROVIDER };
