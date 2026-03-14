/* eslint-disable */
/**
 * Playwright worker — runs with Node.js (not Bun) since Bun's process model
 * is incompatible with Playwright's browser IPC.
 *
 * Usage:  node playwright-worker.cjs <input.json> <output.json>
 *
 * Input JSON shape:
 *   { operation: "pdf", html, pdfOptions }
 *   { operation: "screenshot", url, fullPage, userAgent }
 *   { operation: "scrape", url, userAgent }
 *
 * Output JSON shape:
 *   { data: "<base64>" }              — pdf / screenshot
 *   { title, meta, text, links, images } — scrape
 *   { error: "<message>" }            — on failure
 */

"use strict";

const { chromium } = require("playwright");
const fs = require("fs");

async function run() {
  const [inputPath, outputPath] = process.argv.slice(2);
  const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));

  let result;

  switch (input.operation) {
    case "pdf": {
      const browser = await chromium.launch({ headless: true });
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      try {
        await page.setContent(input.html, { waitUntil: "load", timeout: 15_000 });
        await page.waitForTimeout(500);
        const pdf = await page.pdf(
          input.pdfOptions ?? {
            format: "A4",
            printBackground: true,
            margin: { top: "1.5cm", bottom: "1.5cm", left: "1.5cm", right: "1.5cm" },
            displayHeaderFooter: true,
            headerTemplate: "<span></span>",
            footerTemplate:
              '<div style="width:100%;text-align:center;font-size:9px;color:#999;padding:0 1.5cm"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
          },
        );
        result = { data: Buffer.from(pdf).toString("base64") };
      } finally {
        await ctx.close();
        await browser.close();
      }
      break;
    }

    case "screenshot": {
      const browser = await chromium.launch({ headless: true });
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        userAgent: input.userAgent,
      });
      const page = await ctx.newPage();
      try {
        await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.waitForTimeout(2000);
        const screenshot = await page.screenshot({
          fullPage: input.fullPage ?? false,
          type: "png",
        });
        result = { data: Buffer.from(screenshot).toString("base64") };
      } finally {
        await ctx.close();
        await browser.close();
      }
      break;
    }

    case "screenshot-scroll": {
      const browser = await chromium.launch({ headless: true });
      const VIEWPORT_H = 900;
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: VIEWPORT_H },
        userAgent: input.userAgent,
      });
      const page = await ctx.newPage();
      try {
        await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.waitForTimeout(2000);

        const maxPages = Math.min(input.maxPages ?? 10, 20);
        const screenshots = [];

        for (let i = 0; i < maxPages; i++) {
          await page.evaluate(
            (y) => window.scrollTo({ top: y, behavior: "instant" }),
            i * VIEWPORT_H,
          );
          await page.waitForTimeout(400);

          const shot = await page.screenshot({ type: "png" });
          screenshots.push(Buffer.from(shot).toString("base64"));

          // Check if we've scrolled past the bottom
          const { scrollHeight } = await page.evaluate(() => ({
            scrollHeight: document.documentElement.scrollHeight,
          }));
          if ((i + 1) * VIEWPORT_H >= scrollHeight) break;
        }

        result = { screenshots };
      } finally {
        await ctx.close();
        await browser.close();
      }
      break;
    }

    case "scrape": {
      const browser = await chromium.launch({ headless: true });
      const ctx = await browser.newContext({
        userAgent:
          input.userAgent ??
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      });
      const page = await ctx.newPage();
      try {
        await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.waitForTimeout(2000);

        const title = await page.title();
        const meta = await page.evaluate(() => ({
          description:
            document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
          ogTitle:
            document.querySelector('meta[property="og:title"]')?.getAttribute("content") ?? "",
          ogDescription:
            document.querySelector('meta[property="og:description"]')?.getAttribute("content") ??
            "",
          author: document.querySelector('meta[name="author"]')?.getAttribute("content") ?? "",
        }));
        const text = await page.evaluate(() => {
          const remove = document.querySelectorAll(
            "script,style,nav,footer,header,noscript,iframe,svg,[role=banner],[role=navigation],[role=complementary],.ad,.ads,.advertisement",
          );
          remove.forEach((el) => el.remove());
          return document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 12000);
        });
        const links = await page.evaluate(() =>
          Array.from(document.querySelectorAll("a[href]"))
            .map((a) => ({
              text: a.innerText.trim().slice(0, 100),
              href: a.href,
            }))
            .filter((l) => l.text && l.href.startsWith("http"))
            .slice(0, 100),
        );
        const images = await page.evaluate(() =>
          Array.from(document.querySelectorAll("img[src]"))
            .map((img) => ({ alt: img.alt, src: img.src }))
            .filter((i) => i.src.startsWith("http"))
            .slice(0, 50),
        );

        result = { title, meta, text, links, images };
      } finally {
        await ctx.close();
        await browser.close();
      }
      break;
    }

    default:
      result = { error: `Unknown operation: ${input.operation}` };
  }

  fs.writeFileSync(outputPath, JSON.stringify(result));
}

run().catch((e) => {
  const outputPath = process.argv[3];
  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify({ error: e.message }));
  }
  process.exit(1);
});
