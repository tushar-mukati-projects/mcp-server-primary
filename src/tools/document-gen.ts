import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import PptxGenJS from "pptxgenjs";
import { aiText, aiCode } from "../lib/ai.js";
import { generatePdfFromHtml } from "../lib/pdf-renderer.js";
import { saveOutput } from "../utils/output.js";

// ── Shared QuickChart helper ───────────────────────────────────────────

interface ChartDataset {
  label: string;
  data: number[];
}

interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
}

async function fetchChartImage(
  type: string,
  data: ChartData,
  title: string,
  width = 700,
  height = 380,
): Promise<string> {
  const PALETTE = [
    "rgba(59,130,246,0.85)",
    "rgba(16,185,129,0.85)",
    "rgba(245,158,11,0.85)",
    "rgba(139,92,246,0.85)",
    "rgba(239,68,68,0.85)",
    "rgba(20,184,166,0.85)",
  ];

  const datasets = data.datasets.map((ds, i) => ({
    ...ds,
    backgroundColor:
      type === "pie" || type === "doughnut"
        ? PALETTE.slice(0, data.labels.length)
        : PALETTE[i % PALETTE.length],
    borderColor: type === "line" ? PALETTE[i % PALETTE.length].replace("0.85", "1") : undefined,
    borderWidth: type === "line" ? 2 : undefined,
    fill: type === "line" ? false : undefined,
    tension: type === "line" ? 0.3 : undefined,
    pointRadius: type === "line" ? 4 : undefined,
  }));

  const res = await fetch("https://quickchart.io/chart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      width,
      height,
      devicePixelRatio: 2,
      format: "png",
      backgroundColor: "white",
      chart: {
        type,
        data: { labels: data.labels, datasets },
        options: {
          plugins: {
            title: {
              display: !!title,
              text: title,
              font: { size: 13 },
              color: "#1a1a2e",
            },
            legend: {
              display: data.datasets.length > 1 || type === "pie" || type === "doughnut",
              position: "bottom",
            },
          },
          scales:
            type === "pie" || type === "doughnut" || type === "radar"
              ? undefined
              : { y: { beginAtZero: true, grid: { color: "rgba(0,0,0,0.05)" } } },
        },
      },
    }),
  });

  if (!res.ok) throw new Error(`QuickChart error: ${res.status} ${await res.text()}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:image/png;base64,${buf.toString("base64")}`;
}

// buildChart helper passed into AI-generated PPTX code
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
    console.log(`[generate-pptx] Building chart "${title}" (${type})...`);
    return fetchChartImage(type, { labels, datasets }, title, width, height);
  };
}

// ── PDF ────────────────────────────────────────────────────────────────

// Regex to find <mcp-chart ...> tags and parse their attributes
const CHART_TAG_RE = /<mcp-chart\s([^>]*)(?:\s*\/?>|>.*?<\/mcp-chart>)/gis;

function parseTagAttrs(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /(\w+)=["']([^"']*)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrStr)) !== null) attrs[m[1]] = m[2];
  return attrs;
}

async function injectPdfCharts(html: string): Promise<string> {
  const matches = [...html.matchAll(CHART_TAG_RE)];
  if (matches.length === 0) return html;
  console.log(`[generate-pdf] Injecting ${matches.length} chart(s)...`);

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

    if (datasets.length === 0 || labels.length === 0) continue;

    try {
      const imgData = await fetchChartImage(type, { labels, datasets }, title, 700, 360);
      const replacement = `<div style="text-align:center;margin:2em 0"><img src="${imgData}" alt="${title}" style="max-width:100%;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,0.1)"><p style="font-size:12px;color:#6b7280;margin-top:6px">${title}</p></div>`;
      result = result.replace(match[0], replacement);
      console.log(`[generate-pdf] Chart injected: "${title}"`);
    } catch (e) {
      console.error(`[generate-pdf] Chart injection failed "${title}":`, (e as Error).message);
      result = result.replace(
        match[0],
        `<p style="color:#6b7280;text-align:center">[Chart: ${title}]</p>`,
      );
    }
  }
  return result;
}

