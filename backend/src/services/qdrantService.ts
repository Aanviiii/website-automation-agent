/**
 * Qdrant vector-database integration for execution history.
 *
 * Every run is stored as a point: a vector (embedding of the run summary) plus
 * a payload with the full log. Because storing logs as VECTORS lets us later do
 * semantic search ("find runs where the form field was missing") instead of
 * plain text matching — that is the justification for using a vector DB here.
 *
 * We avoid a paid embedding API by using a lightweight, deterministic hashing
 * embedding (good enough to demo semantic clustering; swappable for a real
 * model later). If QDRANT_URL is unset, everything no-ops and runs are kept in
 * memory so the app still works.
 */
import { QdrantClient } from "@qdrant/js-client-rest";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import type { LogEntry } from "../utils/logger";

const VECTOR_SIZE = 128;

/** Deterministic bag-of-words hashing embedding -> fixed-length vector. */
function embed(text: string): number[] {
  const vec = new Array(VECTOR_SIZE).fill(0);
  for (const word of text.toLowerCase().split(/\W+/).filter(Boolean)) {
    let h = 0;
    for (let i = 0; i < word.length; i++) h = (h * 31 + word.charCodeAt(i)) >>> 0;
    vec[h % VECTOR_SIZE] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export interface RunRecord {
  id: number;
  url: string;
  status: "success" | "failed";
  summary: string;
  logs: LogEntry[];
  createdAt: string;
}

const memory: RunRecord[] = []; // always-available fallback store

const client = env.qdrant.enabled
  ? new QdrantClient({ url: env.qdrant.url, apiKey: env.qdrant.apiKey || undefined })
  : null;

let ready = false;

/** Create the collection once, if it does not already exist. */
async function ensureCollection() {
  if (!client || ready) return;
  try {
    const exists = await client.collectionExists(env.qdrant.collection);
    if (!exists.exists) {
      await client.createCollection(env.qdrant.collection, {
        vectors: { size: VECTOR_SIZE, distance: "Cosine" },
      });
      logger.success(`Qdrant: created collection "${env.qdrant.collection}"`);
    }
    ready = true;
  } catch (err) {
    logger.warn(`Qdrant init failed, using in-memory store: ${(err as Error).message}`);
  }
}

export const qdrantService = {
  enabled: env.qdrant.enabled,

  /** Persist one completed run. Never throws — failures fall back to memory. */
  async saveRun(record: RunRecord): Promise<void> {
    memory.unshift(record);
    if (!client) return;
    try {
      await ensureCollection();
      await client.upsert(env.qdrant.collection, {
        points: [
          {
            id: record.id,
            vector: embed(`${record.url} ${record.summary} ${record.status}`),
            payload: { ...record },
          },
        ],
      });
      logger.success(`Qdrant: archived run #${record.id}`);
    } catch (err) {
      logger.warn(`Qdrant save failed (kept in memory): ${(err as Error).message}`);
    }
  },

  /** Most recent runs (from Qdrant if available, else memory). */
  async recentRuns(limit = 10): Promise<RunRecord[]> {
    if (client) {
      try {
        await ensureCollection();
        const res = await client.scroll(env.qdrant.collection, { limit, with_payload: true });
        return res.points.map((p) => p.payload as unknown as RunRecord);
      } catch {
        /* fall through to memory */
      }
    }
    return memory.slice(0, limit);
  },
};
