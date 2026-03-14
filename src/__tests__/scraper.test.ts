import { describe, test, expect, mock, beforeAll } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const STUB_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const SCRAPE_RAW = {
  title: "Test Page",
  meta: { description: "A test page", ogTitle: "Test", ogDescription: "", author: "Someone" },
  text: "This is the page content with useful information.",
  links: [{ text: "Home", href: "http://example.com" }],
  images: [],
};

const AI_ANALYSIS = {
  page_type: "article",
  summary: "A brief summary of the page.",
  key_points: ["Point 1", "Point 2"],
};

mock.module("../lib/ai.js", () => ({
  aiJSON: mock(async () => AI_ANALYSIS),
  aiText: mock(async () => ""),
  aiCode: mock(async () => ""),
}));

mock.module("../lib/pdf-renderer.js", () => ({
  runPlaywrightOp: mock(
    async (opts: { operation: string; url?: string; maxPages?: number; fullPage?: boolean }) => {
      if (opts.operation === "scrape") return SCRAPE_RAW;
      if (opts.operation === "screenshot-scroll")
        return { screenshots: [STUB_PNG_B64, STUB_PNG_B64] };
      return { data: STUB_PNG_B64 };
    },
  ),
  generatePdfFromHtml: mock(async () => Buffer.from("%PDF-mock")),
}));

mock.module("../utils/output.js", () => ({
  saveOutput: mock(async (name: string) => `http://localhost:3001/output/${name}`),
}));

type ContentItem = { type: string; text?: string; data?: string; mimeType?: string };
type ToolResult = { content: ContentItem[]; isError?: boolean };
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

let server: MockServer;

beforeAll(async () => {
  const mod = await import("../tools/scraper/index.js");
  server = new MockServer();
  (mod.register as unknown as (s: MockServer) => void)(server as unknown as McpServer);
});

describe("scraper tools", () => {
  test("smart-scrape returns AI-analyzed page data", async () => {
    const result = await server.call("smart-scrape", {
      url: "https://example.com",
      instruction: "summarize the article",
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text!);
    expect(data.page_type).toBe("article");
    expect(data.summary).toBe("A brief summary of the page.");
    expect(data.key_points).toHaveLength(2);
  });

  test("take-screenshot returns screenshot URL and inline image", async () => {
    const result = await server.call("take-screenshot", {
      url: "https://example.com",
      full_page: false,
      scroll_pages: false,
      max_pages: 5,
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text!);
    expect(data.screenshot_url).toContain("screenshot.png");
    expect(data.source_url).toBe("https://example.com");
    expect(result.content[1].type).toBe("image");
    expect(result.content[1].mimeType).toBe("image/png");
  });

  test("take-screenshot with scroll_pages returns multiple images", async () => {
    const result = await server.call("take-screenshot", {
      url: "https://example.com",
      full_page: false,
      scroll_pages: true,
      max_pages: 5,
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text!);
    expect(data.pages).toBe(2);
    expect(data.screenshot_urls).toHaveLength(2);
    // text block + 2 images
    expect(result.content).toHaveLength(3);
  });
});
