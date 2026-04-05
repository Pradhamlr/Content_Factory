import { appendFile, mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logsDir = path.resolve(__dirname, "../logs");
const systemLogFilePath = path.join(logsDir, "system.log");

async function ensureLogFile() {
  await mkdir(logsDir, { recursive: true });
}

function getConsoleMethod(event) {
  if (event === "api_error" || event === "startup_error") {
    return "error";
  }

  return null;
}

export function logEvent(event, payload = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    ...payload
  };

  ensureLogFile()
    .then(() => appendFile(systemLogFilePath, `${JSON.stringify(entry)}\n`, "utf8"))
    .catch(() => {});

  const consoleMethod = getConsoleMethod(event);
  if (consoleMethod) {
    console[consoleMethod](JSON.stringify(entry));
  }

  return entry;
}

export { systemLogFilePath };
