import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { aiJSON } from "../../lib/ai.js";
import { saveOutput } from "../../utils/output.js";
import { logger } from "../../lib/logger.js";
import { CHART_SYSTEM } from "./prompt.js";

interface ChartSpec {
  title: string;
  type: "bar" | "line" | "pie" | "doughnut" | "radar" | "scatter";
  data: {
    labels: string[];
    datasets: Array<{
      label: string;
      data: number[];
      backgroundColor?: string | string[];
      borderColor?: string | string[];
    }>;
  };
  options?: Record<string, unknown>;
}

export function register(server: McpServer) {
  server.tool(
    "create-charts",
    "Generate beautiful, publication-ready chart images from any data — bar, line, pie, doughnut, radar, or scatter. AI automatically picks the best chart type and styling.",
    {
      markdown: z.string().describe("Markdown or text content containing data to visualize"),
      chart_type: z
        .enum(["auto", "bar", "line", "pie", "doughnut", "radar", "scatter"])
        .default("auto")
        .describe("Chart type, or 'auto' to let AI decide"),
      width: z.number().default(800).describe("Chart width in pixels"),
      height: z.number().default(500).describe("Chart height in pixels"),
    },
    async ({ markdown, chart_type, width, height }) => {
      logger.info(`create-charts: start — type=${chart_type}, size=${width}x${height}`);
      try {
        logger.debug("create-charts: calling AI for chart spec");
        const typeHint = chart_type === "auto" ? "" : `\n\nUse a "${chart_type}" chart.`;
        const spec = await aiJSON<ChartSpec>(CHART_SYSTEM + typeHint, markdown);
        logger.debug(`create-charts: spec received — type=${spec.type}, title="${spec.title}"`);

        logger.debug("create-charts: fetching chart from QuickChart");
        const res = await fetch("https://quickchart.io/chart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            width,
            height,
            format: "png",
            backgroundColor: "white",
            chart: { type: spec.type, data: spec.data, options: spec.options },
          }),
        });
        if (!res.ok) throw new Error(`QuickChart error: ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());

        const safeName = spec.title.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 50);
        const chart_id = `${safeName}-${Date.now()}`;
        const url = await saveOutput(`${safeName}.png`, buf);
        logger.info(`create-charts: done — ${(buf.length / 1024) | 0}KB → ${url}`);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { charts: [{ chart_id, chart_title: spec.title, chart_url: url }] },
                null,
                2,
              ),
            },
            { type: "image" as const, data: buf.toString("base64"), mimeType: "image/png" },
          ],
        };
      } catch (e) {
        logger.error(`create-charts: ${(e as Error).message}`);
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
