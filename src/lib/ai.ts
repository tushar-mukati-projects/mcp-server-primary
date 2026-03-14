import OpenAI from "openai";
import { config } from "../config/config.js";
import { logger } from "./logger.js";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!config.ai.apiKey) throw new Error("OPENAI_API_KEY is not configured in .env");
  if (!client) client = new OpenAI({ apiKey: config.ai.apiKey });
  return client;
}

export async function aiJSON<T>(system: string, user: string): Promise<T> {
  const res = await getClient().chat.completions.create({
    model: config.ai.model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.2,
  });
  return JSON.parse(res.choices[0].message.content!) as T;
}

export async function aiText(system: string, user: string, maxTokens?: number): Promise<string> {
  const res = await getClient().chat.completions.create({
    model: config.ai.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.2,
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
  });
  return res.choices[0].message.content!;
}

/** Like aiText but strips markdown code fences and validates syntax. */
export async function aiCode(system: string, user: string, maxTokens = 16000): Promise<string> {
  logger.debug(`aiCode — calling AI (max_tokens=${maxTokens})`);
  const res = await getClient().chat.completions.create({
    model: config.ai.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.2,
    max_tokens: maxTokens,
  });
  const choice = res.choices[0];
  if (choice.finish_reason === "length") {
    throw new Error(
      `Code generation was truncated (hit ${maxTokens}-token limit). Try fewer slides or simpler content.`,
    );
  }
  const raw = choice.message.content!;
  // Extract code from inside a fenced block (handles trailing text after closing ```)
  const fenceMatch = raw.match(/^```(?:javascript|js|typescript|ts)?\n?([\s\S]*?)\n?```/im);
  const code = fenceMatch ? fenceMatch[1].trim() : raw.trim();
  logger.debug(`aiCode — received ${code.length} chars`);

  // Validate syntax using AsyncFunction (same context as execution — allows await)
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
    ...args: string[]
  ) => (...a: unknown[]) => Promise<void>;
  try {
    new AsyncFunction("pptx", "buildChart", code);
  } catch (e) {
    const msg = (e as Error).message;
    logger.error(`aiCode syntax error: ${msg}`);
    logger.error(`aiCode generated code (${code.length} chars):\n${code}`);
    throw new Error(`Generated code has a syntax error: ${msg}`, { cause: e });
  }
  return code;
}
