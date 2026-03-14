import { describe, test, expect, mock, beforeAll } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// 1×1 transparent PNG
const STUB_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const CHART_SPEC = {
  title: "Revenue by Quarter",
  type: "bar",
  data: {
    labels: ["Q1", "Q2", "Q3", "Q4"],
    datasets: [{ label: "Revenue", data: [100, 150, 120, 200] }],
  },
};

mock.module("../lib/ai.js", () => ({
  aiJSON: mock(async () => CHART_SPEC),
  aiText: mock(async () => ""),
  aiCode: mock(async () => ""),
}));

mock.module("../lib/quickchart.js", () => ({
  fetchChart: mock(async () => STUB_PNG),
  chartToDataUri: (buf: Buffer) => `data:image/png;base64,${buf.toString("base64")}`,
}));

mock.module("../utils/output.js", () => ({
  saveOutput: mock(async () => "http://localhost:3001/output/test-chart.png"),
}));

type ToolResult = {
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  isError?: boolean;
};
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
  const mod = await import("../tools/charts/index.js");
  server = new MockServer();
  (mod.register as unknown as (s: MockServer) => void)(server as unknown as McpServer);
});

describe("create-charts tool", () => {
  test("returns chart_url and inline image", async () => {
    const result = await server.call("create-charts", {
      markdown: "Q1: 100, Q2: 150, Q3: 120, Q4: 200",
      chart_type: "auto",
      width: 800,
      height: 500,
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text!);
    expect(data.charts).toHaveLength(1);
    expect(data.charts[0].chart_url).toBe("http://localhost:3001/output/test-chart.png");
    expect(data.charts[0].chart_title).toBe("Revenue by Quarter");
    expect(data.charts[0].chart_id).toContain("Revenue");

    // Inline image
    expect(result.content[1].type).toBe("image");
    expect(result.content[1].mimeType).toBe("image/png");
  });

  test("returns error when AI throws", async () => {
    const { aiJSON } = await import("../lib/ai.js");
    (aiJSON as ReturnType<typeof mock>).mockImplementationOnce(async () => {
      throw new Error("OpenAI timeout");
    });

    const result = await server.call("create-charts", {
      markdown: "some data",
      chart_type: "bar",
      width: 800,
      height: 500,
    });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text!);
    expect(data.error).toContain("OpenAI timeout");
  });
});
