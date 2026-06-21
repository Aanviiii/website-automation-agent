# 🤖 Website Automation Agent

An intelligent browser-automation agent — a mini "Browser Use" — that opens a
real browser, navigates to a target page, **autonomously detects and fills form
fields**, takes before/after screenshots, streams every action live to a
dashboard, reasons with an LLM (Grok) when selectors fail, and archives each run
in a vector database (Qdrant).

**Target task:** navigate to
`https://ui.shadcn.com/docs/forms/react-hook-form`, detect the form's **Title
(Name)** and **Description** fields, and fill them automatically.

---

## ✨ Features

- **7 composable automation tools** — `open_browser`, `navigate_to_url`,
  `take_screenshot`, `click_on_screen(x, y)`, `send_keys`, `scroll`,
  `double_click`.
- **Intelligent element detection** with a 5-level fallback hierarchy:
  CSS → label → XPath → ARIA role → **Grok LLM reasoning**.
- **Form-scoped detection** — the page has many forms; the agent locks onto the
  one that actually contains the target fields.
- **Live dashboard** (React + Tailwind) with real-time logs (Server-Sent
  Events), screenshot previews, and success/failure status.
- **Robust error handling** — invalid URL, timeout, missing element, browser
  crash, and optional-service failures all degrade gracefully.
- **Vector-DB history** — every run is embedded and stored in Qdrant for
  semantic search of past executions (falls back to in-memory if not configured).

---

## 🏗️ Architecture

```
┌──────────────┐   SSE (live logs)   ┌──────────────────────────────┐
│  React UI    │ ◀────────────────── │  Express API (/api)          │
│  (Vercel)    │ ── GET /automate ─▶ │                              │
└──────────────┘                     │  ┌────────────────────────┐  │
                                     │  │ automationTask          │  │
                                     │  │  (workflow orchestrator)│  │
                                     │  └─────────┬──────────────┘  │
                                     │   ┌────────┴────────┐         │
                                     │   ▼                 ▼         │
                                     │ BrowserAgent   ElementDetector│
                                     │ (Playwright)   (CSS/XPath/    │
                                     │                 Grok fallback)│
                                     │        │             │        │
                                     │        ▼             ▼        │
                                     │   Chromium      Grok (xAI)    │
                                     │                 Qdrant (logs) │
                                     │       (Render)                │
                                     └──────────────────────────────┘
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design write-up.

---

## 📁 Project Structure

```
website-automation-agent/
├── backend/
│   ├── src/
│   │   ├── index.ts                  # Express entry, CORS, static screenshots
│   │   ├── config/env.ts             # type-safe env access (graceful defaults)
│   │   ├── utils/logger.ts           # structured logger + pub/sub for SSE
│   │   ├── agent/
│   │   │   ├── browserAgent.ts       # the 7 Playwright tools
│   │   │   ├── elementDetector.ts    # 5-level detection fallback hierarchy
│   │   │   └── automationTask.ts     # high-level workflow orchestrator
│   │   ├── services/
│   │   │   ├── grokService.ts        # Grok (xAI) LLM reasoning (optional)
│   │   │   └── qdrantService.ts      # Qdrant vector DB history (optional)
│   │   ├── controllers/automation.controller.ts  # SSE + history handlers
│   │   └── routes/automation.routes.ts
│   ├── screenshots/                  # captured PNGs (served statically)
│   ├── env.example                   # copy to .env
│   ├── tsconfig.json
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx                    # dashboard (config, live logs, shots)
│   │   ├── main.tsx
│   │   └── index.css                 # Tailwind directives
│   ├── env.example                   # copy to .env (VITE_API_URL)
│   ├── tailwind.config.js
│   ├── vite.config.ts
│   └── package.json
├── docs/
│   ├── ARCHITECTURE.md               # design decisions + agent workflow
│   └── VIVA.md                       # 30 Q&A viva preparation
├── .gitignore
└── README.md
```

---

## 🚀 Setup & Run (local)

### Prerequisites
- Node.js 18+ (tested on 22)
- Git

### 1. Backend

```bash
cd backend
npm install                 # installs deps + downloads Chromium (postinstall)
cp .env.example .env        # then edit .env if you have Grok/Qdrant keys
npm run dev                 # starts on http://localhost:4000
```

> Tip: set `HEADLESS=false` in `.env` so you can **watch** the browser fill the
> form during the viva — examiners love seeing it live.

If Chromium did not download (e.g. flaky network), run:
```bash
npx playwright install chromium
```

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env        # VITE_API_URL=http://localhost:4000
npm run dev                 # opens http://localhost:5173
```

Open `http://localhost:5173`, click **Start Automation**, and watch the logs and
screenshots populate.

---

## 🔑 Environment Variables

### Backend (`backend/.env`)
| Variable | Required | Description |
|---|---|---|
| `PORT` | no (4000) | API port |
| `CORS_ORIGIN` | no (`*`) | Allowed frontend origin(s), comma-separated |
| `HEADLESS` | no (`true`) | `false` shows the browser window |
| `GROK_API_KEY` | optional | xAI key — enables LLM selector reasoning |
| `GROK_BASE_URL` | optional | default `https://api.x.ai/v1` |
| `GROK_MODEL` | optional | default `grok-2-latest` |
| `QDRANT_URL` | optional | Qdrant cluster URL — enables run history |
| `QDRANT_API_KEY` | optional | Qdrant API key |
| `QDRANT_COLLECTION` | optional | default `agent_logs` |

### Frontend (`frontend/.env`)
| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend base URL (Render URL in production) |

> The agent runs fully **without** Grok or Qdrant keys — they enhance, never block.

---

## ☁️ Deployment

- **Backend → Render** (Web Service)
  - Root directory: `backend`
  - Build command: `npm install && npx playwright install --with-deps chromium && npm run build`
  - Start command: `npm start`
  - Env: set `HEADLESS=true`, `CORS_ORIGIN=<your-vercel-url>`, plus any keys.
- **Frontend → Vercel**
  - Root directory: `frontend`
  - Framework preset: Vite
  - Env: `VITE_API_URL=<your-render-url>`

Full click-by-click steps are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## 🧪 Testing

```bash
# backend type-check
cd backend && npx tsc --noEmit

# end-to-end smoke test (opens browser, fills form, prints result)
HEADLESS=false npx tsx smoke.ts

# API test (server must be running)
curl -N "http://localhost:4000/api/automate/stream"
```

---

## 🔮 Future Improvements
- Real embedding model (e.g. `text-embedding-3`) for richer Qdrant semantic search.
- Self-healing selectors: feed failed runs back to Grok to auto-update selectors.
- Multi-step task planning where Grok decides the next tool to call.
- Video recording of runs (Playwright trace viewer).
