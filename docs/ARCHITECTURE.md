# Architecture Document — Website Automation Agent

## 1. Goal
Build an autonomous agent that opens a browser, navigates to
`https://ui.shadcn.com/docs/forms/react-hook-form`, intelligently locates the
**Title (Name)** and **Description** form fields, fills them, captures
before/after screenshots, logs every action, and recovers gracefully from
failures.

## 2. High-Level Design

Two deployable units plus two optional managed services:

| Layer | Tech | Responsibility | Hosted on |
|---|---|---|---|
| Frontend | React + Vite + TailwindCSS | Dashboard: inputs, live logs (SSE), screenshots, status | Vercel |
| Backend | Node.js + Express + TypeScript | REST/SSE API, orchestration | Render |
| Automation | Playwright (Chromium) | Real browser control | inside backend |
| LLM | Grok (xAI) | Fallback selector reasoning + run summary | xAI API |
| Vector DB | Qdrant | Semantic archive of execution history | Qdrant Cloud |

### Communication flow
1. The **frontend** opens a `GET /api/automate/stream` **Server-Sent Events**
   connection (EventSource) carrying `url`, `name`, `description` as query params.
2. The **backend** controller subscribes to the logger and forwards every log
   entry to the browser as it happens (true live logs), then runs the workflow.
3. The **automationTask** orchestrator composes the **BrowserAgent** tools
   (Playwright) and the **ElementDetector**.
4. If deterministic detection fails, the detector calls **Grok** to reason out a
   CSS selector from the live form HTML.
5. On completion, the run (logs + summary) is embedded and stored in **Qdrant**;
   a final `done` event returns status + screenshot filenames.
6. Screenshots are served as static files at `/screenshots/<file>.png`.

## 3. Agent Workflow (step by step)
```
open_browser()
  └─ launch Chromium, new context (1280×900), new page
navigate_to_url(target)
  └─ goto + wait for DOM + networkidle (handles client-rendered shadcn docs)
take_screenshot("before")
detect Description (textarea)            ── intelligent detection
derive its <form> as the search scope    ── disambiguates multiple forms
detect Name/Title inside that same form
for each field:
  scrollIntoView → boundingBox → click_on_screen(cx, cy) → fill("") → send_keys(value)
take_screenshot("after")
close() + archive run in Qdrant
```

## 4. Tool Architecture (why modular)
Each capability is a single-purpose method on `BrowserAgent`. Benefits:
- **Composability** — new tasks reuse the same tools, just in a different order.
- **Testability** — each tool can be unit-tested in isolation.
- **Readability** — `automationTask` reads like a sequence of human actions.
- **Maps directly to the rubric** — the assignment lists exactly these tools.

The 7 tools: `open_browser`, `navigate_to_url`, `take_screenshot`,
`click_on_screen(x,y)`, `send_keys`, `scroll`, `double_click`.

> Note: the fields are focused with **real coordinate clicks**
> (`click_on_screen(x,y)`) computed from each element's bounding box, then typed
> with `send_keys` — exercising the required low-level primitives rather than a
> single high-level `fill()`. `fill()` remains as a resilient fallback.

## 5. Element Detection (the "intelligence")
A prioritised fallback hierarchy in `ElementDetector.find()`:
1. **CSS selectors** — `name`, `placeholder`, `aria-label`, type.
2. **Label association** — Playwright `getByLabel` (robust to markup changes).
3. **XPath** — find a `<label>` containing the text, take its sibling control.
4. **ARIA role + accessible name** — `getByRole('textbox', {name})`.
5. **Grok LLM** — send the form HTML + label, ask for a CSS selector.

Each attempt is logged, so the decision process is visible in the live panel.
The first strategy that resolves a *visible* element wins.

## 6. LLM (Grok) Usage
- xAI exposes an **OpenAI-compatible** API, so we reuse the `openai` SDK with
  `baseURL = https://api.x.ai/v1`.
- Used as a **fallback reasoner**, not the primary path — this keeps runs fast,
  deterministic, and cheap, while still demonstrating AI decision-making.
- Also produces a one-line natural-language **run summary** stored in Qdrant.
- Entirely optional: with no key, the agent silently skips Grok.

## 7. Qdrant Usage
- Each run → a 128-dim vector (lightweight deterministic hashing embedding) +
  payload (url, status, summary, full logs).
- **Why a vector DB?** It enables *semantic* retrieval of past runs ("show runs
  similar to this failure") instead of exact text matching — useful for
  debugging recurring automation issues and building agent memory.
- Optional and non-blocking: if Qdrant is unreachable, runs are kept in memory
  and the API keeps working.

## 8. Error Handling Strategy
| Failure | Handling |
|---|---|
| Invalid URL | Validated before launch; `error` SSE event |
| Navigation timeout | `goto` timeout 45s; `networkidle` wait is best-effort |
| Element not found | Field skipped + warned; run still succeeds if any field filled |
| Browser crash | Caught in `try/catch`; best-effort error screenshot; browser always closed in `finally` |
| Grok failure | Caught; returns `null`; detection continues without it |
| Qdrant failure | Caught; falls back to in-memory store |

Nothing throws to the top level — the server stays alive across runs.

## 9. Deployment — click by click

### Backend on Render
1. Push the repo to GitHub.
2. Render → **New** → **Web Service** → connect the GitHub repo.
3. **Root Directory:** `backend`.
4. **Build Command:** `npm install && npx playwright install --with-deps chromium && npm run build`
5. **Start Command:** `npm start`
6. **Environment** tab → add `HEADLESS=true`, `CORS_ORIGIN=<vercel-url>`, and any
   `GROK_*` / `QDRANT_*` keys.
7. **Create Web Service** → wait for build → copy the `*.onrender.com` URL.
8. Verify: open `<render-url>/health` → `{"ok":true}`.

### Frontend on Vercel
1. Vercel → **Add New** → **Project** → import the same GitHub repo.
2. **Root Directory:** `frontend`. Framework preset auto-detects **Vite**.
3. **Environment Variables:** `VITE_API_URL=<render-url>`.
4. **Deploy** → open the Vercel URL → click **Start Automation**.
5. Go back to Render env and set `CORS_ORIGIN` to the Vercel URL; redeploy backend.

> Render free tier sleeps after inactivity — the first request may take ~30–60s
> to cold-start. Mention this proactively in the viva.
