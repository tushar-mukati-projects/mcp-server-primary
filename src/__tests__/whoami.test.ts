import { describe, test, expect, mock } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

mock.module("../auth/provider.js", () => ({
  provider: { userinfoEndpoint: "http://mock-idp/userinfo" },
}));

type ToolResult = { content: Array<{ type: string; text?: string }>; isError?: boolean };
type Handler = (extra: { authInfo?: { token?: string; scopes?: string[] } }) => Promise<ToolResult>;

class MockServer {
  private handlers = new Map<string, Handler>();
  tool(n: string, _d: string, h: Handler) {
    this.handlers.set(n, h);
  }
  async call(name: string, authInfo?: { token?: string; scopes?: string[] }): Promise<ToolResult> {
    return this.handlers.get(name)!({ authInfo });
  }
}

function fakeJwt(payload: Record<string, unknown>): string {
  const h = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const b = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${h}.${b}.fakesig`;
}

const { register } = await import("../tools/whoami/index.js");

describe("whoami tool", () => {
  const server = new MockServer();
  register(server as unknown as McpServer);

  test("returns error when not authenticated", async () => {
    const result = await server.call("whoami", undefined);
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text!);
    expect(data.error).toBe("Not authenticated");
  });

  test("returns decoded claims when authenticated", async () => {
    global.fetch = mock(
      async () =>
        new Response(JSON.stringify({ email: "test@example.com", name: "Test User" }), {
          status: 200,
        }),
    ) as typeof fetch;

    const token = fakeJwt({
      sub: "user-123",
      email: "test@example.com",
      name: "Test User",
    });

    const result = await server.call("whoami", { token, scopes: ["openid"] });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text!);
    expect(data.sub).toBe("user-123");
    expect(data.email).toBe("test@example.com");
    expect(data.scopes).toEqual(["openid"]);
  });
});
