import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { aiJSON } from "../lib/ai.js";
import { runPlaywrightOp } from "../lib/pdf-renderer.js";
import { saveOutput } from "../utils/output.js";

// ── Types ─────────────────────────────────────────────────────────────

interface ScrapeResult {
  title: string;
  meta: { description: string; ogTitle: string; ogDescription: string; author: string };
  text: string;
  links: Array<{ text: string; href: string }>;
  images: Array<{ alt: string; src: string }>;
}

// ── AI analysis prompt ────────────────────────────────────────────────

const SCRAPE_SYSTEM = `You are an expert web content analyst. You receive raw extracted content from a web page. Analyze it and provide a comprehensive, structured extraction.

Respond with a JSON object:
{
  "title": "Page title",
  "page_type": "article|product|documentation|landing|blog|forum|social|other",
  "summary": "2-3 sentence summary of the page",
  "main_content": "The main article/content cleaned and well-formatted as markdown",
  "key_points": ["Key takeaway 1", "Key takeaway 2"],
  "structured_data": {
    "headings": ["H1/H2 headings found"],
    "stats": ["Any numbers, prices, or statistics mentioned"],
    "dates": ["Any dates mentioned"],
    "people": ["People or organizations mentioned"],
    "locations": ["Locations mentioned"]
  },
  "important_links": [
    { "text": "Link text", "url": "URL", "context": "Why this link matters" }
  ],
  "tables_or_lists": "Any tabular data or structured lists found, formatted as markdown"
}

Rules:
- Be thorough but concise
- "main_content" should be clean, readable text — not raw HTML
- Only include "important_links" (max 15) — skip nav links, footer links, ads
- If the page is a product page, extract price, features, specs
- If the page is an article, extract author, date, reading time
- Format "main_content" as clean markdown`;

// ── Tool registration ─────────────────────────────────────────────────

export function register(server: McpServer) {
  server.tool(
    "smart-scrape",
    "AI-powered web scraper. Uses a real browser (Playwright via Node.js) to render JavaScript-heavy pages, then AI analyzes and extracts structured content.",
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
      console.log(
        `[smart-scrape] Request received — url=${url}, instruction=${instruction ?? "none"}`,
      );
      try {
        console.log(`[smart-scrape] Launching browser worker...`);
        const raw = await runPlaywrightOp<ScrapeResult>({ operation: "scrape", url });
        console.log(
          `[smart-scrape] Scraped — title="${raw.title}", text=${raw.text.length}chars, links=${raw.links.length}`,
        );

        const userPrompt = instruction ? `\nUser instruction: "${instruction}"\n\n` : "";
        const pageData = JSON.stringify(
          { title: raw.title, meta: raw.meta, text: raw.text, linkCount: raw.links.length },
          null,
          2,
        );

        console.log(`[smart-scrape] Calling AI to analyze page content...`);
        const result = await aiJSON<Record<string, unknown>>(
          SCRAPE_SYSTEM,
          `${userPrompt}Page URL: ${url}\n\nExtracted content:\n${pageData}`,
        );
        console.log(`[smart-scrape] AI analysis done — page_type=${result["page_type"]}`);

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (e) {
        console.error(`[smart-scrape] Error:`, (e as Error).message);
        return {
          content: [
            { type: "text" as const, text: `Error scraping ${url}: ${(e as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "take-screenshot",
    "Take a screenshot of a website using a real browser. Set scroll_pages=true to capture the full page as an array of viewport-sized screenshots scrolled from top to bottom.",
    {
      url: z.string().url().describe("URL to screenshot"),
      full_page: z
        .boolean()
        .default(false)
        .describe("Capture the entire page stitched into one tall image"),
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
        .describe("Max number of scroll screenshots (only used when scroll_pages=true)"),
    },
    async ({ url, full_page, scroll_pages, max_pages }) => {
      console.log(
        `[take-screenshot] Request — url=${url}, full_page=${full_page}, scroll_pages=${scroll_pages}`,
      );
      try {
        console.log(`[take-screenshot] Launching browser worker...`);

        if (scroll_pages) {
          const result = await runPlaywrightOp<{ screenshots: string[] }>({
            operation: "screenshot-scroll",
            url,
            maxPages: max_pages,
          });

          const shots = result.screenshots;
          console.log(`[take-screenshot] Scroll done — ${shots.length} pages`);

          // Save each page and build content array
          const urls: string[] = [];
          const content: Array<
            { type: "text"; text: string } | { type: "image"; data: string; mimeType: string }
          > = [];

          for (let i = 0; i < shots.length; i++) {
            const buf = Buffer.from(shots[i], "base64");
            const pageUrl = saveOutput(`screenshot-p${i + 1}.png`, buf);
            urls.push(pageUrl);
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

        // Single screenshot
        const result = await runPlaywrightOp<{ data: string }>({
          operation: "screenshot",
          url,
          fullPage: full_page,
        });

        const buf = Buffer.from(result.data, "base64");
        const screenshotUrl = saveOutput("screenshot.png", buf);
        const sizeKb = (buf.length / 1024) | 0;
        console.log(`[take-screenshot] Done — ${sizeKb}KB, url=${screenshotUrl}`);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { screenshot_url: screenshotUrl, size_kb: sizeKb, full_page, source_url: url },
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
            { type: "text" as const, text: `Error taking screenshot: ${(e as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );
}
