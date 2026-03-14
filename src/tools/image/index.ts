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
  image_url: z.string().url().optional().describe("Public URL of the source image"),
  image_base64: z.string().optional().describe("Base64-encoded source image data"),
};

function err(e: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: (e as Error).message }) }],
    isError: true,
  };
}

export function register(server: McpServer) {
  server.tool(
    "compress-image",
    "Compress an image to reduce file size while preserving visual quality. Returns the compressed image inline alongside savings stats.",
    {
      ...imageInput,
      quality: z
        .number()
        .min(1)
        .max(100)
        .default(75)
        .describe("Output quality 1–100 (75 recommended)"),
      format: z
        .enum(["jpeg", "png", "webp"])
        .default("webp")
        .describe("Output format — WebP gives the best compression"),
    },
    async ({ image_url, image_base64, quality, format }) => {
      try {
        const input = await loadImage(image_url, image_base64);
        let pipeline = sharp(input);
        if (format === "jpeg") pipeline = pipeline.jpeg({ quality });
        else if (format === "png") pipeline = pipeline.png({ quality });
        else pipeline = pipeline.webp({ quality });
        const output = await pipeline.toBuffer();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  original_kb: parseFloat((input.length / 1024).toFixed(1)),
                  compressed_kb: parseFloat((output.length / 1024).toFixed(1)),
                  saved_pct: parseFloat(((1 - output.length / input.length) * 100).toFixed(1)),
                  format,
                },
                null,
                2,
              ),
            },
            {
              type: "image" as const,
              data: output.toString("base64"),
              mimeType: `image/${format}`,
            },
          ],
        };
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "resize-image",
    "Resize an image to specific dimensions. Supports cover, contain, fill, inside, and outside fit modes. Returns the resized image inline.",
    {
      ...imageInput,
      width: z.number().positive().optional().describe("Target width in pixels"),
      height: z.number().positive().optional().describe("Target height in pixels"),
      fit: z
        .enum(["cover", "contain", "fill", "inside", "outside"])
        .default("inside")
        .describe("Resize fit mode — 'inside' preserves aspect ratio without cropping"),
    },
    async ({ image_url, image_base64, width, height, fit }) => {
      try {
        if (!width && !height) throw new Error("Provide at least width or height.");
        const input = await loadImage(image_url, image_base64);
        const output = await sharp(input).resize({ width, height, fit }).png().toBuffer();
        const meta = await sharp(output).metadata();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { width: meta.width, height: meta.height, format: "png" },
                null,
                2,
              ),
            },
            { type: "image" as const, data: output.toString("base64"), mimeType: "image/png" },
          ],
        };
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "convert-image-format",
    "Convert an image between formats: PNG, JPEG, WebP, or AVIF. Returns the converted image inline.",
    {
      ...imageInput,
      format: z.enum(["png", "jpeg", "webp", "avif"]).describe("Target output format"),
    },
    async ({ image_url, image_base64, format }) => {
      try {
        const input = await loadImage(image_url, image_base64);
        const output = await sharp(input).toFormat(format).toBuffer();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { format, size_kb: parseFloat((output.length / 1024).toFixed(1)) },
                null,
                2,
              ),
            },
            {
              type: "image" as const,
              data: output.toString("base64"),
              mimeType: `image/${format}`,
            },
          ],
        };
      } catch (e) {
        return err(e);
      }
    },
  );

  server.tool(
    "get-image-info",
    "Extract detailed metadata from any image — format, dimensions, color space, DPI, alpha channel, and dominant color.",
    imageInput,
    async ({ image_url, image_base64 }) => {
      try {
        const input = await loadImage(image_url, image_base64);
        const meta = await sharp(input).metadata();
        const stats = await sharp(input).stats();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  format: meta.format,
                  width: meta.width,
                  height: meta.height,
                  channels: meta.channels,
                  color_space: meta.space,
                  bit_depth: meta.depth,
                  dpi: meta.density,
                  has_alpha: meta.hasAlpha,
                  is_progressive: meta.isProgressive,
                  file_size_kb: parseFloat((input.length / 1024).toFixed(1)),
                  dominant_color: {
                    r: Math.round(stats.dominant.r),
                    g: Math.round(stats.dominant.g),
                    b: Math.round(stats.dominant.b),
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (e) {
        return err(e);
      }
    },
  );
}
