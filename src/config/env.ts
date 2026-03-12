import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  MCP_SERVER_URL: z.string().default("http://localhost:3001"),
  CLERK_DOMAIN: z
    .string()
    .min(1)
    .transform((v) => v.replace(/^https?:\/\//, "")),
  CLERK_CLIENT_ID: z.string().min(1),
  CLERK_CLIENT_SECRET: z.string().min(1),
});

export const env = envSchema.parse(process.env);
