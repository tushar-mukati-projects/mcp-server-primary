import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Register public tools (no auth required).
 * These are placeholder tools — you'll replace them with your actual portfolio use cases.
 */
export function registerPublicTools(server: McpServer) {
  server.tool("ping", "Health check — returns pong. No auth required.", async () => {
    return {
      content: [{ type: "text", text: "pong" }],
    };
  });

  server.tool(
    "server_info",
    "Returns basic information about this MCP server. No auth required.",
    async () => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                name: "my-portfolio-mcp",
                version: "1.0.0",
                description:
                  "Personal portfolio MCP server with public and authenticated tools.",
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
