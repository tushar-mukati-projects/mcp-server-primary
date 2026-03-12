import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { env } from "../config/env.js";

const jwks = createRemoteJWKSet(new URL(`${env.KEYCLOAK_ISSUER}/protocol/openid-connect/certs`));

export async function verifyToken(token: string): Promise<AuthInfo> {
  const { payload } = await jwtVerify(token, jwks, { issuer: env.KEYCLOAK_ISSUER });

  return {
    token,
    clientId: (payload.azp as string) || (payload.sub as string) || "unknown",
    scopes: payload.scope ? (payload.scope as string).split(" ") : ["openid", "profile", "email"],
    expiresAt: payload.exp ? payload.exp * 1000 : undefined,
  };
}