const PDF_SYSTEM = `You are an expert document designer. Convert the given markdown into a beautiful, professional HTML document optimized for PDF printing (A4, print media).

Design system:
- Font: system-ui, -apple-system, 'Segoe UI', sans-serif
- Headings: #1a1a2e (dark navy), bold
- Body text: #4a4a6a, 1.6 line-height, font-size 14px
- Accent: #3b82f6 (blue)
- Margins: 0 (Playwright adds them)
- Max content width: 100%

Styling requirements (ALL CSS must be inline in a <style> tag):
- h1: font-size 32px, color #1a1a2e, margin-bottom 8px, padding-bottom 12px, border-bottom 3px solid #3b82f6
- h2: font-size 24px, color #1a1a2e, margin-top 32px, margin-bottom 8px, padding-left 12px, border-left 4px solid #3b82f6
- h3: font-size 18px, color #1a1a2e, margin-top 24px
- p: color #4a4a6a, line-height 1.7
- ul/ol: padding-left 24px, color #4a4a6a
- li: margin-bottom 6px
- table: width 100%, border-collapse collapse, margin 20px 0
- th: background #1a1a2e, color white, padding 10px 14px, font-size 13px, text-align left
- td: padding 9px 14px, border-bottom 1px solid #e5e7eb, font-size 13px, color #4a4a6a
- tr:nth-child(even) td: background #f8fafc
- blockquote: border-left 4px solid #3b82f6, background #eff6ff, padding 12px 16px, margin 16px 0, border-radius 0 6px 6px 0, color #1a1a2e, font-style italic
- code: background #f1f5f9, padding 2px 6px, border-radius 4px, font-size 13px, color #1e40af
- pre: background #1e293b, color #e2e8f0, padding 16px, border-radius 8px, overflow-x auto
- .title-block: background linear-gradient(135deg, #1a1a2e, #2d3a6e), color white, padding 40px, margin-bottom 32px, border-radius 8px
- .kpi-grid: display grid, grid-template-columns repeat(auto-fit, minmax(180px, 1fr)), gap 16px, margin 20px 0
- .kpi-card: background #eff6ff, border 1px solid #bfdbfe, border-radius 8px, padding 16px, text-align center
- .kpi-value: font-size 28px, font-weight bold, color #1a1a2e
- .kpi-label: font-size 12px, color #6b7280, margin-top 4px

Charts:
- If the content contains numerical data suitable for visualization, insert a <mcp-chart> tag
- Format: <mcp-chart title="Chart Title" type="bar|line|pie|doughnut" labels="Label1,Label2,Label3" data="10,20,30" label="Series Name">
- Multiple datasets: data0="10,20" label0="Series A" data1="30,40" label1="Series B"
- Place the chart near the relevant data section, charts will be automatically rendered as images

Return ONLY the raw HTML starting with <!DOCTYPE html>. No markdown fences, no explanation.`;

// ── PPTX ──────────────────────────────────────────────────────────────

