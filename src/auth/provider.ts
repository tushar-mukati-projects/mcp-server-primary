import { config } from "../config/config.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { Router } from "express";

export interface AuthProvider {
  verifyToken(token: string): Promise<AuthInfo>;
  oauthRouter: Router;
  userinfoEndpoint: string;
}

async function loadProvider(): Promise<AuthProvider> {
  if (config.auth.provider === "keycloak") {
    const { verifyToken } = await import("./keycloak/token-verifier.js");
    const { oauthRouter } = await import("./keycloak/routes.js");
    return {
      verifyToken,
      oauthRouter,
      userinfoEndpoint: `${config.auth.keycloak.issuer}/protocol/openid-connect/userinfo`,
    };
  }

  const { verifyToken } = await import("./clerk/token-verifier.js");
  const { oauthRouter } = await import("./clerk/routes.js");
  return {
    verifyToken,
    oauthRouter,
    userinfoEndpoint: `${config.auth.clerk.issuer}/oauth/userinfo`,
  };
}

export const provider = await loadProvider();
