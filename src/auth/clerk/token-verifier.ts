import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { config } from "../../config/config.js";

const jwks = createRemoteJWKSet(new URL(`${config.auth.clerk.issuer}/.well-known/jwks.json`));

export async function verifyToken(token: string): Promise<AuthInfo> {
  const { payload } = await jwtVerify(token, jwks, {
    issuer: config.auth.clerk.issuer,
  });

  return {
    token,
    clientId: (payload.azp as string) || (payload.sub as string) || "unknown",
    scopes: payload.scope ? (payload.scope as string).split(" ") : ["openid", "profile", "email"],
    expiresAt: payload.exp ? payload.exp * 1000 : undefined,
  };
}
