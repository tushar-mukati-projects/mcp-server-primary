import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const sessions = new Map<
  string,
  { transport: StreamableHTTPServerTransport; server: McpServer }
>();

export function getSession(sessionId: string) {
  return sessions.get(sessionId);
}

export function storeSession(
  sessionId: string,
  transport: StreamableHTTPServerTransport,
  server: McpServer
) {
  sessions.set(sessionId, { transport, server });
}

export function removeSession(sessionId: string) {
  const session = sessions.get(sessionId);
  if (session) {
    session.transport.close();
    sessions.delete(sessionId);
  }
}

export async function closeAllSessions() {
  for (const [id, session] of sessions) {
    await session.transport.close();
    sessions.delete(id);
  }
}
