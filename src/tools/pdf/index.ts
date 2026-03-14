import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { aiText } from "../../lib/ai.js";
import { generatePdfFromHtml } from "../../lib/pdf-renderer.js";
import { saveOutput } from "../../utils/output.js";
import { fetchChart, chartToDataUri, type ChartDataset } from "../../lib/quickchart.js";
import { logger } from "../../lib/logger.js";
import { PDF_SYSTEM } from "./prompt.js";

const CHART_TAG_RE = /<mcp-chart\s([^>]*)(?:\s*\/?>|>.*?<\/mcp-chart>)/gis;

function parseTagAttrs(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /(\w+)=["']([^"']*)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrStr)) !== null) attrs[m[1]] = m[2];
  return attrs;
}

async function injectCharts(html: string): Promise<string> {
  const matches = [...html.matchAll(CHART_TAG_RE)];
  if (!matches.length) return html;
  logger.debug(`generate-pdf: injecting ${matches.length} chart(s)`);
  let result = html;
  for (const match of matches) {
    const a = parseTagAttrs(match[1]);
    const title = a.title ?? "Chart";
    const type = a.type ?? "bar";
    const labels = (a.labels ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const datasets: ChartDataset[] = [];
    if (a.data) {
      datasets.push({ label: a.label ?? title, data: a.data.split(",").map(Number) });
    } else {
      let i = 0;
      while (a[`data${i}`]) {
        datasets.push({
          label: a[`label${i}`] ?? `Series ${i + 1}`,
          data: a[`data${i}`].split(",").map(Number),
        });
        i++;
      }
    }
    if (!datasets.length || !labels.length) continue;
    try {
      const buf = await fetchChart(type, { labels, datasets }, title, 700, 360);
      const imgData = chartToDataUri(buf);
      result = result.replace(
        match[0],
        `<div style="text-align:center;margin:2em 0"><img src="${imgData}" alt="${title}" style="max-width:100%;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,0.1)"><p style="font-size:12px;color:#6b7280;margin-top:6px">${title}</p></div>`,
      );
    } catch {
      result = result.replace(
        match[0],
        `<p style="color:#6b7280;text-align:center">[Chart: ${title}]</p>`,
      );
    }
  }
  return result;
}

export function register(server: McpServer) {
  server.tool(
    "generate-pdf",
    "Convert markdown or structured content into a professionally designed A4 PDF — styled headings, tables, code blocks, KPI cards, and auto-rendered charts. Returns a download URL.",
    { markdown: z.string().describe("Markdown content to convert to PDF") },
    async ({ markdown }) => {
      logger.info(`generate-pdf: start — ${markdown.length} chars`);
      try {
        logger.debug("generate-pdf: calling AI for HTML");
        const rawHtml = await aiText(PDF_SYSTEM, markdown, 16000);
        logger.debug(`generate-pdf: HTML received ${rawHtml.length} chars, injecting charts`);
        const html = await injectCharts(rawHtml);
        logger.debug("generate-pdf: rendering PDF");
        const buf = await generatePdfFromHtml(html);
        const url = await saveOutput("document.pdf", buf);
        logger.info(`generate-pdf: done — ${(buf.length / 1024).toFixed(0)}KB → ${url}`);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { pdf_url: url, size_kb: Math.round(buf.length / 1024) },
                null,
                2,
              ),
            },
          ],
        };
      } catch (e) {
        logger.error(`generate-pdf: ${(e as Error).message}`);
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
