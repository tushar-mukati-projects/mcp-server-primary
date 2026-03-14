import OpenAI from "openai";
import { env } from "../config/env.js";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured in .env");
  if (!client) client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return client;
}

export async function aiJSON<T>(system: string, user: string): Promise<T> {
  const res = await getClient().chat.completions.create({
    model: env.AI_MODEL ?? "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.2,
  });
  return JSON.parse(res.choices[0].message.content!) as T;
}

export async function aiText(system: string, user: string): Promise<string> {
  const res = await getClient().chat.completions.create({
    model: env.AI_MODEL ?? "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.2,
  });
  return res.choices[0].message.content!;
}

/** Like aiText but strips markdown code fences from the response. */
export async function aiCode(system: string, user: string): Promise<string> {
  const raw = await aiText(system, user);
  // Strip ```javascript ... ``` or ``` ... ``` wrappers
  return raw
    .replace(/^```(?:javascript|js|typescript|ts)?\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
}
