import { chromium, type Browser } from "playwright";

let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browser?.isConnected()) {
    // Try Playwright's own Chromium first, then fall back to system browsers
    const attempts: Array<() => Promise<Browser>> = [
      () => chromium.launch({ headless: true }),
      () => chromium.launch({ headless: true, channel: "chrome" }),
      () => chromium.launch({ headless: true, channel: "msedge" }),
    ];

    let lastErr: Error | null = null;
    for (const attempt of attempts) {
      try {
        browser = await attempt();
        console.log("[browser] Launched successfully");
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
