import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

/**
 * Helper for protected tool handlers.
 * Throws an error (returned to the MCP client) if no auth is present.
 */
export function requireAuth(authInfo: AuthInfo | undefined): AuthInfo {
  if (!authInfo) {
    throw new Error(
      "Authentication required. Please authenticate via OAuth to use this tool."
    );
  }
  return authInfo;
}
