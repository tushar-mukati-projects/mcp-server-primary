import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { env } from "./config/env.js";
import { oauthRouter } from "./auth/oauth/routes.js";
import { requireAuth } from "./auth/middleware.js";
import { registerTools } from "./tools/index.js";

const app = express();
app.use(cors({ origin: "*", exposedHeaders: ["mcp-session-id"] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(oauthRouter);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.post("/mcp", requireAuth, async (req, res) => {
  const server = new McpServer({ name: "my-portfolio-mcp", version: "1.0.0" });
  registerTools(server);

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined as unknown as (() => string) });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(env.PORT, () => console.log(`MCP server running at ${env.MCP_SERVER_URL}`));

declare global {
  namespace Express {
    interface Request { auth?: import("@modelcontextprotocol/sdk/server/auth/types.js").AuthInfo; }
  }
}
