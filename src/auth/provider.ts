import { env } from "../config/env.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { Router } from "express";

export interface AuthProvider {
  verifyToken(token: string): Promise<AuthInfo>;
  oauthRouter: Router;
  userinfoEndpoint: string;
}

async function loadProvider(): Promise<AuthProvider> {
  if (env.AUTH_PROVIDER === "keycloak") {
    const { verifyToken } = await import("./keycloak/token-verifier.js");
    const { oauthRouter } = await import("./keycloak/routes.js");
    return {
      verifyToken,
      oauthRouter,
      userinfoEndpoint: `${env.KEYCLOAK_ISSUER}/protocol/openid-connect/userinfo`,
    };
  }

  const { verifyToken } = await import("./clerk/token-verifier.js");
  const { oauthRouter } = await import("./clerk/routes.js");
  return {
    verifyToken,
    oauthRouter,
    userinfoEndpoint: `${env.CLERK_ISSUER}/oauth/userinfo`,
  };
}

export const provider = await loadProvider();
