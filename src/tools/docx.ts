import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as docxLib from "docx";
import { aiCode } from "../lib/ai.js";
import { saveOutput } from "../utils/output.js";

// ── Chart helper (QuickChart → Buffer for ImageRun) ────────────────────

const PALETTE = [
  "rgba(59,130,246,0.85)",
  "rgba(16,185,129,0.85)",
  "rgba(245,158,11,0.85)",
  "rgba(139,92,246,0.85)",
  "rgba(239,68,68,0.85)",
  "rgba(20,184,166,0.85)",
];

async function buildDocxChart(args: {
  title: string;
  type: string;
  labels: string[];
  datasets: Array<{ label: string; data: number[] }>;
  width?: number;
  height?: number;
}): Promise<Buffer> {
  const { title, type, labels, datasets, width = 600, height = 310 } = args;

  const styledDatasets = datasets.map((ds, i) => ({
    ...ds,
    backgroundColor:
      type === "pie" || type === "doughnut"
        ? PALETTE.slice(0, labels.length)
        : PALETTE[i % PALETTE.length],
    borderColor: type === "line" ? PALETTE[i % PALETTE.length].replace("0.85", "1") : undefined,
    borderWidth: type === "line" ? 2 : undefined,
    fill: type === "line" ? false : undefined,
    tension: type === "line" ? 0.3 : undefined,
    pointRadius: type === "line" ? 4 : undefined,
  }));

  console.log(`[generate-docx] Fetching chart "${title}" (${type})...`);
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
        data: { labels, datasets: styledDatasets },
        options: {
          plugins: {
            title: { display: !!title, text: title, font: { size: 13 }, color: "#1a1a2e" },
            legend: {
              display: datasets.length > 1 || type === "pie" || type === "doughnut",
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
  return Buffer.from(await res.arrayBuffer());
}

// ── AI prompt ──────────────────────────────────────────────────────────

const DOCX_CODE_SYSTEM = `You are a docx (npm package v9) expert. Generate JavaScript code to create a beautiful, professional Word document that matches the quality of a well-designed PDF.

Your code runs as the body of:  async function buildDocument(lib, buildChart) { YOUR_CODE_HERE }
The function MUST end with:  return await Packer.toBuffer(doc);

START your code by destructuring lib — this is REQUIRED:
const { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow,
        TableCell, WidthType, BorderStyle, AlignmentType, ShadingType, NumberFormat } = lib;

⚠️  NEVER use the \`heading:\` property on Paragraph — it conflicts with inline border/indent/spacing and corrupts the document. Style headings manually using TextRun size+bold+color only.

KEY API (docx v9):
const doc = new Document({
  styles: { default: { document: { run: { font: "Calibri", size: 24, color: "4a4a6a" } } } },
  numbering?: { config: [...] },
  sections: [{ properties: { page: { margin: { top, bottom, left, right } } }, children: [...] }]
});

Paragraphs (NO heading: property ever):
new Paragraph({ spacing?, indent?, alignment?, bullet?: { level: 0 }, border?, shading?,
  children: [new TextRun({ text, bold?, italics?, size?, color?, font? })] })

Charts — call buildChart and embed with ImageRun (ALWAYS use this for numerical data):
const chartBuf = await buildChart({ title, type, labels, datasets, width?, height? });
// type: "bar"|"line"|"pie"|"doughnut" | datasets: [{ label, data: number[] }]
// ⚠️  ImageRun REQUIRES type: "png" — omitting it corrupts the document
new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 200, after: 80 },
  children: [new ImageRun({ data: chartBuf, type: "png", transformation: { width: 550, height: 285 } })],
})
new Paragraph({
  alignment: AlignmentType.CENTER, spacing: { after: 160 },
  children: [new TextRun({ text: "Chart Title", italics: true, size: 20, color: "6b7280", font: "Calibri" })],
})

Tables:
new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
  new TableRow({ tableHeader?: true, children: [
    new TableCell({ shading?: { type: ShadingType.SOLID, color }, children: [paragraph] })
  ]})
]})

TextRun sizes (half-points): 20=10pt  22=11pt  24=12pt  28=14pt  36=18pt  48=24pt  56=28pt  64=32pt

DESIGN SYSTEM — match PDF quality (NO heading: property, use plain Paragraph + TextRun):
Font: "Calibri" everywhere (set in Document styles.default AND in every TextRun)

Document title (first Paragraph):
  size:64 bold color:"1a1a2e" font:"Calibri" spacing{before:0 after:240}
  border:{ bottom:{ style:BorderStyle.SINGLE, size:8, color:"3b82f6", space:12 } }

H1 — large section heading:
  size:48 bold color:"1a1a2e" font:"Calibri" spacing{before:320 after:160}
  border:{ left:{ style:BorderStyle.SINGLE, size:20, color:"3b82f6", space:10 } }
  indent:{ left:220 }

H2 — subsection heading:
  size:36 bold color:"1a1a2e" font:"Calibri" spacing{before:240 after:100}
  border:{ left:{ style:BorderStyle.SINGLE, size:14, color:"3b82f6", space:8 } }
  indent:{ left:180 }

H3 — minor heading:
  size:28 bold color:"1a1a2e" font:"Calibri" spacing{before:200 after:80}

Body text:
  size:24 color:"4a4a6a" font:"Calibri" spacing{before:60 after:80}

Bullets (ONE Paragraph per bullet item):
  bullet:{ level:0 } size:24 color:"4a4a6a" font:"Calibri" spacing{before:40 after:40}

Numbered (ONE Paragraph per item):
  numbering:{ reference:"default-numbering", level:0 } size:24 color:"4a4a6a" font:"Calibri" spacing{before:40 after:40}

Blockquote:
  size:24 italics color:"1e3a5f" font:"Calibri" spacing{before:160 after:160}
  border:{ left:{ style:BorderStyle.SINGLE, size:20, color:"3b82f6", space:12 } }
  shading:{ type:ShadingType.SOLID, color:"EFF6FF" } indent:{ left:360 }

Table header row:
  shading SOLID "1a1a2e" | TextRun bold color:"FFFFFF" size:22 font:"Calibri"

Table data rows (alternating):
  even rows: shading SOLID "F8FAFC" | odd rows: shading SOLID "FFFFFF"
  TextRun size:22 color:"4a4a6a" font:"Calibri"
  All cell children: [new Paragraph({ spacing:{before:60,after:60}, children:[new TextRun({...})] })]

Divider paragraph:
  border:{ bottom:{ style:BorderStyle.SINGLE, size:4, color:"E2E8F0" } } spacing{before:240 after:240}

For numbered lists, include in Document constructor:
numbering: { config: [{ reference: "default-numbering", levels: [{ level: 0, format: NumberFormat.DECIMAL,
  text: "%1.", alignment: AlignmentType.START,
  style: { paragraph: { indent: { left: 360, hanging: 260 } } } }] }] }

WORKING EXAMPLE — follow this exact pattern:
\`\`\`javascript
const { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow,
        TableCell, WidthType, BorderStyle, AlignmentType, ShadingType, NumberFormat } = lib;

// Fetch charts BEFORE building Document
const revChart = await buildChart({
  title: "Quarterly Revenue ($M)", type: "bar",
  labels: ["Q1", "Q2", "Q3", "Q4"],
  datasets: [{ label: "Revenue", data: [45.2, 48.5, 52.0, 58.5] }]
});

const doc = new Document({
  styles: { default: { document: { run: { font: "Calibri", size: 24, color: "4a4a6a" } } } },
  sections: [{
    properties: { page: { margin: { top: 1080, bottom: 1080, left: 1260, right: 1260 } } },
    children: [

      // Document Title — plain Paragraph, NO heading: property
      new Paragraph({
        spacing: { before: 0, after: 240 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: "3b82f6", space: 12 } },
        children: [new TextRun({ text: "Business Performance Report: 2024–2025", bold: true, size: 64, color: "1a1a2e", font: "Calibri" })],
      }),

      // H1 — plain Paragraph, NO heading: property
      new Paragraph({
        spacing: { before: 320, after: 160 },
        border: { left: { style: BorderStyle.SINGLE, size: 20, color: "3b82f6", space: 10 } },
        indent: { left: 220 },
        children: [new TextRun({ text: "1. Executive Summary", bold: true, size: 48, color: "1a1a2e", font: "Calibri" })],
      }),

      // Body text
      new Paragraph({
        spacing: { before: 60, after: 80 },
        children: [new TextRun({ text: "This report outlines strategic growth areas for the upcoming fiscal year.", size: 24, color: "4a4a6a", font: "Calibri" })],
      }),

      // H2
      new Paragraph({
        spacing: { before: 240, after: 100 },
        border: { left: { style: BorderStyle.SINGLE, size: 14, color: "3b82f6", space: 8 } },
        indent: { left: 180 },
        children: [new TextRun({ text: "2. Revenue Analysis", bold: true, size: 36, color: "1a1a2e", font: "Calibri" })],
      }),

      // Bullets — ONE Paragraph per item
      new Paragraph({
        bullet: { level: 0 },
        spacing: { before: 40, after: 40 },
        children: [new TextRun({ text: "SaaS Subscriptions grew 29% year-over-year", size: 24, color: "4a4a6a", font: "Calibri" })],
      }),
      new Paragraph({
        bullet: { level: 0 },
        spacing: { before: 40, after: 40 },
        children: [new TextRun({ text: "Professional Services margin improved to 34%", size: 24, color: "4a4a6a", font: "Calibri" })],
      }),

      // Table
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              new TableCell({ shading: { type: ShadingType.SOLID, color: "1a1a2e" }, children: [new Paragraph({ spacing: { before: 60, after: 60 }, children: [new TextRun({ text: "Department", bold: true, color: "FFFFFF", size: 22, font: "Calibri" })] })] }),
              new TableCell({ shading: { type: ShadingType.SOLID, color: "1a1a2e" }, children: [new Paragraph({ spacing: { before: 60, after: 60 }, children: [new TextRun({ text: "Q1", bold: true, color: "FFFFFF", size: 22, font: "Calibri" })] })] }),
              new TableCell({ shading: { type: ShadingType.SOLID, color: "1a1a2e" }, children: [new Paragraph({ spacing: { before: 60, after: 60 }, children: [new TextRun({ text: "Q2", bold: true, color: "FFFFFF", size: 22, font: "Calibri" })] })] }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({ shading: { type: ShadingType.SOLID, color: "F8FAFC" }, children: [new Paragraph({ spacing: { before: 60, after: 60 }, children: [new TextRun({ text: "SaaS Subscriptions", size: 22, color: "4a4a6a", font: "Calibri" })] })] }),
              new TableCell({ shading: { type: ShadingType.SOLID, color: "F8FAFC" }, children: [new Paragraph({ spacing: { before: 60, after: 60 }, children: [new TextRun({ text: "45.2", size: 22, color: "4a4a6a", font: "Calibri" })] })] }),
              new TableCell({ shading: { type: ShadingType.SOLID, color: "F8FAFC" }, children: [new Paragraph({ spacing: { before: 60, after: 60 }, children: [new TextRun({ text: "48.5", size: 22, color: "4a4a6a", font: "Calibri" })] })] }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({ shading: { type: ShadingType.SOLID, color: "FFFFFF" }, children: [new Paragraph({ spacing: { before: 60, after: 60 }, children: [new TextRun({ text: "Professional Services", size: 22, color: "4a4a6a", font: "Calibri" })] })] }),
              new TableCell({ shading: { type: ShadingType.SOLID, color: "FFFFFF" }, children: [new Paragraph({ spacing: { before: 60, after: 60 }, children: [new TextRun({ text: "12.8", size: 22, color: "4a4a6a", font: "Calibri" })] })] }),
              new TableCell({ shading: { type: ShadingType.SOLID, color: "FFFFFF" }, children: [new Paragraph({ spacing: { before: 60, after: 60 }, children: [new TextRun({ text: "14.1", size: 22, color: "4a4a6a", font: "Calibri" })] })] }),
            ],
          }),
        ],
      }),

      // Chart image — note type: "png" is REQUIRED
      new Paragraph({ spacing: { before: 240 }, children: [] }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 80 },
        children: [new ImageRun({ data: revChart, type: "png", transformation: { width: 550, height: 285 } })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: "Quarterly Revenue ($M)", italics: true, size: 20, color: "6b7280", font: "Calibri" })],
      }),

    ],
  }],
});

return await Packer.toBuffer(doc);
\`\`\`

CRITICAL RULES:
1. Preserve ALL content — every sentence, bullet, table row, heading
2. Do NOT summarize or skip any content
3. ALWAYS destructure lib at the top — do NOT include HeadingLevel (not needed)
4. NEVER use \`heading:\` on any Paragraph — style headings manually with TextRun
5. Each bullet = its OWN Paragraph with bullet: { level: 0 }
6. Every TextRun MUST have font: "Calibri"
7. Every ImageRun MUST have type: "png"
8. When content has numerical data, ALWAYS call buildChart and embed with ImageRun — never write "Chart Suggestion"
9. Fetch ALL charts BEFORE the new Document({...}) call
10. Only use destructured names — no require, import, fetch, console, process, or fs
11. MUST end with: return await Packer.toBuffer(doc);`;

// ── Tool registration ──────────────────────────────────────────────────

export function register(server: McpServer) {
  server.tool(
    "generate-docx",
    "AI-powered Word document generation. The AI writes full docx library code to produce a professionally styled DOCX with all content and charts preserved exactly.",
    {
      markdown: z.string().describe("Markdown content to convert to a Word document"),
    },
    async ({ markdown }) => {
      console.log(`[generate-docx] Request received — ${markdown.length} chars`);
      try {
        console.log(`[generate-docx] Calling AI to generate docx code...`);
        const code = await aiCode(DOCX_CODE_SYSTEM, markdown);
        console.log(`[generate-docx] Code generated — ${code.length} chars`);

        console.log(`[generate-docx] Executing docx code...`);

        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as {
          new (...args: string[]): (...args: unknown[]) => Promise<unknown>;
        };
        const fn = new AsyncFunction("lib", "buildChart", code);
        let raw: unknown;
        try {
          raw = await fn(docxLib, buildDocxChart);
        } catch (execErr) {
          console.error(`[generate-docx] Code execution error:`, (execErr as Error).message);
          console.error(`[generate-docx] Generated code:\n${code}`);
          throw execErr;
        }
        if (raw === undefined || raw === null) {
          console.error(
            `[generate-docx] Code returned undefined — missing return statement?\n${code}`,
          );
          throw new Error(
            "DOCX code did not return a buffer. Ensure the code ends with: return await Packer.toBuffer(doc);",
          );
        }
        const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);

        // Extract title from the code for a nice filename
        const titleMatch = code.match(/text:\s*["']([^"']{5,80})["']/);
        const title = titleMatch?.[1] ?? "document";
        const safeName = title.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 50);
        const url = saveOutput(`${safeName}.docx`, buf);
        console.log(`[generate-docx] Saved — ${(buf.length / 1024).toFixed(0)}KB, url=${url}`);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { docx_url: url, size_kb: Math.round(buf.length / 1024) },
                null,
                2,
              ),
            },
          ],
        };
      } catch (e) {
        console.error(`[generate-docx] Error:`, (e as Error).message);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error generating DOCX: ${(e as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
