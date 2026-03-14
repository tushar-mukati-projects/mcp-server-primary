import { describe, test, expect, mock, beforeAll, afterAll } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

type ToolResult = { content: Array<{ type: string; text?: string }>; isError?: boolean };
type Handler = (args: Record<string, unknown>) => Promise<ToolResult>;

class MockServer {
  private handlers = new Map<string, Handler>();
  tool(n: string, _d: string, _schema: unknown, h: Handler) {
    this.handlers.set(n, h);
  }
  async call(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
    return this.handlers.get(name)!(args);
  }
}

const ARTICLES_RESPONSE = {
  status: "ok",
  totalResults: 2,
  articles: [
    {
      title: "Breaking News",
      description: "Something happened",
      url: "http://example.com/1",
      source: { name: "BBC" },
      publishedAt: "2026-03-15T10:00:00Z",
    },
    {
      title: "Tech Update",
      description: "New AI model",
      url: "http://example.com/2",
      source: { name: "TechCrunch" },
      publishedAt: "2026-03-15T09:00:00Z",
    },
  ],
};

const originalFetch = global.fetch;
let server: MockServer;

beforeAll(async () => {
  process.env.NEWS_API_KEY = "test-api-key";
  const mod = await import("../tools/news/index.js");
  server = new MockServer();
  (mod.register as unknown as (s: MockServer) => void)(server as unknown as McpServer);
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe("news tools", () => {
  test("get-top-headlines returns formatted articles", async () => {
    global.fetch = mock(
      async () => new Response(JSON.stringify(ARTICLES_RESPONSE)),
    ) as typeof fetch;

    const result = await server.call("get-top-headlines", {
      category: "technology",
      country: "us",
      page_size: 2,
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text!);
    expect(data.articles).toHaveLength(2);
    expect(data.articles[0].title).toBe("Breaking News");
    expect(data.articles[0].source).toBe("BBC");
    expect(data.articles[0].date).toBe("2026-03-15");
    expect(data.category).toBe("technology");
    expect(data.country).toBe("US");
  });

  test("search-news returns matching articles", async () => {
    global.fetch = mock(
      async () => new Response(JSON.stringify(ARTICLES_RESPONSE)),
    ) as typeof fetch;

    const result = await server.call("search-news", {
      query: "AI",
      sort_by: "publishedAt",
      page_size: 2,
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text!);
    expect(data.query).toBe("AI");
    expect(data.articles).toHaveLength(2);
    expect(data.sort_by).toBe("publishedAt");
  });

  test("search-news returns error when NewsAPI status is not ok", async () => {
    global.fetch = mock(
      async () => new Response(JSON.stringify({ status: "error", message: "apiKeyInvalid" })),
    ) as typeof fetch;

    const result = await server.call("search-news", {
      query: "test",
      sort_by: "publishedAt",
      page_size: 5,
    });
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text!);
    expect(data.error).toBeTruthy();
  });
});
