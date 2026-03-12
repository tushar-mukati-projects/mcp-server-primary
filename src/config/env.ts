import { z } from "zod";

export const env = z
  .object({
    PORT: z.coerce.number().default(3001),
    MCP_SERVER_URL: z.string().default("http://localhost:3001"),
    KEYCLOAK_ISSUER: z.string().min(1), // e.g. https://keycloak.example.com/realms/myrealm
  })
  .parse(process.env);
