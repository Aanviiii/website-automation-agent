/**
 * ElementDetector — the "intelligence" of the agent.
 *
 * Real pages change, so we never rely on a single brittle selector. We try a
 * prioritised FALLBACK HIERARCHY and return the first locator that resolves:
 *
 *   1. CSS selectors      (fast, common: id / name / placeholder / aria-label)
 *   2. Label association  (Playwright getByLabel — robust to markup changes)
 *   3. XPath              (text-based: find <label> then its sibling control)
 *   4. Text / role search (getByRole textbox near matching text)
 *   5. Grok reasoning     (ask the LLM for a selector from the live HTML)
 *
 * Each attempt is logged, so the viva examiner can literally watch the decision
 * process in the live log panel.
 */
import { Page, Locator } from "playwright";
import { logger } from "../utils/logger";
import { grokService } from "../services/grokService";

/** A search root can be the whole page or a single form (to disambiguate when a
 *  page has several forms). Both Page and Locator expose locator/getByLabel/
 *  getByRole, so the detector works against either. */
type SearchRoot = Pick<Page, "locator" | "getByLabel" | "getByRole">;

export interface FieldQuery {
  /** Human label, e.g. "Name" or "Description". */
  label: string;
  /** Candidate CSS selectors, tried in order. */
  css: string[];
  /** Prefer a <textarea> for multi-line fields like Description. */
  preferTextarea?: boolean;
}

async function firstVisible(page: Page, locator: Locator): Promise<Locator | null> {
  try {
    const count = await locator.count();
    for (let i = 0; i < count; i++) {
      const el = locator.nth(i);
      if (await el.isVisible().catch(() => false)) return el;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export class ElementDetector {
  constructor(private page: Page) {}

  /**
   * Run the full fallback hierarchy for one field. Returns a Locator or null.
   * @param scope optional form Locator to search inside (disambiguates pages
   *              with multiple forms). Defaults to the whole page.
   */
  async find(query: FieldQuery, scope?: Locator): Promise<Locator | null> {
    const { label } = query;
    const root: SearchRoot = scope ?? this.page;

    // 1) CSS selectors
    for (const sel of query.css) {
      const hit = await firstVisible(this.page, root.locator(sel));
      if (hit) {
        logger.success(`Detected "${label}" via CSS selector: ${sel}`);
        return hit;
      }
    }

    // 2) Label association (most robust for forms)
    const byLabel = await firstVisible(this.page, root.getByLabel(label, { exact: false }));
    if (byLabel) {
      logger.success(`Detected "${label}" via getByLabel`);
      return byLabel;
    }

    // 3) XPath: a <label> containing the text, then the nearest input/textarea
    const control = query.preferTextarea ? "textarea" : "input";
    const xpath =
      `xpath=//label[contains(translate(normalize-space(.),` +
      `'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),` +
      `'${label.toLowerCase()}')]/following::${control}[1]`;
    const byXpath = await firstVisible(this.page, root.locator(xpath));
    if (byXpath) {
      logger.success(`Detected "${label}" via XPath label-sibling`);
      return byXpath;
    }

    // 4) Role + accessible-name search
    const byRole = await firstVisible(
      this.page,
      root.getByRole("textbox", { name: new RegExp(label, "i") })
    );
    if (byRole) {
      logger.success(`Detected "${label}" via ARIA role/name`);
      return byRole;
    }

    // 5) Grok fallback — ask the LLM to read the form HTML and propose a CSS
    if (grokService.enabled) {
      const formHtml = await (scope ?? this.page.locator("form").first())
        .innerHTML()
        .catch(() => "");
      const snippet = formHtml.slice(0, 4000);
      const suggestion = await grokService.suggestSelector(label, snippet);
      if (suggestion) {
        const byGrok = await firstVisible(this.page, this.page.locator(suggestion));
        if (byGrok) {
          logger.success(`Detected "${label}" via Grok-suggested selector`);
          return byGrok;
        }
      }
    }

    logger.warn(`Could not detect field "${label}" with any strategy`);
    return null;
  }
}
