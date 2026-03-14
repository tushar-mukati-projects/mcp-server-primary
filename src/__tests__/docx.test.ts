import { describe, test, expect, beforeAll } from "bun:test";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import * as docxLib from "docx";

const OUTPUT_DIR = join(process.cwd(), "output");
beforeAll(() => mkdirSync(OUTPUT_DIR, { recursive: true }));

// Stub buildChart returns a tiny 1x1 transparent PNG for tests
const STUB_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
async function stubBuildChart(): Promise<Buffer> {
  return STUB_PNG;
}

async function runDocxCode(code: string): Promise<Buffer> {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as {
    new (...args: string[]): (...args: unknown[]) => Promise<unknown>;
  };
  const fn = new AsyncFunction("lib", "buildChart", code);
  const raw = await fn(docxLib, stubBuildChart);
  return Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
}

describe("DOCX Code Runner", () => {
  test("generates DOCX from hardcoded code (no AI)", async () => {
    const code = `
const { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
        WidthType, BorderStyle, AlignmentType, ShadingType } = lib;

const doc = new Document({
  styles: { default: { document: { run: { font: "Calibri", size: 24, color: "4a4a6a" } } } },
  sections: [{
    properties: { page: { margin: { top: 1080, bottom: 1080, left: 1260, right: 1260 } } },
    children: [
      new Paragraph({
        spacing: { before: 0, after: 240 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: "3b82f6", space: 12 } },
        children: [new TextRun({ text: "Test Document", bold: true, size: 64, color: "1a1a2e", font: "Calibri" })],
      }),
      new Paragraph({
        spacing: { before: 320, after: 160 },
        border: { left: { style: BorderStyle.SINGLE, size: 20, color: "3b82f6", space: 10 } },
        indent: { left: 220 },
        children: [new TextRun({ text: "Introduction", bold: true, size: 48, color: "1a1a2e", font: "Calibri" })],
      }),
      new Paragraph({
        spacing: { before: 60, after: 80 },
        children: [new TextRun({ text: "This is a test document generated without AI.", size: 24, color: "4a4a6a", font: "Calibri" })],
      }),
      new Paragraph({
        bullet: { level: 0 },
        spacing: { before: 40, after: 40 },
        children: [new TextRun({ text: "First bullet item", size: 24, color: "4a4a6a", font: "Calibri" })],
      }),
      new Paragraph({
        bullet: { level: 0 },
        spacing: { before: 40, after: 40 },
        children: [new TextRun({ text: "Second bullet item", size: 24, color: "4a4a6a", font: "Calibri" })],
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              new TableCell({ shading: { type: ShadingType.SOLID, color: "1a1a2e" }, children: [new Paragraph({ spacing: { before: 60, after: 60 }, children: [new TextRun({ text: "Column A", bold: true, color: "FFFFFF", size: 22, font: "Calibri" })] })] }),
              new TableCell({ shading: { type: ShadingType.SOLID, color: "1a1a2e" }, children: [new Paragraph({ spacing: { before: 60, after: 60 }, children: [new TextRun({ text: "Column B", bold: true, color: "FFFFFF", size: 22, font: "Calibri" })] })] }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({ shading: { type: ShadingType.SOLID, color: "F8FAFC" }, children: [new Paragraph({ spacing: { before: 60, after: 60 }, children: [new TextRun({ text: "Value 1", size: 22, color: "4a4a6a", font: "Calibri" })] })] }),
              new TableCell({ shading: { type: ShadingType.SOLID, color: "F8FAFC" }, children: [new Paragraph({ spacing: { before: 60, after: 60 }, children: [new TextRun({ text: "Value 2", size: 22, color: "4a4a6a", font: "Calibri" })] })] }),
            ],
          }),
        ],
      }),
    ],
  }],
});

return await Packer.toBuffer(doc);
`;

    const buf = await runDocxCode(code);

    // DOCX is a ZIP — starts with PK
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
    expect(buf.length).toBeGreaterThan(3000);

    const outPath = join(OUTPUT_DIR, "test-docx-basic.docx");
    writeFileSync(outPath, buf);
    console.log(`✓ DOCX saved: ${outPath} (${Math.round(buf.length / 1024)}KB)`);
  });
});
