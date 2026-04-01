import { mkdir, appendFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { publish } from "./requestEvents.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logsDir = path.resolve(__dirname, "../logs");
const logFilePath = path.join(logsDir, "agents.log");

async function ensureLogFile() {
  await mkdir(logsDir, { recursive: true });
}

export async function logAgentRun(agent, payload) {
  await ensureLogFile();

  const entry = {
    timestamp: new Date().toISOString(),
    agent,
    payload
  };

  await appendFile(logFilePath, `${JSON.stringify(entry)}\n`, "utf8");

  if (payload?.requestId) {
    publish(payload.requestId, "agent-log", entry);
  }

  return entry;
}

export { logFilePath };
