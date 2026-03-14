import { chromium, type Browser } from "playwright";
import { logger } from "./logger.js";

let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browser?.isConnected()) {
    const attempts: Array<() => Promise<Browser>> = [
      () => chromium.launch({ headless: true }),
      () => chromium.launch({ headless: true, channel: "chrome" }),
      () => chromium.launch({ headless: true, channel: "msedge" }),
    ];

    let lastErr: Error | null = null;
    for (const attempt of attempts) {
      try {
        browser = await attempt();
        logger.info("browser launched");
        return browser;
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
      }
    }

    throw new Error(
      `Playwright browser not available: ${lastErr?.message ?? "unknown"}. ` +
        `Run 'bunx playwright install chromium' in the project directory to install.`,
    );
  }
  return browser;
}
