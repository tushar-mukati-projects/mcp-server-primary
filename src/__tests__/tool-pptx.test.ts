import { describe, test, expect, mock, beforeAll } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Minimal valid PptxGenJS code — adds one slide with a title text
const VALID_PPTX_CODE = `
pptx.title = "Test Presentation";
const s1 = pptx.addSlide();
s1.background = { fill: "FFFFFF" };
s1.addShape("rect", { x: 0, y: 0, w: "100%", h: 1.1, fill: { color: "1E2A3A" } });
s1.addText("Hello World", { x: 0.6, y: 0.22, w: 12.0, fontSize: 22, bold: true, color: "FFFFFF" });
s1.addText("Subtitle goes here", { x: 0.6, y: 1.4, w: 12.0, fontSize: 16, color: "374151" });
`;

// Code that calls an undefined function — throws at runtime
const RUNTIME_ERROR_CODE = `
pptx.title = "Error Deck";
const s = pptx.addSlide();
undefinedFunctionThatDoesNotExist();
`;

const mockAiCode = mock(async () => VALID_PPTX_CODE);

mock.module("../lib/ai.js", () => ({
  aiJSON: mock(async () => ({})),
  aiText: mock(async () => ""),
  aiCode: mockAiCode,
}));

mock.module("../lib/quickchart.js", () => ({
  fetchChart: mock(async () => Buffer.alloc(10)),
  chartToDataUri: () => "data:image/png;base64,abc",
}));

mock.module("../utils/output.js", () => ({
  saveOutput: mock(async (name: string) => `http://localhost:3001/output/${name}`),
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
  const mod = await import("../tools/pptx/index.js");
  server = new MockServer();
  (mod.register as unknown as (s: MockServer) => void)(server as unknown as McpServer);
});

describe("generate-pptx tool", () => {
  test("generates PPTX and returns URL and metadata", async () => {
    mockAiCode.mockImplementation(async () => VALID_PPTX_CODE);

    const result = await server.call("generate-pptx", {
      markdown: "# Test Presentation\n- Point 1\n- Point 2",
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text!);
    expect(data.pptx_url).toContain("Test-Presentation");
    expect(data.title).toBe("Test Presentation");
    expect(data.size_kb).toBeGreaterThan(0);
  });

  test("returns error when generated code throws at runtime", async () => {
    mockAiCode.mockImplementation(async () => RUNTIME_ERROR_CODE);

    const result = await server.call("generate-pptx", {
      markdown: "# Test\n- Some content",
    });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text!);
    expect(data.error).toBeTruthy();
  });

  test("respects num_slides hint in prompt", async () => {
    mockAiCode.mockImplementation(async () => VALID_PPTX_CODE);
    // Just verify it doesn't throw — the hint is passed to aiCode prompt
    const result = await server.call("generate-pptx", {
      markdown: "# Deck\n- content",
      num_slides: 5,
    });
    expect(result.isError).toBeUndefined();
  });
});
