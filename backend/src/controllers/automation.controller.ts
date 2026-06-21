/**
 * HTTP handlers for the automation API.
 *
 * - streamAutomation: a Server-Sent Events (SSE) endpoint. It subscribes to the
 *   logger and pushes every log line to the browser in real time, then sends a
 *   final "done" event with screenshots + status. This powers the live log
 *   panel on the dashboard.
 * - getHistory: returns recent runs from Qdrant (or the in-memory fallback).
 */
import { Request, Response } from "express";
import { runAutomation } from "../agent/automationTask";
import { logger } from "../utils/logger";
import { qdrantService } from "../services/qdrantService";

const TARGET_URL = "https://ui.shadcn.com/docs/forms/react-hook-form";

export async function streamAutomation(req: Request, res: Response) {
  // --- SSE handshake ---
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // pipe every log entry to the client
  const unsub = logger.subscribe((entry) => send("log", entry));

  // read inputs (with sensible defaults so a bare GET still works)
  const url = (req.query.url as string) || TARGET_URL;
  const name = (req.query.name as string) || "John Doe";
  const description = (req.query.description as string) || "Automated by the Website Automation Agent.";

  try {
    if (!/^https?:\/\//i.test(url)) throw new Error(`Invalid URL: ${url}`);
    const result = await runAutomation({ url, name, description });
    send("done", result);
  } catch (err) {
    send("error", { message: (err as Error).message });
  } finally {
    unsub();
    res.end();
  }
}

export async function getHistory(_req: Request, res: Response) {
  try {
    const runs = await qdrantService.recentRuns(10);
    res.json({ runs });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}