const PPTX_CODE_SYSTEM = `You are a PptxGenJS v4 expert. Generate JavaScript code to build a complete, professional PowerPoint presentation preserving ALL content.

Your code runs as the body of:  async function buildPresentation(pptx, buildChart) { YOUR_CODE_HERE }

AVAILABLE API:
pptx.title = "Presentation Title";  // set this first
const s = pptx.addSlide();
s.background = { fill: "RRGGBB" };  // hex without #
s.addText("text\\nline2", { x, y, w, h, fontSize, bold, italic, color, align, bullet, valign, lineSpacingMultiple });
  // x, y, w, h: numbers in inches (LAYOUT_WIDE = 13.33" × 7.5") or "XX%" string
  // bullet: true  → adds bullet point to each newline-separated line
  // align: "left"|"center"|"right"  |  valign: "top"|"middle"|"bottom"
  // color, fill colours: hex WITHOUT #
s.addShape("rect", { x, y, w, h, fill: { color: "HEX" }, line: { color: "HEX", pt: 1 } });
s.addImage({ data: imgDataUri, x, y, w, h });  // imgDataUri is base64 data URI
s.addTable(rows, { x, y, w, colW: [w1, w2], rowH: 0.45, border: { type:"solid", pt:0.5, color:"E2E8F0" }, fontSize: 12, fontFace: "Arial" });
  // rows: Array<Array<{ text: string, options?: { bold?, color?, fill?: { color } } }>>

CHARTS — call buildChart (it returns a Promise<string> base64 dataURI):
const img = await buildChart({ title, type, labels, datasets, width?, height? });
// type: "bar"|"line"|"pie"|"doughnut"
// datasets: [{ label: "name", data: [1,2,3] }]
s.addImage({ data: img, x, y, w, h });

DESIGN SYSTEM (use consistently, hex WITHOUT #):
- Slide bg: "FFFFFF"
- Header bar: fill "1a1a2e", x:0, y:0, w:"100%", h:1.1  → title text: color "FFFFFF", fontSize 22, bold, x:0.6, y:0.22
- Title slide: full left bar fill "3b82f6" w:0.2; title fontSize:38 bold color:"1a1a2e"; subtitle fontSize:20 color:"4a4a6a"
- Section slide: full bg "1a1a2e"; title fontSize:32 bold color:"FFFFFF" centered; accent line fill "3b82f6"
- Body text: color "4a4a6a", fontSize 14-16
- Accent / dividers: fill "3b82f6"
- Table header row: fill "1a1a2e", text "FFFFFF", bold
- Table data rows: alternating fill "F8FAFC" / "FFFFFF", text "4a4a6a"
- Chart (full slide): w:9.0 h:4.73 centered at x:2.17 y:1.93
- Chart (half slide, split layout): w:5.2 h:3.08 centered in column; divider: fill "3b82f6" w:0.04 at x:6.55

WORKING EXAMPLE — follow this exact pattern:
\`\`\`javascript
pptx.title = "EV Market Report";

// ── Slide 1: Title ────────────────────────────────────────────────────
const s1 = pptx.addSlide();
s1.background = { fill: "FFFFFF" };
s1.addShape("rect", { x: 0, y: 0, w: 0.2, h: "100%", fill: { color: "3b82f6" } });
s1.addText("EV Market Report", { x: 0.5, y: "28%", w: 12.6, fontSize: 38, bold: true, color: "1a1a2e" });
s1.addText("Q4 2024 Analysis", { x: 0.5, y: "55%", w: 12.6, fontSize: 20, color: "4a4a6a" });

// ── Slide 2: Bullet content ───────────────────────────────────────────
const s2 = pptx.addSlide();
s2.background = { fill: "FFFFFF" };
s2.addShape("rect", { x: 0, y: 0, w: "100%", h: 1.1, fill: { color: "1a1a2e" } });
s2.addText("Key Findings", { x: 0.6, y: 0.22, w: 12.0, fontSize: 22, bold: true, color: "FFFFFF" });
s2.addText("Global EV sales reached 14.2 million units\\nBattery costs dropped 40% since 2020\\nChina accounts for 60% of global EV sales\\nEurope shows 35% year-over-year growth", {
  x: 0.8, y: 1.35, w: 11.7, h: 5.5,
  bullet: true, fontSize: 16, color: "4a4a6a",
  lineSpacingMultiple: 1.6, valign: "top"
});

// ── Slide 3: Chart ────────────────────────────────────────────────────
const s3 = pptx.addSlide();
s3.background = { fill: "FFFFFF" };
s3.addShape("rect", { x: 0, y: 0, w: "100%", h: 1.1, fill: { color: "1a1a2e" } });
s3.addText("Annual EV Sales", { x: 0.6, y: 0.22, w: 12.0, fontSize: 22, bold: true, color: "FFFFFF" });
const chartImg = await buildChart({
  title: "EV Sales (millions)", type: "bar",
  labels: ["2020", "2021", "2022", "2023", "2024"],
  datasets: [{ label: "Sales", data: [3.2, 6.5, 10.2, 14.2, 17.8] }]
});
s3.addImage({ data: chartImg, x: 2.17, y: 1.93, w: 9.0, h: 4.73 });

// ── Slide 4: Table ────────────────────────────────────────────────────
const s4 = pptx.addSlide();
s4.background = { fill: "FFFFFF" };
s4.addShape("rect", { x: 0, y: 0, w: "100%", h: 1.1, fill: { color: "1a1a2e" } });
s4.addText("Market Share by Region", { x: 0.6, y: 0.22, w: 12.0, fontSize: 22, bold: true, color: "FFFFFF" });
s4.addTable([
  [{ text: "Region", options: { bold: true, color: "FFFFFF", fill: { color: "1a1a2e" } } },
   { text: "Units (M)", options: { bold: true, color: "FFFFFF", fill: { color: "1a1a2e" } } },
   { text: "Share", options: { bold: true, color: "FFFFFF", fill: { color: "1a1a2e" } } }],
  [{ text: "China", options: { color: "4a4a6a", fill: { color: "F8FAFC" } } },
   { text: "8.5", options: { color: "4a4a6a", fill: { color: "F8FAFC" } } },
   { text: "60%", options: { color: "4a4a6a", fill: { color: "F8FAFC" } } }],
  [{ text: "Europe", options: { color: "4a4a6a", fill: { color: "FFFFFF" } } },
   { text: "3.1", options: { color: "4a4a6a", fill: { color: "FFFFFF" } } },
   { text: "22%", options: { color: "4a4a6a", fill: { color: "FFFFFF" } } }],
], { x: 0.5, y: 1.3, w: 12.3, colW: [5.5, 3.4, 3.4], rowH: 0.5, fontSize: 13 });

// ── Slide 5: Split layout (chart + bullets) ───────────────────────────
const s5 = pptx.addSlide();
s5.background = { fill: "FFFFFF" };
s5.addShape("rect", { x: 0, y: 0, w: "100%", h: 1.1, fill: { color: "1a1a2e" } });
s5.addText("Battery Technology", { x: 0.6, y: 0.22, w: 12.0, fontSize: 22, bold: true, color: "FFFFFF" });
const splitChart = await buildChart({
  title: "Cost per kWh ($)", type: "line",
  labels: ["2019", "2020", "2021", "2022", "2023"],
  datasets: [{ label: "$/kWh", data: [156, 137, 118, 102, 92] }]
});
s5.addImage({ data: splitChart, x: 0.3, y: 1.4, w: 5.2, h: 3.08 });
s5.addShape("rect", { x: 6.55, y: 1.3, w: 0.04, h: 5.8, fill: { color: "3b82f6" } });
s5.addText("Costs fell 41% over 5 years\\nSolid-state expected by 2026\\nNew chemistry doubles range\\nRecycling programs expanding", {
  x: 6.8, y: 1.4, w: 6.2, h: 5.8,
  bullet: true, fontSize: 15, color: "4a4a6a",
  lineSpacingMultiple: 1.5, valign: "middle"
});

// ── Slide 6: Closing ──────────────────────────────────────────────────
const s6 = pptx.addSlide();
s6.background = { fill: "1a1a2e" };
s6.addShape("rect", { x: 5.67, y: 3.5, w: 2.0, h: 0.08, fill: { color: "3b82f6" } });
s6.addText("Thank You", { x: 0, y: "35%", w: "100%", fontSize: 36, bold: true, align: "center", color: "FFFFFF" });
s6.addText("Questions & Discussion", { x: 0, y: "55%", w: "100%", fontSize: 18, align: "center", color: "4a4a6a" });
\`\`\`

CRITICAL RULES:
1. Preserve ALL content — include every bullet, row, column, and data point from the input
2. Do NOT summarize, abbreviate, or skip any content
3. For charts, call await buildChart(...) with the exact data from the input
4. For tables, include ALL rows
5. For bullet lists, include ALL items — join with "\\n" and use bullet: true
6. Only use \`pptx\` and \`buildChart\` — no require, import, fetch, console, process, or fs
7. Set pptx.title at the very first line
8. Do NOT add a return statement at the end
9. addText with bullet:true — pass ALL bullets as ONE string joined with "\\n", NOT as an array`;

