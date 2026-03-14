import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import PptxGenJS from "pptxgenjs";
import { aiCode } from "../../lib/ai.js";
import { saveOutput } from "../../utils/output.js";
import { fetchChart, chartToDataUri, type ChartDataset } from "../../lib/quickchart.js";
import { logger } from "../../lib/logger.js";
import { PPTX_CODE_SYSTEM } from "./prompt.js";

type BuildChartFn = (args: {
  title: string;
  type: string;
  labels: string[];
  datasets: ChartDataset[];
  width?: number;
  height?: number;
}) => Promise<string>;

function createBuildChart(): BuildChartFn {
  return async ({ title, type, labels, datasets, width = 896, height = 504 }) => {
    logger.debug(`generate-pptx: building chart "${title}" (${type} ${width}x${height})`);
    const buf = await fetchChart(type, { labels, datasets }, title, width, height);
    return chartToDataUri(buf);
  };
}

export function register(server: McpServer) {
  server.tool(
    "generate-pptx",
    "Create complete, content-faithful PowerPoint presentations from any outline or markdown. AI generates the full slide deck with charts, tables, bullets, and split layouts — zero summarization.",
    {
      markdown: z.string().describe("Markdown or structured outline of the presentation content"),
      num_slides: z
        .number()
        .min(3)
        .max(40)
        .optional()
        .describe("Target slide count (AI will aim for this)"),
    },
    async ({ markdown, num_slides }) => {
      logger.info(
        `generate-pptx: start — ${markdown.length} chars, num_slides=${num_slides ?? "auto"}`,
      );
      try {
        const hint = num_slides ? `\n\nTarget approximately ${num_slides} slides.` : "";
        logger.debug("generate-pptx: calling AI for slide code");
        const code = await aiCode(PPTX_CODE_SYSTEM, markdown + hint);
        logger.debug(`generate-pptx: code received ${code.length} chars`);

        // @ts-expect-error PptxGenJS types incompatible with nodenext module resolution
        const pptx = new PptxGenJS();
        pptx.layout = "LAYOUT_WIDE";
        pptx.author = "MCP Server";

        // Count slide additions to detect IIFE / zero-slide code
        let slideCount = 0;
        const origAddSlide = pptx.addSlide.bind(pptx) as typeof pptx.addSlide;
        (pptx as unknown as Record<string, unknown>).addSlide = (...args: unknown[]) => {
          slideCount++;
          return (origAddSlide as (...a: unknown[]) => ReturnType<typeof pptx.addSlide>)(...args);
        };

        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as {
          new (...args: string[]): (...args: unknown[]) => Promise<void>;
        };
        const fn = new AsyncFunction("pptx", "buildChart", code);
        logger.debug("generate-pptx: executing slide code");
        try {
          await fn(pptx, createBuildChart());
        } catch (execErr) {
          logger.error(`generate-pptx: exec error — ${(execErr as Error).message}`);
          logger.error(`generate-pptx: code:\n${code}`);
          throw execErr;
        }

        if (slideCount === 0) {
          logger.error(`generate-pptx: 0 slides added (possible IIFE wrapping)\n${code}`);
          throw new Error("Generated code added 0 slides (possible IIFE wrapping). Retry.");
        }
        logger.debug(`generate-pptx: ${slideCount} slides built, writing buffer`);

        const buf = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
        const titleMatch = code.match(/pptx\.title\s*=\s*["']([^"']+)["']/);
        const title = titleMatch?.[1] ?? "presentation";
        const url = await saveOutput(
          `${title.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 50)}.pptx`,
          buf,
        );
        logger.info(
          `generate-pptx: done — "${title}" ${slideCount} slides, ${(buf.length / 1024).toFixed(0)}KB → ${url}`,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { pptx_url: url, title, size_kb: Math.round(buf.length / 1024) },
                null,
                2,
              ),
            },
          ],
        };
      } catch (e) {
        logger.error(`generate-pptx: ${(e as Error).message}`);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ error: (e as Error).message }) },
          ],
          isError: true,
        };
      }
    },
  );
}
