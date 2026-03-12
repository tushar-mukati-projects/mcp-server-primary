import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { decodeJwt } from "jose";
import { env } from "../config/env.js";

export function register(server: McpServer) {
  server.tool("whoami", "Returns the authenticated user's details.", async (extra) => {
    const token = extra.authInfo?.token;
    if (!token) {
      return { content: [{ type: "text" as const, text: "Not authenticated." }], isError: true };
    }

    const claims = decodeJwt(token);

    // Fetch full user info from Keycloak userinfo endpoint
    let userInfo: Record<string, unknown> = {};
    try {
      const res = await fetch(`${env.KEYCLOAK_ISSUER}/protocol/openid-connect/userinfo`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) userInfo = (await res.json()) as Record<string, unknown>;
    } catch {}

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          sub: claims.sub,
          email: userInfo.email || claims.email,
          name: userInfo.name || claims.name,
          preferred_username: userInfo.preferred_username || claims.preferred_username,
          given_name: userInfo.given_name || claims.given_name,
          family_name: userInfo.family_name || claims.family_name,
          email_verified: userInfo.email_verified ?? claims.email_verified,
          scopes: extra.authInfo?.scopes,
        }, null, 2),
      }],
    };
  });
}
