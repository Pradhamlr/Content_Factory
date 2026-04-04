import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { MODEL } from "./config/groq.js";
import { isDatabaseConfigured } from "./config/database.js";
import { ensureCampaignSchema } from "./repositories/campaignRepository.js";
import { logFilePath } from "./utils/agentLogger.js";
import campaignsRouter from "./routes/campaigns.js";
import generateRouter from "./routes/generate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Lightweight health check for local verification and future deployments.
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.use("/api/generate", generateRouter);
app.use("/api/campaigns", campaignsRouter);

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.statusCode || 500).json({
    error: err.message || "Internal server error"
  });
});

async function startServer() {
  if (isDatabaseConfigured) {
    await ensureCampaignSchema();
    console.log("Campaign persistence: Supabase Postgres connected");
  } else {
    console.log("Campaign persistence: disabled (set DATABASE_URL to enable Supabase Postgres)");
  }

  app.listen(PORT, () => {
    console.log(`Autonomous Content Factory backend running on http://localhost:${PORT}`);
    console.log(`Groq model: ${MODEL}`);
    console.log(`Agent logs: ${logFilePath}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start backend:", error);
  process.exit(1);
});
