import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import sharp from "sharp";

async function loadImage(url?: string, base64?: string): Promise<Buffer> {
  if (url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Failed to fetch image: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  if (base64) return Buffer.from(base64, "base64");
  throw new Error("Provide either image_url or image_base64.");
}

const imageInput = {
  image_url: z.string().url().optional().describe("URL of the image"),
  image_base64: z.string().optional().describe("Base64-encoded image data"),
};

export function register(server: McpServer) {
  server.tool(
    "compress-image",
    "Compress an image to reduce file size. Returns the compressed image inline.",
    {
      ...imageInput,
      quality: z.number().min(1).max(100).default(75).describe("Compression quality 1-100"),
      format: z.enum(["jpeg", "png", "webp"]).default("webp").describe("Output format"),
    },
    async ({ image_url, image_base64, quality, format }) => {
      try {
        const input = await loadImage(image_url, image_base64);
        const originalKB = input.length / 1024;

        let pipeline = sharp(input);
        if (format === "jpeg") pipeline = pipeline.jpeg({ quality });
        else if (format === "png") pipeline = pipeline.png({ quality });
        else pipeline = pipeline.webp({ quality });

        const output = await pipeline.toBuffer();
        const outputKB = output.length / 1024;
        const saved = ((1 - output.length / input.length) * 100).toFixed(1);

        return {
          content: [
            {
              type: "text" as const,
              text: `Compressed: ${originalKB.toFixed(1)}KB → ${outputKB.toFixed(1)}KB (${saved}% smaller)`,
            },
            {
              type: "image" as const,
              data: output.toString("base64"),
              mimeType: `image/${format}`,
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "resize-image",
    "Resize an image to specific dimensions. Returns the resized image inline.",
    {
      ...imageInput,
      width: z.number().positive().optional().describe("Target width in pixels"),
      height: z.number().positive().optional().describe("Target height in pixels"),
      fit: z
        .enum(["cover", "contain", "fill", "inside", "outside"])
        .default("inside")
        .describe("How the image should be resized to fit the dimensions"),
    },
    async ({ image_url, image_base64, width, height, fit }) => {
      try {
        if (!width && !height) throw new Error("Provide at least width or height.");
        const input = await loadImage(image_url, image_base64);
        const output = await sharp(input).resize({ width, height, fit }).png().toBuffer();
        const meta = await sharp(output).metadata();

        return {
          content: [
            { type: "text" as const, text: `Resized to ${meta.width}x${meta.height}` },
            { type: "image" as const, data: output.toString("base64"), mimeType: "image/png" },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "convert-format",
    "Convert an image to a different format (PNG, JPEG, WebP, AVIF).",
    {
      ...imageInput,
      format: z.enum(["png", "jpeg", "webp", "avif"]).describe("Target format"),
    },
    async ({ image_url, image_base64, format }) => {
      try {
        const input = await loadImage(image_url, image_base64);
        const output = await sharp(input).toFormat(format).toBuffer();
        return {
          content: [
            {
              type: "text" as const,
              text: `Converted to ${format.toUpperCase()} (${(output.length / 1024).toFixed(1)}KB)`,
            },
            {
              type: "image" as const,
              data: output.toString("base64"),
              mimeType: `image/${format}`,
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "get-image-info",
    "Get metadata and statistics about an image (format, dimensions, color info).",
    imageInput,
    async ({ image_url, image_base64 }) => {
      try {
        const input = await loadImage(image_url, image_base64);
        const meta = await sharp(input).metadata();
        const stats = await sharp(input).stats();

        const info = {
          format: meta.format,
          width: meta.width,
          height: meta.height,
          channels: meta.channels,
          colorSpace: meta.space,
          bitDepth: meta.depth,
          dpi: meta.density,
          hasAlpha: meta.hasAlpha,
          isProgressive: meta.isProgressive,
          fileSize: `${(input.length / 1024).toFixed(1)}KB`,
          dominantColor: {
            r: Math.round(stats.dominant.r),
            g: Math.round(stats.dominant.g),
            b: Math.round(stats.dominant.b),
          },
        };
        return { content: [{ type: "text" as const, text: JSON.stringify(info, null, 2) }] };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
