import { describe, test, expect } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { register } from "../tools/ping/index.js";

type ToolResult = { content: Array<{ type: string; text?: string }>; isError?: boolean };
type Handler = (args: Record<string, unknown>) => Promise<ToolResult>;

class MockServer {
  private handlers = new Map<string, Handler>();
  tool(n: string, _d: string, h: Handler) {
    this.handlers.set(n, h);
  }
  async call(name: string): Promise<ToolResult> {
    return this.handlers.get(name)!({});
  }
}

describe("ping tool", () => {
  const server = new MockServer();
  register(server as unknown as McpServer);

  test("returns status ok and message pong", async () => {
    const result = await server.call("ping");
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text!);
    expect(data.status).toBe("ok");
    expect(data.message).toBe("pong");
  });
});
