import { describe, test, expect, mock, beforeAll } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Minimal valid docx code — creates a Document and returns its buffer
const VALID_DOCX_CODE = `
const { Document, Packer, Paragraph, TextRun } = lib;
const doc = new Document({
  styles: { default: { document: { run: { font: "Calibri", size: 24, color: "374151" } } } },
  sections: [{
    properties: {},
    children: [
      new Paragraph({
        children: [new TextRun({ text: "Test Document", bold: true, size: 48, color: "1a1a2e" })],
      }),
      new Paragraph({
        children: [new TextRun({ text: "This is the document body content." })],
      }),
    ],
  }],
});
return await Packer.toBuffer(doc);
`;

// Code that returns nothing (missing return statement)
const BAD_DOCX_CODE = `
const { Document, Packer, Paragraph, TextRun } = lib;
const doc = new Document({ sections: [{ children: [] }] });
// Missing: return await Packer.toBuffer(doc);
`;

const mockAiCode = mock(async () => VALID_DOCX_CODE);

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
  const mod = await import("../tools/docx/index.js");
  server = new MockServer();
  (mod.register as unknown as (s: MockServer) => void)(server as unknown as McpServer);
});

describe("generate-docx tool", () => {
  test("generates DOCX and returns URL and metadata", async () => {
    mockAiCode.mockImplementation(async () => VALID_DOCX_CODE);

    const result = await server.call("generate-docx", {
      markdown: "# Test Document\n\nThis is the document body content.",
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text!);
    expect(data.docx_url).toContain("Test-Document");
    expect(data.title).toBe("Test Document");
    expect(data.size_kb).toBeGreaterThan(0);
  });

  test("returns error when code does not return a buffer", async () => {
    mockAiCode.mockImplementation(async () => BAD_DOCX_CODE);

    const result = await server.call("generate-docx", {
      markdown: "# Missing return",
    });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text!);
    expect(data.error).toContain("buffer");
  });

  test("returns error when AI code has syntax error", async () => {
    mockAiCode.mockImplementation(async () => {
      throw new Error("Generated code has a syntax error: Unexpected token");
    });

    const result = await server.call("generate-docx", {
      markdown: "# Test",
    });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text!);
    expect(data.error).toContain("syntax error");
  });
});
