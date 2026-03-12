import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Register public tools.
 * Auth is enforced at the transport level — all users calling these are authenticated.
 */
export function registerPublicTools(server: McpServer) {
  server.tool(
    "ping",
    "Health check — returns pong.",
    async () => {
      return {
        content: [{ type: "text" as const, text: "pong" }],
      };
    }
  );

  server.tool(
    "server_info",
    "Returns basic information about this MCP server.",
    async () => {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                name: "my-portfolio-mcp",
                version: "1.0.0",
                description: "Personal portfolio MCP server.",
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
