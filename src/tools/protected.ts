import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Register protected tools (auth required).
 * These are placeholder tools — you'll replace them with your actual portfolio use cases.
 */
export function registerProtectedTools(server: McpServer) {
  server.tool(
    "whoami",
    "Returns the authenticated user's info. Requires OAuth authentication.",
    async (extra) => {
      const authInfo = extra.authInfo;
      if (!authInfo) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Not authenticated. Please authenticate via OAuth to use this tool.",
            },
          ],
          isError: true,
        };
      }

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
