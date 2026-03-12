import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPublicTools } from "../tools/public.js";
import { registerProtectedTools } from "../tools/protected.js";

/**
 * Factory: creates a fresh McpServer with all tools registered.
 * Called once per session (each new client connection gets its own server instance).
 */
export function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "my-portfolio-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        logging: {},
      },
    }
  );

  registerPublicTools(server);
  registerProtectedTools(server);

  return server;
}