// ── Tool registration ─────────────────────────────────────────────────

export function register(server: McpServer) {
  server.tool(
    "generate-pdf",
    "AI-powered PDF generation. Converts markdown to a professionally designed A4 PDF with styled headings, tables, code blocks, and auto-rendered charts.",
    {
      markdown: z.string().describe("Markdown content to convert to PDF"),
    },
    async ({ markdown }) => {
      console.log(`[generate-pdf] Request received — ${markdown.length} chars`);
      try {
        console.log(`[generate-pdf] Calling AI to generate HTML...`);
        const rawHtml = await aiText(PDF_SYSTEM, markdown);
        console.log(`[generate-pdf] HTML ready (${rawHtml.length} chars), injecting charts...`);

        const html = await injectPdfCharts(rawHtml);

        console.log(`[generate-pdf] Rendering PDF with Playwright...`);
        const buf = await generatePdfFromHtml(html);
        const url = saveOutput("document.pdf", buf);
        console.log(`[generate-pdf] Saved — ${(buf.length / 1024).toFixed(0)}KB, url=${url}`);

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
        console.error(`[generate-pdf] Error:`, (e as Error).message);
        return {
          content: [
            { type: "text" as const, text: `Error generating PDF: ${(e as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "generate-pptx",
    "AI-powered PowerPoint generation. The AI writes the full PptxGenJS code to faithfully reproduce every piece of content — bullets, tables, charts, exact data — without summarizing.",
    {
      markdown: z.string().describe("Markdown or structured outline of the presentation content"),
      num_slides: z
        .number()
        .min(3)
        .max(40)
        .optional()
        .describe("Target number of slides (AI will aim for this)"),
    },
    async ({ markdown, num_slides }) => {
      console.log(
        `[generate-pptx] Request — ${markdown.length} chars, num_slides=${num_slides ?? "auto"}`,
      );
      try {
        const hint = num_slides
          ? `\n\nThe presentation should have approximately ${num_slides} slides.`
          : "";

        console.log(`[generate-pptx] Calling AI to generate PptxGenJS code...`);
        const code = await aiCode(PPTX_CODE_SYSTEM, markdown + hint);
        console.log(`[generate-pptx] Code generated — ${code.length} chars`);

        // @ts-expect-error PptxGenJS types incompatible with nodenext module resolution
        const pptx = new PptxGenJS();
        pptx.layout = "LAYOUT_WIDE";
        pptx.author = "MCP Server";

        const buildChart = createBuildChart();

        console.log(`[generate-pptx] Executing generated code...`);

        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as {
          new (...args: string[]): (...args: unknown[]) => Promise<void>;
        };
        const fn = new AsyncFunction("pptx", "buildChart", code);
        try {
          await fn(pptx, buildChart);
        } catch (execErr) {
          console.error(`[generate-pptx] Code execution error:`, (execErr as Error).message);
          console.error(`[generate-pptx] Generated code:\n${code}`);
          throw execErr;
        }

        const buf = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;

        // Extract title from the code
        const titleMatch = code.match(/pptx\.title\s*=\s*["']([^"']+)["']/);
        const title = titleMatch?.[1] ?? "presentation";
        const safeName = title.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 50);
        const url = saveOutput(`${safeName}.pptx`, buf);
        console.log(`[generate-pptx] Saved "${title}" — ${(buf.length / 1024).toFixed(0)}KB`);

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
            { type: "text" as const, text: `Error generating PPTX: ${(e as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );
}
