import "dotenv/config";
import express from "express";
import cors from "cors";
import { MODEL } from "./config/groq.js";
import { logFilePath } from "./utils/agentLogger.js";
import generateRouter from "./routes/generate.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Lightweight health check for local verification and future deployments.
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.use("/api/generate", generateRouter);

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.statusCode || 500).json({
    error: err.message || "Internal server error"
  });
});

app.listen(PORT, () => {
  console.log(`Autonomous Content Factory backend running on http://localhost:${PORT}`);
  console.log(`Groq model: ${MODEL}`);
  console.log(`Agent logs: ${logFilePath}`);
});
