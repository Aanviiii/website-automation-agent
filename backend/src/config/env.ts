/**
 * Centralised, type-safe access to environment variables.
 * Everything optional (Grok/Qdrant) degrades gracefully if unset, so the
 * core Playwright automation always runs even without API keys.
 */
import dotenv from "dotenv";
dotenv.config();

export const env = {
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  headless: (process.env.HEADLESS ?? "true").toLowerCase() !== "false",

  grok: {
    apiKey: process.env.GROK_API_KEY ?? "",
    baseUrl: process.env.GROK_BASE_URL ?? "https://api.x.ai/v1",
    model: process.env.GROK_MODEL ?? "grok-2-latest",
    get enabled() {
      return this.apiKey.length > 0;
    },
  },

  qdrant: {
    url: process.env.QDRANT_URL ?? "",
    apiKey: process.env.QDRANT_API_KEY ?? "",
    collection: process.env.QDRANT_COLLECTION ?? "agent_logs",
    get enabled() {
      return this.url.length > 0;
    },
  },
};
