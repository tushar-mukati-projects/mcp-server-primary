import { z } from "zod";

export const env = z
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
  })
  .refine(
    (d) =>
      d.AUTH_PROVIDER === "keycloak"
        ? !!d.KEYCLOAK_ISSUER
        : !!d.CLERK_ISSUER && !!d.CLERK_SECRET_KEY,
    { message: "Missing required env vars for the selected AUTH_PROVIDER" },
  )
  .parse(process.env);
