import express from "express";
import cors from "cors";
import { randomUUID } from "crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { env } from "./config/env.js";
import { oauthRouter } from "./auth/oauth-routes.js";
import { optionalBearerAuth } from "./auth/middleware.js";
import { createMcpServer } from "./server/create-mcp-server.js";
import {
  getSession,
  storeSession,
  removeSession,
  closeAllSessions,
} from "./server/session-manager.js";

const app = express();

// Middleware
app.use(
  cors({
    origin: "*",
    exposedHeaders: ["mcp-session-id"],
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// OAuth 2.1 discovery & registration routes (no auth)
app.use(oauthRouter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ---------- MCP Streamable HTTP Transport ----------

// POST /mcp — main MCP message endpoint
app.post("/mcp", optionalBearerAuth, async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  // Existing session
  if (sessionId) {
    const session = getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    // req.auth is set by optionalBearerAuth — SDK reads it from req.auth
    await session.transport.handleRequest(req, res, req.body);
    return;
  }

  // New session — must be an initialize request
  const body = req.body;
  if (!isInitializeRequest(body)) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32600,
        message: "First request must be an initialize request",
      },
      id: null,
    });
    return;
  }

  // Create new transport + server
  let mcpServer: ReturnType<typeof createMcpServer>;
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (newSessionId) => {
      storeSession(newSessionId, transport, mcpServer);
    },
  });

  mcpServer = createMcpServer();
  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, body);
});

// GET /mcp — SSE stream for server-initiated messages
app.get("/mcp", optionalBearerAuth, async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId) {
    res.status(400).json({ error: "Missing mcp-session-id header" });
    return;
  }

  const session = getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  await session.transport.handleRequest(req, res);
});

// DELETE /mcp — close session
app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId) {
    res.status(400).json({ error: "Missing mcp-session-id header" });
    return;
  }

  removeSession(sessionId);
  res.status(200).json({ status: "session closed" });
});

// ---------- Start Server ----------

const server = app.listen(env.PORT, () => {
  console.log(`MCP server running at ${env.MCP_SERVER_URL}`);
  console.log(`  POST/GET/DELETE /mcp — MCP Streamable HTTP`);
  console.log(
    `  GET /.well-known/oauth-protected-resource — OAuth Resource Metadata`
  );
  console.log(
    `  GET /.well-known/oauth-authorization-server — OAuth AS Metadata`
  );
  console.log(`  POST /oauth/register — Dynamic Client Registration`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  await closeAllSessions();
  server.close();
  process.exit(0);
});
