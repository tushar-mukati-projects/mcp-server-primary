import { describe, test, expect, mock, beforeAll } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const STUB_HTML = `<!DOCTYPE html>
<html><head><style>body{font-family:sans-serif}</style></head>
<body><h1>Test Report</h1><p>Some content here.</p></body>
</html>`;

const HTML_WITH_CHART = `<!DOCTYPE html>
<html><body>
<h1>Chart Test</h1>
<mcp-chart type="bar" title="Sales" labels="Q1,Q2,Q3" data="10,20,30" />
</body></html>`;

// Fake PDF buffer starting with %PDF-
const STUB_PDF = Buffer.from("%PDF-1.4 fake content for testing");

const mockAiText = mock(async () => STUB_HTML);
const mockGeneratePdf = mock(async () => STUB_PDF);
const mockFetchChart = mock(async () => Buffer.from("fakechartpng"));

mock.module("../lib/ai.js", () => ({
  aiJSON: mock(async () => ({})),
  aiText: mockAiText,
  aiCode: mock(async () => ""),
}));

mock.module("../lib/pdf-renderer.js", () => ({
  generatePdfFromHtml: mockGeneratePdf,
  runPlaywrightOp: mock(async () => ({})),
}));

mock.module("../lib/quickchart.js", () => ({
  fetchChart: mockFetchChart,
  chartToDataUri: (buf: Buffer) => `data:image/png;base64,${buf.toString("base64")}`,
}));

mock.module("../utils/output.js", () => ({
  saveOutput: mock(async () => "http://localhost:3001/output/document.pdf"),
}));

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

let server: MockServer;

beforeAll(async () => {
  const mod = await import("../tools/pdf/index.js");
  server = new MockServer();
  (mod.register as unknown as (s: MockServer) => void)(server as unknown as McpServer);
});

describe("generate-pdf tool", () => {
  test("generates PDF and returns URL and size", async () => {
    mockAiText.mockImplementation(async () => STUB_HTML);
    mockGeneratePdf.mockImplementation(async () => STUB_PDF);

    const result = await server.call("generate-pdf", {
      markdown: "# Test Report\n\nSome content here.",
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text!);
    expect(data.pdf_url).toBe("http://localhost:3001/output/document.pdf");
    expect(data.size_kb).toBeGreaterThanOrEqual(0);
  });

  test("injects chart tags into HTML before rendering", async () => {
    mockAiText.mockImplementation(async () => HTML_WITH_CHART);
    mockGeneratePdf.mockImplementation(async () => STUB_PDF);

    const result = await server.call("generate-pdf", {
      markdown: "# Sales\nQ1: 10, Q2: 20, Q3: 30",
    });

    expect(result.isError).toBeUndefined();
    // fetchChart should have been called to inject the chart
    expect(mockFetchChart).toHaveBeenCalled();
    const data = JSON.parse(result.content[0].text!);
    expect(data.pdf_url).toBeTruthy();
  });

  test("returns error when PDF rendering fails", async () => {
    mockAiText.mockImplementation(async () => STUB_HTML);
    mockGeneratePdf.mockImplementation(async () => {
      throw new Error("Playwright crashed");
    });

    const result = await server.call("generate-pdf", {
      markdown: "# Crash test",
    });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text!);
    expect(data.error).toContain("Playwright crashed");
  });
});
