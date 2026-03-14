import { describe, test, expect, beforeAll } from "bun:test";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import PptxGenJS from "pptxgenjs";

const OUTPUT_DIR = join(process.cwd(), "output");
beforeAll(() => mkdirSync(OUTPUT_DIR, { recursive: true }));

// ── Helper: executes AI-style PptxGenJS code ───────────────────────────

type BuildChartFn = (args: {
  title: string;
  type: string;
  labels: string[];
  datasets: Array<{ label: string; data: number[] }>;
  width?: number;
  height?: number;
}) => Promise<string>;

async function runPptxCode(
  code: string,
  buildChart: BuildChartFn = async () => "",
): Promise<Buffer> {
  // @ts-expect-error PptxGenJS types incompatible with nodenext module resolution
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";

  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as {
    new (...args: string[]): (...args: unknown[]) => Promise<void>;
  };
  const fn = new AsyncFunction("pptx", "buildChart", code);
  await fn(pptx, buildChart);
  return (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
}

describe("PPTX Code Runner", () => {
  test("generates PPTX from hardcoded code (no AI)", async () => {
    const code = `
pptx.title = "Test Presentation";

// Title slide
const s1 = pptx.addSlide();
s1.background = { fill: "FFFFFF" };
s1.addShape("rect", { x: 0, y: 0, w: 0.2, h: "100%", fill: { color: "3b82f6" } });
s1.addText("Test Presentation", { x: 0.5, y: "28%", w: 12.6, fontSize: 38, bold: true, color: "1a1a2e" });
s1.addText("Subtitle text here", { x: 0.5, y: "55%", w: 12.6, fontSize: 20, color: "4a4a6a" });

// Content slide
const s2 = pptx.addSlide();
s2.background = { fill: "FFFFFF" };
s2.addShape("rect", { x: 0, y: 0, w: "100%", h: 1.1, fill: { color: "1a1a2e" } });
s2.addText("Key Points", { x: 0.6, y: 0.22, w: 12.0, fontSize: 22, bold: true, color: "FFFFFF" });
s2.addText("First bullet point\\nSecond bullet point\\nThird bullet point", {
  x: 0.8, y: 1.35, w: 11.7, h: 5.5,
  bullet: true, fontSize: 16, color: "4a4a6a",
  lineSpacingMultiple: 1.6, valign: "top"
});

// Closing slide
const s3 = pptx.addSlide();
s3.background = { fill: "1a1a2e" };
s3.addText("Thank You", { x: 0.7, y: "35%", w: 12.0, fontSize: 34, bold: true, align: "center", color: "FFFFFF" });
`;

    const buf = await runPptxCode(code);

    // Verify it's a real PPTX (ZIP file, starts with PK)
    expect(buf[0]).toBe(0x50); // P
    expect(buf[1]).toBe(0x4b); // K
    expect(buf.length).toBeGreaterThan(5000);

    const outPath = join(OUTPUT_DIR, "test-pptx-basic.pptx");
    writeFileSync(outPath, buf);
    console.log(`✓ PPTX saved: ${outPath} (${Math.round(buf.length / 1024)}KB)`);
  });

  test("generates PPTX with table slide", async () => {
    const code = `
pptx.title = "Table Test";
const s = pptx.addSlide();
s.background = { fill: "FFFFFF" };
s.addShape("rect", { x: 0, y: 0, w: "100%", h: 1.1, fill: { color: "1a1a2e" } });
s.addText("Battery Comparison", { x: 0.6, y: 0.22, w: 12.0, fontSize: 22, bold: true, color: "FFFFFF" });
s.addTable(
  [
    [
      { text: "Type", options: { bold: true, color: "FFFFFF", fill: { color: "1a1a2e" } } },
      { text: "Energy", options: { bold: true, color: "FFFFFF", fill: { color: "1a1a2e" } } },
      { text: "Cost", options: { bold: true, color: "FFFFFF", fill: { color: "1a1a2e" } } },
    ],
    [
      { text: "Li-Ion", options: { color: "4a4a6a", fill: { color: "F8FAFC" } } },
      { text: "High", options: { color: "4a4a6a", fill: { color: "F8FAFC" } } },
      { text: "Medium", options: { color: "4a4a6a", fill: { color: "F8FAFC" } } },
    ],
    [
      { text: "Solid-State", options: { color: "4a4a6a", fill: { color: "FFFFFF" } } },
      { text: "Very High", options: { color: "4a4a6a", fill: { color: "FFFFFF" } } },
      { text: "High", options: { color: "4a4a6a", fill: { color: "FFFFFF" } } },
    ],
  ],
  { x: 0.5, y: 1.3, w: 12.3, colW: [4.1, 4.1, 4.1], rowH: 0.5, fontSize: 13 }
);
`;

    const buf = await runPptxCode(code);
    expect(buf[0]).toBe(0x50);
    expect(buf.length).toBeGreaterThan(5000);

    const outPath = join(OUTPUT_DIR, "test-pptx-table.pptx");
    writeFileSync(outPath, buf);
    console.log(`✓ PPTX saved: ${outPath} (${Math.round(buf.length / 1024)}KB)`);
  });
});
