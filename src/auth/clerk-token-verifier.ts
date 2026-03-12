import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../config/env.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

const JWKS_URL = `https://${env.CLERK_DOMAIN}/.well-known/jwks.json`;
const jwks = createRemoteJWKSet(new URL(JWKS_URL));

export async function verifyClerkToken(token: string): Promise<AuthInfo> {
  const { payload } = await jwtVerify(token, jwks, {
    issuer: `https://${env.CLERK_DOMAIN}`,
  });

  return {
    token,
    clientId: (payload.azp as string) || (payload.sub as string) || "unknown",
    scopes: payload.scope
      ? (payload.scope as string).split(" ")
      : ["openid", "profile", "email"],
    expiresAt: payload.exp ? payload.exp * 1000 : undefined,
  };
}
