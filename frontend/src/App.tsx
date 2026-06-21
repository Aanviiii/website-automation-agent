import { useEffect, useRef, useState } from "react";

// Backend base URL. In production (Vercel) set VITE_API_URL to your Render URL.
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const DEFAULT_TARGET = "https://ui.shadcn.com/docs/forms/react-hook-form";

interface LogEntry {
  ts: string;
  level: "info" | "success" | "warn" | "error" | "action";
  message: string;
}

interface AutomationResult {
  status: "success" | "failed";
  screenshots: { before?: string; after?: string };
  filled: { name: boolean; description: boolean };
  error?: string;
}

// colour per log level for the live panel
const levelColor: Record<LogEntry["level"], string> = {
  info: "text-slate-300",
  success: "text-emerald-400",
  warn: "text-amber-400",
  error: "text-red-400",
  action: "text-sky-400",
};

export default function App() {
  const [url, setUrl] = useState(DEFAULT_TARGET);
  const [name, setName] = useState("Aanvi Solanki");
  const [description, setDescription] = useState(
    "Filled automatically by the Website Automation Agent."
  );
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AutomationResult | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // auto-scroll the log panel as new lines arrive
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  function startAutomation() {
    setLogs([]);
    setResult(null);
    setRunning(true);

    // EventSource = Server-Sent Events. Inputs are passed as query params.
    const params = new URLSearchParams({ url, name, description });
    const es = new EventSource(`${API_URL}/api/automate/stream?${params.toString()}`);

    es.addEventListener("log", (e) => {
      const entry = JSON.parse((e as MessageEvent).data) as LogEntry;
      setLogs((prev) => [...prev, entry]);
    });

    es.addEventListener("done", (e) => {
      const res = JSON.parse((e as MessageEvent).data) as AutomationResult;
      setResult(res);
      setRunning(false);
      es.close();
    });

    es.addEventListener("error", (e) => {
      // Either a server "error" event or a dropped connection.
      const data = (e as MessageEvent).data;
      if (data) {
        try {
          const parsed = JSON.parse(data);
          setLogs((prev) => [
            ...prev,
            { ts: new Date().toISOString(), level: "error", message: parsed.message },
          ]);
        } catch {
          /* ignore */
        }
      }
      setRunning(false);
      es.close();
    });
  }

  const shot = (file?: string) => (file ? `${API_URL}/screenshots/${file}` : undefined);

  return (
    <div className="min-h-screen p-6 max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">🤖 Website Automation Agent</h1>
        <p className="text-slate-400">
          Playwright + Grok + Qdrant — autonomously fills the target form and streams every action live.
        </p>
      </header>

      <div className="grid md:grid-cols-2 gap-6">
        {/* ---- Control panel ---- */}
        <section className="bg-slate-900 rounded-xl p-5 space-y-4 border border-slate-800">
          <h2 className="font-semibold text-lg">Configuration</h2>

          <label className="block text-sm">
            Target URL
            <input
              className="mt-1 w-full rounded bg-slate-800 px-3 py-2 outline-none focus:ring-2 ring-sky-500"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>

          <label className="block text-sm">
            Name / Title value
            <input
              className="mt-1 w-full rounded bg-slate-800 px-3 py-2 outline-none focus:ring-2 ring-sky-500"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <label className="block text-sm">
            Description value
            <textarea
              className="mt-1 w-full rounded bg-slate-800 px-3 py-2 outline-none focus:ring-2 ring-sky-500"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <button
            onClick={startAutomation}
            disabled={running}
            className="w-full rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed py-2.5 font-semibold transition"
          >
            {running ? "Running…" : "▶ Start Automation"}
          </button>

          {result && (
            <div
              className={`rounded-lg p-3 text-sm font-medium ${
                result.status === "success"
                  ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                  : "bg-red-950 text-red-300 border border-red-800"
              }`}
            >
              Status: {result.status.toUpperCase()} — Name filled:{" "}
              {String(result.filled.name)}, Description filled: {String(result.filled.description)}
              {result.error && <div className="mt-1 text-red-400">Error: {result.error}</div>}
            </div>
          )}
        </section>

        {/* ---- Live logs ---- */}
        <section className="bg-slate-900 rounded-xl p-5 border border-slate-800 flex flex-col">
          <h2 className="font-semibold text-lg mb-2">Live Agent Logs</h2>
          <div className="flex-1 overflow-y-auto h-72 bg-black/40 rounded p-3 font-mono text-xs space-y-1">
            {logs.length === 0 && <p className="text-slate-600">Logs will appear here…</p>}
            {logs.map((l, i) => (
              <div key={i} className={levelColor[l.level]}>
                <span className="text-slate-600">
                  {new Date(l.ts).toLocaleTimeString()}{" "}
                </span>
                [{l.level}] {l.message}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </section>
      </div>

      {/* ---- Screenshots ---- */}
      <section className="mt-6 bg-slate-900 rounded-xl p-5 border border-slate-800">
        <h2 className="font-semibold text-lg mb-3">Screenshots</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {(["before", "after"] as const).map((key) => (
            <div key={key}>
              <p className="text-sm text-slate-400 mb-1 capitalize">{key}</p>
              {shot(result?.screenshots[key]) ? (
                <img
                  src={shot(result?.screenshots[key])}
                  alt={key}
                  className="rounded-lg border border-slate-700 w-full"
                />
              ) : (
                <div className="rounded-lg border border-dashed border-slate-700 h-48 grid place-items-center text-slate-600 text-sm">
                  No {key} screenshot yet
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
