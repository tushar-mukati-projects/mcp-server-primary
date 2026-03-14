import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { aiJSON } from "../lib/ai.js";
import { saveOutput } from "../utils/output.js";

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

const SYSTEM_PROMPT = `You are a data visualization expert. Analyze the given markdown content and extract data that can be visualized as a chart.

Generate a complete Chart.js configuration object. Pick colors that are professional and visually appealing.

Respond with a JSON object:
{
  "title": "Descriptive chart title",
  "type": "bar|line|pie|doughnut|radar|scatter",
  "data": {
    "labels": ["Label1", "Label2"],
    "datasets": [{
      "label": "Series name",
      "data": [10, 20, 30],
      "backgroundColor": ["rgba(59,130,246,0.7)", ...],
      "borderColor": ["rgba(59,130,246,1)", ...]
    }]
  },
  "options": {
    "plugins": {
      "title": { "display": true, "text": "Chart Title", "font": { "size": 16 } },
      "legend": { "display": true }
    },
    "scales": { "y": { "beginAtZero": true } }
  }
}

Rules:
- For pie/doughnut charts, use an array of colors for backgroundColor (one per label)
- For bar/line charts, use a single color per dataset
- Choose the chart type that best represents the data unless the user specifies one
- If the markdown has multiple datasets, include them all
- Use professional color palette: blues, teals, purples, warm accents
- Omit "scales" for pie/doughnut/radar charts`;

const LOG = "[create-charts]";

export function register(server: McpServer) {
  server.tool(
    "create-charts",
    "AI-powered chart generation. Give it any markdown with data and it will create a beautiful chart image.",
    {
      markdown: z.string().describe("Markdown content containing data to visualize"),
      chart_type: z
        .enum(["auto", "bar", "line", "pie", "doughnut", "radar", "scatter"])
        .default("auto")
        .describe("Preferred chart type, or 'auto' to let AI decide"),
      width: z.number().default(800).describe("Chart width in pixels"),
      height: z.number().default(500).describe("Chart height in pixels"),
    },
    async ({ markdown, chart_type, width, height }) => {
      console.log(`${LOG} Request received — chart_type=${chart_type}, size=${width}x${height}`);
      try {
        const typeHint =
          chart_type === "auto" ? "" : `\n\nThe user wants a "${chart_type}" chart specifically.`;

        console.log(`${LOG} Calling AI to generate Chart.js spec...`);
        const spec = await aiJSON<ChartSpec>(SYSTEM_PROMPT + typeHint, markdown);
        console.log(
          `${LOG} AI spec ready — type=${spec.type}, title="${spec.title}", datasets=${spec.data.datasets.length}`,
        );

        console.log(`${LOG} Calling QuickChart API...`);
        const res = await fetch("https://quickchart.io/chart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            width,
            height,
            format: "png",
            backgroundColor: "white",
            chart: {
              type: spec.type,
              data: spec.data,
              options: spec.options,
            },
          }),
        });

        if (!res.ok) throw new Error(`QuickChart API error: ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());

        const safeName = spec.title.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 50);
        const chart_id = `${safeName}-${Date.now()}`;
        const url = saveOutput(`${safeName}.png`, buf);
        console.log(
          `${LOG} Chart saved — id=${chart_id}, size=${(buf.length / 1024) | 0}KB, url=${url}`,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  charts: [
                    {
                      chart_id,
                      chart_title: spec.title,
                      chart_url: url,
                    },
                  ],
                },
                null,
                2,
              ),
            },
            { type: "image" as const, data: buf.toString("base64"), mimeType: "image/png" },
          ],
        };
      } catch (e) {
        console.error(`${LOG} Error:`, (e as Error).message);
        return {
          content: [
            { type: "text" as const, text: `Error creating chart: ${(e as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );
}
