import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { aiJSON } from "../../lib/ai.js";
import { runPlaywrightOp } from "../../lib/pdf-renderer.js";
import { saveOutput } from "../../utils/output.js";
import { SCRAPE_SYSTEM } from "./prompt.js";

interface ScrapeResult {
  title: string;
  meta: { description: string; ogTitle: string; ogDescription: string; author: string };
  text: string;
  links: Array<{ text: string; href: string }>;
  images: Array<{ alt: string; src: string }>;
}

export function register(server: McpServer) {
  server.tool(
    "smart-scrape",
    "Extract structured content from any website using a real Chromium browser — renders JavaScript, handles SPAs, and returns AI-analyzed data: summary, key points, tables, links, and more.",
    {
      url: z.string().url().describe("URL to scrape"),
      instruction: z
        .string()
        .optional()
        .describe(
          "Optional focus instruction, e.g. 'extract pricing data' or 'summarize the article'",
        ),
    },
    async ({ url, instruction }) => {
      console.log(`[smart-scrape] url=${url}`);
      try {
        const raw = await runPlaywrightOp<ScrapeResult>({ operation: "scrape", url });
        console.log(`[smart-scrape] scraped — title="${raw.title}", ${raw.text.length} chars`);

        const userPrompt = instruction ? `\nFocus: "${instruction}"\n\n` : "";
        const pageData = JSON.stringify(
          { title: raw.title, meta: raw.meta, text: raw.text, linkCount: raw.links.length },
          null,
          2,
        );

        const result = await aiJSON<Record<string, unknown>>(
          SCRAPE_SYSTEM,
          `${userPrompt}URL: ${url}\n\n${pageData}`,
        );
        console.log(`[smart-scrape] done — page_type=${result["page_type"]}`);

        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        console.error(`[smart-scrape] Error:`, (e as Error).message);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ error: (e as Error).message }) },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "take-screenshot",
    "Capture pixel-perfect screenshots of any website using a real browser. Use scroll_pages=true to capture the full page as multiple viewport-sized images scrolled top to bottom.",
    {
      url: z.string().url().describe("URL to screenshot"),
      full_page: z.boolean().default(false).describe("Stitch the entire page into one tall image"),
      scroll_pages: z
        .boolean()
        .default(false)
        .describe(
          "Capture multiple viewport screenshots while scrolling — returns an array of images",
        ),
      max_pages: z
        .number()
        .min(1)
        .max(20)
        .default(10)
        .describe("Max scroll screenshots (only used when scroll_pages=true)"),
    },
    async ({ url, full_page, scroll_pages, max_pages }) => {
      console.log(`[take-screenshot] url=${url}, scroll_pages=${scroll_pages}`);
      try {
        if (scroll_pages) {
          const result = await runPlaywrightOp<{ screenshots: string[] }>({
            operation: "screenshot-scroll",
            url,
            maxPages: max_pages,
          });
          const shots = result.screenshots;
          console.log(`[take-screenshot] ${shots.length} scroll pages`);

          const urls: string[] = [];
          const content: Array<
            { type: "text"; text: string } | { type: "image"; data: string; mimeType: string }
          > = [];

          for (let i = 0; i < shots.length; i++) {
            urls.push(saveOutput(`screenshot-p${i + 1}.png`, Buffer.from(shots[i], "base64")));
            content.push({ type: "image" as const, data: shots[i], mimeType: "image/png" });
          }
          content.unshift({
            type: "text" as const,
            text: JSON.stringify(
              { pages: shots.length, screenshot_urls: urls, source_url: url },
              null,
              2,
            ),
          });
          return { content };
        }

        const result = await runPlaywrightOp<{ data: string }>({
          operation: "screenshot",
          url,
          fullPage: full_page,
        });
        const buf = Buffer.from(result.data, "base64");
        const screenshot_url = saveOutput("screenshot.png", buf);
        console.log(`[take-screenshot] ${(buf.length / 1024) | 0}KB → ${screenshot_url}`);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  screenshot_url,
                  size_kb: (buf.length / 1024) | 0,
                  full_page,
                  source_url: url,
                },
                null,
                2,
              ),
            },
            { type: "image" as const, data: result.data, mimeType: "image/png" },
          ],
        };
      } catch (e) {
        console.error(`[take-screenshot] Error:`, (e as Error).message);
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
