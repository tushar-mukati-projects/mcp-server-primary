import { describe, test, expect } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { register } from "../tools/image/index.js";

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

// 1×1 transparent PNG (real, valid PNG)
const STUB_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("image tools", () => {
  const server = new MockServer();
  register(server as unknown as McpServer);

  test("compress-image reduces size and returns webp by default", async () => {
    const result = await server.call("compress-image", {
      image_base64: STUB_PNG_B64,
      quality: 75,
      format: "webp",
    });

    expect(result.isError).toBeUndefined();
    const meta = JSON.parse(result.content[0].text!);
    expect(meta.format).toBe("webp");
    expect(meta.original_kb).toBeGreaterThan(0);
    expect(meta.compressed_kb).toBeGreaterThan(0);
    // inline image in content
    expect(result.content[1].type).toBe("image");
    expect(result.content[1].mimeType).toBe("image/webp");
  });

  test("compress-image returns error without image input", async () => {
    const result = await server.call("compress-image", { quality: 75, format: "webp" });
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text!);
    expect(data.error).toBeTruthy();
  });

  test("resize-image returns resized PNG", async () => {
    const result = await server.call("resize-image", {
      image_base64: STUB_PNG_B64,
      width: 10,
      height: 10,
      fit: "fill",
    });

    expect(result.isError).toBeUndefined();
    const meta = JSON.parse(result.content[0].text!);
    expect(meta.width).toBe(10);
    expect(meta.height).toBe(10);
    expect(meta.format).toBe("png");
    expect(result.content[1].type).toBe("image");
  });

  test("resize-image returns error without dimensions", async () => {
    const result = await server.call("resize-image", { image_base64: STUB_PNG_B64 });
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text!);
    expect(data.error).toContain("width or height");
  });

  test("convert-image-format converts PNG to jpeg", async () => {
    const result = await server.call("convert-image-format", {
      image_base64: STUB_PNG_B64,
      format: "jpeg",
    });

    expect(result.isError).toBeUndefined();
    const meta = JSON.parse(result.content[0].text!);
    expect(meta.format).toBe("jpeg");
    expect(meta.size_kb).toBeGreaterThan(0);
    expect(result.content[1].mimeType).toBe("image/jpeg");
  });

  test("get-image-info returns metadata", async () => {
    const result = await server.call("get-image-info", { image_base64: STUB_PNG_B64 });

    expect(result.isError).toBeUndefined();
    const meta = JSON.parse(result.content[0].text!);
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(1);
    expect(meta.height).toBe(1);
    expect(meta.has_alpha).toBe(true);
    expect(meta.dominant_color).toHaveProperty("r");
    expect(meta.dominant_color).toHaveProperty("g");
    expect(meta.dominant_color).toHaveProperty("b");
  });
});
