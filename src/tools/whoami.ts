import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function register(server: McpServer) {
  server.tool("whoami", "Returns the authenticated user's info.", async (extra) => ({
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        clientId: extra.authInfo?.clientId,
        scopes: extra.authInfo?.scopes,
      }, null, 2),
    }],
  }));
}
