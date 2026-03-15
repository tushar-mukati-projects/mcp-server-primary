import { execFile } from "child_process";
import { promisify } from "util";
import { writeFileSync, readFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "./logger.js";

const execFileAsync = promisify(execFile);

const WORKER_PATH = join(dirname(fileURLToPath(import.meta.url)), "playwright-worker.cjs");

export async function runPlaywrightOp<T>(input: Record<string, unknown>): Promise<T> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const inPath = join(tmpdir(), `pw-in-${id}.json`);
  const outPath = join(tmpdir(), `pw-out-${id}.json`);

  writeFileSync(inPath, JSON.stringify(input));

  try {
    await execFileAsync("node", [WORKER_PATH, inPath, outPath], {
      timeout: 60_000,
      env: { ...process.env },
    });

    const raw = readFileSync(outPath, "utf8");
    const result = JSON.parse(raw) as T & { error?: string };
    if ("error" in result && result.error) throw new Error(result.error as string);
    return result;
  } catch (execErr) {
    // Worker writes the real error to the output file before exiting with code 1
    let workerMsg = (execErr as Error).message;
    try {
      const raw = readFileSync(outPath, "utf8");
      const out = JSON.parse(raw) as { error?: string };
      if (out.error) workerMsg = out.error;
    } catch {
      /* output file may not exist if worker crashed before writing */
    }
    logger.error(`playwright-worker: ${workerMsg}`);
    throw new Error(workerMsg, { cause: execErr });
  } finally {
    try {
      unlinkSync(inPath);
    } catch {
      /* ignore */
    }
    try {
      unlinkSync(outPath);
    } catch {
      /* ignore */
    }
  }
}

export async function generatePdfFromHtml(html: string): Promise<Buffer> {
  logger.debug("pdf-renderer: spawning Playwright worker");
  const result = await runPlaywrightOp<{ data: string }>({ operation: "pdf", html });
  const kb = Math.round((result.data.length * 0.75) / 1024);
  logger.debug(`pdf-renderer: PDF received ~${kb}KB`);
  return Buffer.from(result.data, "base64");
}
