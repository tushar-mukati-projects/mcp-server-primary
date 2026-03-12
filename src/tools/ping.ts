import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function register(server: McpServer) {
  server.tool("ping", "Health check — returns pong.", async () => ({
    content: [{ type: "text" as const, text: "pong" }],
  }));
}
