import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Register protected tools.
 * Auth is enforced at the transport level, so extra.authInfo is always present.
 */
export function registerProtectedTools(server: McpServer) {
  server.tool(
    "whoami",
    "Returns the authenticated user's info.",
    async (extra) => {
      const authInfo = extra.authInfo!;
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                clientId: authInfo.clientId,
                scopes: authInfo.scopes,
                expiresAt: authInfo.expiresAt,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
