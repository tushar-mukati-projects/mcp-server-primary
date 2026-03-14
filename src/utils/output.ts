import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { config } from "../config/config.js";
import { logger } from "../lib/logger.js";

const OUTPUT_DIR = path.join(process.cwd(), "output");

export function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

function getContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const types: Record<string, string> = {
    ".pdf": "application/pdf",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
  };
  return types[ext] ?? "application/octet-stream";
}

function supabaseClient() {
  if (!config.supabase.url || !config.supabase.secretKey) return null;
  return createClient(config.supabase.url, config.supabase.secretKey);
}

export async function saveOutput(filename: string, data: Buffer | Uint8Array): Promise<string> {
  const id = crypto.randomUUID().slice(0, 8);
  const safeName = `${id}-${filename}`;

  const supabase = supabaseClient();

  if (supabase) {
    const { error } = await supabase.storage
      .from(config.supabase.bucket)
      .upload(safeName, data, { contentType: getContentType(filename), upsert: false });

    if (error) {
      logger.warn(`output: Supabase upload failed (${error.message}), falling back to local`);
    } else {
      const { data: urlData } = supabase.storage
        .from(config.supabase.bucket)
        .getPublicUrl(safeName);
      logger.debug(`output: uploaded to Supabase → ${urlData.publicUrl}`);
      return urlData.publicUrl;
    }
  }

  // Local fallback
  ensureOutputDir();
  fs.writeFileSync(path.join(OUTPUT_DIR, safeName), data);
  const localUrl = `${config.serverUrl}/output/${safeName}`;
  logger.debug(`output: saved locally → ${localUrl}`);
  return localUrl;
}
