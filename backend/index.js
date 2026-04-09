import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { FALLBACK_PROVIDER, MODELS, PRIMARY_PROVIDER } from "./config/ai.js";
import { isDatabaseConfigured } from "./config/database.js";
import { ensureCampaignSchema } from "./repositories/campaignRepository.js";
import { toErrorResponse } from "./utils/errors.js";
import { logEvent, systemLogFilePath } from "./utils/logger.js";
import { logFilePath } from "./utils/agentLogger.js";
import campaignsRouter from "./routes/campaigns.js";
import generateRouter from "./routes/generate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = process.env.PORT || 4000;
const allowedOrigins = String(process.env.FRONTEND_URLS || process.env.FRONTEND_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || !allowedOrigins.length || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("CORS origin not allowed"));
    }
  })
);
app.use(express.json({ limit: "1mb" }));

// Lightweight health check for local verification and future deployments.
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.use("/api/generate", generateRouter);
app.use("/api/campaigns", campaignsRouter);

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    code: "NOT_FOUND",
    details: null
  });
});

app.use((err, req, res, next) => {
  const isMulterSizeError = err?.code === "LIMIT_FILE_SIZE";
  const normalizedError = isMulterSizeError
    ? {
        message: "Uploaded file is too large. Please use a PDF under 10MB.",
        code: "FILE_TOO_LARGE",
        statusCode: 400,
        details: { limitMb: 10 }
      }
    : err;

  logEvent("api_error", {
    path: req.path,
    method: req.method,
    code: normalizedError?.code || "INTERNAL_ERROR",
    message: normalizedError?.message || "Internal server error"
  });

  res.status(normalizedError?.statusCode || 500).json(toErrorResponse(normalizedError));
});

async function startServer() {
  if (isDatabaseConfigured) {
    await ensureCampaignSchema();
    console.log("Campaign persistence: Supabase Postgres connected");
  } else {
    console.log("Campaign persistence: disabled (set DATABASE_URL to enable Supabase Postgres)");
  }

  app.listen(PORT, () => {
    console.log(`Autonomous Content Factory backend running on port ${PORT}`);
    console.log(`Primary AI provider: ${PRIMARY_PROVIDER}`);
    console.log(`Fallback AI provider: ${FALLBACK_PROVIDER}`);
    console.log(`Researcher model: ${MODELS.researcher}`);
    console.log(`Writer model: ${MODELS.writer}`);
    console.log(`Editor model: ${MODELS.editor}`);
    console.log(`Agent logs: ${logFilePath}`);
    console.log(`System logs: ${systemLogFilePath}`);
    if (allowedOrigins.length) {
      console.log(`Allowed frontend origins: ${allowedOrigins.join(", ")}`);
    } else {
      console.log("Allowed frontend origins: all origins (no FRONTEND_URL configured)");
    }
  });
}

startServer().catch((error) => {
  logEvent("startup_error", {
    message: error.message || "Failed to start backend"
  });
  console.error("Failed to start backend:", error);
  process.exit(1);
});
