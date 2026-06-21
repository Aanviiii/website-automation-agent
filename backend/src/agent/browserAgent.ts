/**
 * BrowserAgent — a thin, modular wrapper around Playwright that exposes the
 * exact low-level "tools" required by the assignment. Each public method is one
 * composable capability the higher-level task layer can chain together:
 *
 *   open_browser()          -> launch a Chromium instance + page
 *   navigate_to_url(url)    -> go to a page
 *   take_screenshot(name)   -> capture current viewport to a PNG file
 *   click_on_screen(x, y)   -> raw mouse click at pixel coordinates
 *   double_click(x, y)      -> raw mouse double-click at pixel coordinates
 *   send_keys(text)         -> type text into the currently focused element
 *   scroll(dy)              -> scroll the page vertically
 *
 * Keeping these as small single-purpose methods is what "modular tool
 * architecture" means: the task logic reads like a script of human actions,
 * each tool is independently testable, and new tasks reuse the same tools.
 */
import { Browser, BrowserContext, Page, chromium } from "playwright";
import path from "path";
import fs from "fs";
import { env } from "../config/env";
import { logger } from "../utils/logger";

const SCREENSHOT_DIR = path.resolve(process.cwd(), "screenshots");

export class BrowserAgent {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  page: Page | null = null;

  /** Tool 1: open_browser — launch Chromium and create a fresh page. */
  async open_browser(): Promise<void> {
    logger.action("open_browser: launching Chromium");
    this.browser = await chromium.launch({
      headless: env.headless,
      // Flags required to run Chromium on cloud Linux hosts (Render, Docker):
      //  --no-sandbox / --disable-setuid-sandbox: no user namespaces available
      //  --disable-dev-shm-usage: avoid crashes from the tiny /dev/shm on PaaS
      // They are harmless locally (e.g. on Windows).
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    this.page = await this.context.newPage();
    if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    logger.success(`Browser opened (headless=${env.headless})`);
  }

  private requirePage(): Page {
    if (!this.page) throw new Error("Browser not open. Call open_browser() first.");
    return this.page;
  }

  /** Tool 2: navigate_to_url — go to a URL and wait for the DOM to settle. */
  async navigate_to_url(url: string): Promise<void> {
    const page = this.requirePage();
    logger.action(`navigate_to_url: ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    // shadcn docs are client-rendered, give hydration a moment
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    logger.success(`Navigated to ${url}`);
  }

  /** Tool 3: take_screenshot — save the viewport to a timestamped PNG. */
  async take_screenshot(name: string): Promise<string> {
    const page = this.requirePage();
    const safe = name.replace(/[^a-z0-9-_]/gi, "_");
    const file = `${Date.now()}_${safe}.png`;
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, file), fullPage: false });
    logger.action(`take_screenshot: ${file}`);
    return file; // served by Express at /screenshots/<file>
  }

  /** Tool 4: click_on_screen — raw mouse click at absolute pixel coords. */
  async click_on_screen(x: number, y: number): Promise<void> {
    const page = this.requirePage();
    logger.action(`click_on_screen: (${x}, ${y})`);
    await page.mouse.click(x, y);
  }

  /** Tool 5 (bonus): double_click — raw mouse double-click at coords. */
  async double_click(x: number, y: number): Promise<void> {
    const page = this.requirePage();
    logger.action(`double_click: (${x}, ${y})`);
    await page.mouse.dblclick(x, y);
  }

  /** Tool 6: send_keys — type into whatever element is currently focused. */
  async send_keys(text: string): Promise<void> {
    const page = this.requirePage();
    logger.action(`send_keys: "${text}"`);
    await page.keyboard.type(text, { delay: 25 });
  }

  /** Tool 7: scroll — scroll the page vertically by dy pixels (default 400). */
  async scroll(dy = 400): Promise<void> {
    const page = this.requirePage();
    logger.action(`scroll: ${dy}px`);
    await page.mouse.wheel(0, dy);
    await page.waitForTimeout(300);
  }

  /** Clean shutdown of all Playwright resources. Safe to call multiple times. */
  async close(): Promise<void> {
    await this.context?.close().catch(() => {});
    await this.browser?.close().catch(() => {});
    this.browser = null;
    this.context = null;
    this.page = null;
    logger.info("Browser closed");
  }
}
