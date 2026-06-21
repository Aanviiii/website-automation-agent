/**
 * Grok (xAI) integration.
 *
 * xAI exposes an OpenAI-compatible REST API, so we reuse the official `openai`
 * SDK and just point its baseURL at https://api.x.ai/v1.
 *
 * The agent uses Grok as a *fallback reasoner*: when the deterministic element
 * detector cannot find a field, we ask Grok to propose a CSS selector from the
 * page's HTML. If no GROK_API_KEY is configured, every method no-ops safely so
 * the core automation still works.
 */
import OpenAI from "openai";
import { env } from "../config/env";
import { logger } from "../utils/logger";

const client = env.grok.enabled
  ? new OpenAI({ apiKey: env.grok.apiKey, baseURL: env.grok.baseUrl })
  : null;

export const grokService = {
  enabled: env.grok.enabled,

  /**
   * Ask Grok for a CSS selector that targets a field described by `label`,
   * given a trimmed snapshot of the page's form HTML.
   * Returns null on any failure so callers can fall back gracefully.
   */
  async suggestSelector(label: string, htmlSnippet: string): Promise<string | null> {
    if (!client) return null;
    try {
      logger.info(`Grok: reasoning about a selector for "${label}"`);
      const completion = await client.chat.completions.create({
        model: env.grok.model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "You are a web-automation expert. Given an HTML fragment and a " +
              "field label, reply with ONLY a single valid CSS selector that " +
              "uniquely targets that input/textarea. No prose, no backticks.",
          },
          {
            role: "user",
            content: `Field label: "${label}"\n\nHTML:\n${htmlSnippet}`,
          },
        ],
      });
      const selector = completion.choices[0]?.message?.content?.trim() ?? "";
      if (!selector) return null;
      logger.success(`Grok suggested selector: ${selector}`);
      return selector;
    } catch (err) {
      logger.warn(`Grok call failed, continuing without it: ${(err as Error).message}`);
      return null;
    }
  },

  /** Short natural-language summary of a run, used for the Qdrant payload. */
  async summarizeRun(actions: string[]): Promise<string | null> {
    if (!client) return null;
    try {
      const completion = await client.chat.completions.create({
        model: env.grok.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: "Summarise this browser-automation run in one sentence." },
          { role: "user", content: actions.join("\n") },
        ],
      });
      return completion.choices[0]?.message?.content?.trim() ?? null;
    } catch {
      return null;
    }
  },
};
