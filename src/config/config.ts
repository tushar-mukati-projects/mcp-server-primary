import { z } from "zod";

const env = z
  .object({
    PORT: z.coerce.number().default(3001),
    MCP_SERVER_URL: z.string().default("http://localhost:3001"),
    AUTH_PROVIDER: z.enum(["keycloak", "clerk"]).default("keycloak"),
    KEYCLOAK_ISSUER: z.string().optional(),
    CLERK_ISSUER: z
      .string()
      .transform((v) => v?.replace(/\/$/, ""))
      .optional(),
    CLERK_SECRET_KEY: z.string().optional(),
    NEWS_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    AI_MODEL: z.string().optional(),
    SUPABASE_URL: z.string().optional(),
    SUPABASE_SECRET_KEY: z.string().optional(),
    SUPABASE_BUCKET: z.string().optional(),
  })
  .refine(
    (d) =>
      d.AUTH_PROVIDER === "keycloak"
        ? !!d.KEYCLOAK_ISSUER
        : !!d.CLERK_ISSUER && !!d.CLERK_SECRET_KEY,
    { message: "Missing required env vars for the selected AUTH_PROVIDER" },
  )
  .parse(process.env);

export const config = {
  port: env.PORT,
  serverUrl: env.MCP_SERVER_URL,

  auth: {
    provider: env.AUTH_PROVIDER,
    keycloak: {
      issuer: env.KEYCLOAK_ISSUER,
    },
    clerk: {
      issuer: env.CLERK_ISSUER,
      secretKey: env.CLERK_SECRET_KEY,
    },
  },

  ai: {
    apiKey: env.OPENAI_API_KEY,
    model: env.AI_MODEL ?? "gpt-4o-mini",
  },

  supabase: {
    url: env.SUPABASE_URL,
    secretKey: env.SUPABASE_SECRET_KEY,
    bucket: env.SUPABASE_BUCKET ?? "MCP Server Output",
  },

  news: {
    apiKey: env.NEWS_API_KEY,
  },
};
