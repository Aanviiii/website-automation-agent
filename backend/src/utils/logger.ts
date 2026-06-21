/**
 * A tiny structured logger.
 *
 * Two responsibilities:
 *  1. Print readable, timestamped lines to the server console.
 *  2. Emit each log entry to any subscriber (the SSE stream uses this to push
 *     live logs to the browser, and the Qdrant service archives them).
 */

export type LogLevel = "info" | "success" | "warn" | "error" | "action";

export interface LogEntry {
  ts: string; // ISO timestamp
  level: LogLevel;
  message: string;
  data?: unknown; // optional structured payload
}

type Listener = (entry: LogEntry) => void;

class Logger {
  private listeners = new Set<Listener>();

  /** Subscribe to every future log entry. Returns an unsubscribe function. */
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(level: LogLevel, message: string, data?: unknown) {
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      message,
      data,
    };
    // 1. console — colour-free so it works in Render logs too
    console.log(`[${entry.ts}] [${level.toUpperCase()}] ${message}`);
    // 2. fan out to subscribers (never let one bad listener kill the run)
    for (const l of this.listeners) {
      try {
        l(entry);
      } catch {
        /* ignore listener errors */
      }
    }
  }

  info(msg: string, data?: unknown) {
    this.emit("info", msg, data);
  }
  success(msg: string, data?: unknown) {
    this.emit("success", msg, data);
  }
  warn(msg: string, data?: unknown) {
    this.emit("warn", msg, data);
  }
  error(msg: string, data?: unknown) {
    this.emit("error", msg, data);
  }
  /** Use for every concrete browser action (click, type, scroll...). */
  action(msg: string, data?: unknown) {
    this.emit("action", msg, data);
  }
}

export const logger = new Logger();
