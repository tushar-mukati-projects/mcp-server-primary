import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import PptxGenJS from "pptxgenjs";
import { aiCode } from "../../lib/ai.js";
import { saveOutput } from "../../utils/output.js";
import { fetchChart, chartToDataUri, type ChartDataset } from "../../lib/quickchart.js";
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
  return async ({ title, type, labels, datasets, width = 700, height = 380 }) => {
    console.log(`[generate-pptx] chart "${title}" (${type})`);
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
      console.log(`[generate-pptx] ${markdown.length} chars, num_slides=${num_slides ?? "auto"}`);
      try {
        const hint = num_slides ? `\n\nTarget approximately ${num_slides} slides.` : "";
        const code = await aiCode(PPTX_CODE_SYSTEM, markdown + hint);
        console.log(`[generate-pptx] code ${code.length} chars`);

        // @ts-expect-error PptxGenJS types incompatible with nodenext module resolution
        const pptx = new PptxGenJS();
        pptx.layout = "LAYOUT_WIDE";
        pptx.author = "MCP Server";

        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as {
          new (...args: string[]): (...args: unknown[]) => Promise<void>;
        };
        const fn = new AsyncFunction("pptx", "buildChart", code);
        try {
          await fn(pptx, createBuildChart());
        } catch (execErr) {
          console.error(`[generate-pptx] exec error:`, (execErr as Error).message);
          console.error(`[generate-pptx] code:\n${code}`);
          throw execErr;
        }

        const buf = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
        const titleMatch = code.match(/pptx\.title\s*=\s*["']([^"']+)["']/);
        const title = titleMatch?.[1] ?? "presentation";
        const url = saveOutput(`${title.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 50)}.pptx`, buf);
        console.log(`[generate-pptx] saved "${title}" ${(buf.length / 1024).toFixed(0)}KB`);

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
        console.error(`[generate-pptx] Error:`, (e as Error).message);
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
