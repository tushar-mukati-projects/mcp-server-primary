import fs from "fs";
import path from "path";
import crypto from "crypto";
import { env } from "../config/env.js";

const OUTPUT_DIR = path.join(process.cwd(), "output");

export function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

export function saveOutput(filename: string, data: Buffer | Uint8Array): string {
  ensureOutputDir();
  const id = crypto.randomUUID().slice(0, 8);
  const safeName = `${id}-${filename}`;
  fs.writeFileSync(path.join(OUTPUT_DIR, safeName), data);
  return `${env.MCP_SERVER_URL}/output/${safeName}`;
}
