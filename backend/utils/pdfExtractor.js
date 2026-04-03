import fs from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptPath = path.join(__dirname, "..", "scripts", "extract_pdf.py");

function runPythonExtraction(pdfPath) {
  return new Promise((resolve, reject) => {
    const child = spawn("python", [scriptPath, pdfPath], {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(stderr.trim() || "PDF extraction failed."));
        return;
      }

      try {
        const payload = JSON.parse(stdout);

        if (!payload.ok) {
          reject(new Error(payload.error || "PDF extraction failed."));
          return;
        }

        resolve(payload.text || "");
      } catch (error) {
        reject(new Error(stderr.trim() || "Could not parse PDF extraction output."));
      }
    });
  });
}

export async function extractPdfText(fileBuffer) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "acf-pdf-"));
  const tempPath = path.join(tempDir, "upload.pdf");

  try {
    await fs.writeFile(tempPath, fileBuffer);
    const text = await runPythonExtraction(tempPath);

    if (!text.trim()) {
      throw new Error("No extractable text was found in this PDF.");
    }

    return text.trim();
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
