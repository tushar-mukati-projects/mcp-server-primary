import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as docxLib from "docx";
import { aiCode } from "../../lib/ai.js";
import { saveOutput } from "../../utils/output.js";
import { fetchChart } from "../../lib/quickchart.js";
import { DOCX_CODE_SYSTEM } from "./prompt.js";

type BuildChartFn = (args: {
  title: string;
  type: string;
  labels: string[];
  datasets: Array<{ label: string; data: number[] }>;
  width?: number;
  height?: number;
}) => Promise<Buffer>;

function createBuildChart(): BuildChartFn {
  return async ({ title, type, labels, datasets, width = 600, height = 310 }) => {
    console.log(`[generate-docx] chart "${title}" (${type})`);
    return fetchChart(type, { labels, datasets }, title, width, height);
  };
}

export function register(server: McpServer) {
  server.tool(
    "generate-docx",
    "Create complete, content-faithful Word documents from any markdown or outline. AI generates the full DOCX with styled headings, tables, bullets, and embedded charts — zero summarization.",
    {
      markdown: z.string().describe("Markdown content to convert to a Word document"),
    },
    async ({ markdown }) => {
      console.log(`[generate-docx] ${markdown.length} chars`);
      try {
        const code = await aiCode(DOCX_CODE_SYSTEM, markdown);
        console.log(`[generate-docx] code ${code.length} chars`);

        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as {
          new (...args: string[]): (...args: unknown[]) => Promise<unknown>;
        };
        const fn = new AsyncFunction("lib", "buildChart", code);
        let raw: unknown;
        try {
          raw = await fn(docxLib, createBuildChart());
        } catch (execErr) {
          console.error(`[generate-docx] exec error:`, (execErr as Error).message);
          console.error(`[generate-docx] code:\n${code}`);
          throw execErr;
        }

        if (raw === undefined || raw === null) {
          throw new Error(
            "DOCX code did not return a buffer. Ensure the code ends with: return await Packer.toBuffer(doc);",
          );
        }
        const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);

        const titleMatch = code.match(/text:\s*["']([^"']{5,80})["']/);
        const title = titleMatch?.[1] ?? "document";
        const url = saveOutput(`${title.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 50)}.docx`, buf);
        console.log(`[generate-docx] saved "${title}" ${(buf.length / 1024).toFixed(0)}KB`);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { docx_url: url, title, size_kb: Math.round(buf.length / 1024) },
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
            { type: "text" as const, text: JSON.stringify({ error: (e as Error).message }) },
          ],
          isError: true,
        };
      }
    },
  );
}
