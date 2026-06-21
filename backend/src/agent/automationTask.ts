/**
 * automationTask — the high-level workflow that fulfils the assignment:
 *
 *   1. open_browser
 *   2. navigate_to_url(target)
 *   3. take_screenshot("before")
 *   4. detect the Name + Description fields (intelligent fallback hierarchy)
 *   5. fill each one using the required primitives:
 *         click_on_screen(x, y)  -> focus the field at its real coordinates
 *         send_keys(text)        -> type the value
 *   6. take_screenshot("after")
 *   7. archive the run in Qdrant and close the browser
 *
 * Every step is wrapped so a single failure is logged and reported instead of
 * crashing the server. The function returns a structured result the API/UI use.
 */
import { BrowserAgent } from "./browserAgent";
import { ElementDetector, FieldQuery } from "./elementDetector";
import { logger, LogEntry } from "../utils/logger";
import { qdrantService } from "../services/qdrantService";
import { grokService } from "../services/grokService";
import { Locator } from "playwright";

export interface AutomationInput {
  url: string;
  name: string;
  description: string;
}

export interface AutomationResult {
  status: "success" | "failed";
  screenshots: { before?: string; after?: string };
  filled: { name: boolean; description: boolean };
  error?: string;
}

// The "Name" field. On the current shadcn react-hook-form page this is the
// "Bug Title" input (name="title"); we keep the label flexible so the same code
// works if the page reverts to a literal "Name" field.
const NAME_QUERY: FieldQuery = {
  label: "Bug Title",
  css: [
    'input[name="title" i]',
    'input[name="name" i]',
    'input[placeholder*="title" i]',
    'input[placeholder*="name" i]',
    "input[type='text']",
    "input:not([type='checkbox']):not([type='radio']):not([type='email'])",
  ],
};

// The "Description" field — a textarea on the page.
const DESCRIPTION_QUERY: FieldQuery = {
  label: "Description",
  preferTextarea: true,
  css: [
    'textarea[name="description" i]',
    'textarea[placeholder*="description" i]',
    "textarea",
  ],
};

/** Focus a field by its real screen coordinates, then type — uses the required
 *  click_on_screen + send_keys primitives. Falls back to Playwright fill(). */
async function fillField(agent: BrowserAgent, locator: Locator, value: string): Promise<void> {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const box = await locator.boundingBox();
  if (box) {
    const x = Math.round(box.x + box.width / 2);
    const y = Math.round(box.y + box.height / 2);
    await agent.click_on_screen(x, y); // coordinate click -> focus
    // clear any existing text, then type via keyboard
    await locator.fill("").catch(() => {});
    await agent.send_keys(value); // keyboard typing
  } else {
    await locator.fill(value); // resilient fallback
  }
}

export async function runAutomation(input: AutomationInput): Promise<AutomationResult> {
  const agent = new BrowserAgent();
  const result: AutomationResult = {
    status: "failed",
    screenshots: {},
    filled: { name: false, description: false },
  };

  // capture this run's logs for archiving
  const runLogs: LogEntry[] = [];
  const unsub = logger.subscribe((e) => runLogs.push(e));

  try {
    logger.info(`=== Automation started for ${input.url} ===`);

    await agent.open_browser();
    await agent.navigate_to_url(input.url);
    result.screenshots.before = await agent.take_screenshot("before");

    const detector = new ElementDetector(agent.page!);

    // 1) Find the Description textarea first. The page has SEVERAL forms, so we
    //    use the form that owns the description as our scope — this guarantees
    //    the Name/Title we fill belongs to the SAME visible form.
    const descLocator = await detector.find(DESCRIPTION_QUERY);
    const formScope = descLocator
      ? descLocator.locator("xpath=ancestor::form[1]")
      : undefined;
    if (formScope) logger.info("Scoped element detection to the form containing Description");

    // 2) Find the Name/Title field within that same form.
    const nameLocator = await detector.find(NAME_QUERY, formScope);

    // 3) Fill Name/Title
    if (nameLocator) {
      try {
        await fillField(agent, nameLocator, input.name);
        result.filled.name = true;
        logger.success(`Filled "Name/Title" with "${input.name}"`);
      } catch (err) {
        logger.error(`Failed to fill Name/Title: ${(err as Error).message}`);
      }
    } else {
      logger.warn("Name/Title field not found — skipping");
    }

    // 4) Fill Description
    if (descLocator) {
      try {
        await fillField(agent, descLocator, input.description);
        result.filled.description = true;
        logger.success(`Filled "Description" with "${input.description}"`);
      } catch (err) {
        logger.error(`Failed to fill Description: ${(err as Error).message}`);
      }
    } else {
      logger.warn("Description field not found — skipping");
    }

    result.screenshots.after = await agent.take_screenshot("after");

    result.status = result.filled.name || result.filled.description ? "success" : "failed";
    logger.success(`=== Automation finished: ${result.status} ===`);
  } catch (err) {
    result.status = "failed";
    result.error = (err as Error).message;
    logger.error(`Automation crashed: ${result.error}`);
    // best-effort failure screenshot
    try {
      if (agent.page) result.screenshots.after = await agent.take_screenshot("error");
    } catch {
      /* ignore */
    }
  } finally {
    await agent.close();
    unsub();

    // Archive in Qdrant (non-blocking on failure)
    const summary =
      (await grokService.summarizeRun(runLogs.map((l) => l.message))) ??
      `Filled name=${result.filled.name}, description=${result.filled.description} on ${input.url}`;
    await qdrantService.saveRun({
      id: Date.now(),
      url: input.url,
      status: result.status,
      summary,
      logs: runLogs,
      createdAt: new Date().toISOString(),
    });
  }

  return result;
}
