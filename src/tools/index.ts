import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { register as ping } from "./ping.js";
import { register as whoami } from "./whoami.js";

export function registerTools(server: McpServer) {
  ping(server);
  whoami(server);
}
