import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function register(server: McpServer) {
  server.tool(
    "ping",
    "Health check — confirms the MCP server is reachable and responding.",
    async () => ({
      content: [{ type: "text" as const, text: JSON.stringify({ status: "ok", message: "pong" }) }],
    }),
  );
}
