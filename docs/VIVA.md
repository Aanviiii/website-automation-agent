# Viva Preparation — 30 Questions & Answers

> Format per question: **Short answer** (one line you can say instantly) +
> **Detailed answer** (the technical follow-up).

---

### 1. What does your project do?
**Short:** It's an autonomous agent that opens a browser, finds a form, and fills it by itself.
**Detailed:** A Playwright-driven agent navigates to the shadcn react-hook-form page, intelligently detects the Title/Name and Description fields using a fallback hierarchy, fills them via real coordinate clicks + keyboard typing, screenshots before/after, streams every action live to a React dashboard, and archives the run in Qdrant. Grok provides LLM reasoning when selectors fail.

### 2. Why Playwright over Puppeteer/Selenium?
**Short:** Faster, more reliable auto-waiting, modern API, cross-browser.
**Detailed:** Playwright has built-in **auto-waiting** (no manual sleeps), robust locators (`getByLabel`, `getByRole`), better handling of modern client-rendered SPAs, native screenshot/trace tooling, and a single API across Chromium/Firefox/WebKit. Puppeteer is Chromium-only and lower-level; Selenium is slower and flakier.

### 3. Why Node.js / Express for the backend?
**Short:** Same language as the frontend, great Playwright support, lightweight.
**Detailed:** Playwright's reference implementation is JS/TS, so Node is first-class. Express is minimal and perfect for a small REST + SSE API. One language (TypeScript) across the stack reduces context switching.

### 4. Why React + Tailwind for the frontend?
**Short:** Fast component-based UI, utility CSS for rapid, clean styling.
**Detailed:** React's state model fits a live-updating dashboard (logs streaming in). Tailwind lets me build a polished UI quickly without writing custom CSS files. Vite gives instant HMR and fast builds.

### 5. Why Grok (an LLM) at all?
**Short:** As an intelligent fallback when deterministic selectors fail.
**Detailed:** Pages change. When CSS/XPath/label/role detection all fail, I send the form's HTML and the field label to Grok and ask for a CSS selector. This is the "AI decision-making" requirement. It's a fallback, not the hot path, so runs stay fast and cheap.

### 6. Why Qdrant (a vector database)?
**Short:** To store run history as vectors for semantic search of past executions.
**Detailed:** Plain logs only support exact-match search. Embedding each run lets me later ask "find runs similar to this failure" — the basis of agent memory. Qdrant is purpose-built for vector similarity (Cosine distance) and has a free cloud tier.

### 7. How does the agent identify elements? (key question)
**Short:** A 5-level fallback hierarchy: CSS → label → XPath → ARIA role → Grok.
**Detailed:** `ElementDetector.find()` tries each strategy in order and returns the first *visible* match: (1) CSS selectors on name/placeholder/aria-label, (2) `getByLabel`, (3) XPath from a matching `<label>` to its sibling input, (4) `getByRole('textbox', {name})`, (5) Grok reasoning from the live HTML. Every attempt is logged.

### 8. The page has many forms — how do you fill the right one?
**Short:** I detect the Description textarea first, then scope to its parent `<form>`.
**Detailed:** The shadcn page has ~9 forms (username, about, checkboxes, etc.). I locate the unique Description textarea, walk up to its `ancestor::form`, and search for the Title input *inside that scope*. This guarantees both values land in the same visible form.

### 9. Walk me through the agent workflow.
**Detailed:** `open_browser` → `navigate_to_url` → screenshot "before" → detect Description → derive form scope → detect Title in scope → for each field: scrollIntoView, get bounding box, `click_on_screen(x,y)`, clear, `send_keys` → screenshot "after" → close browser → archive in Qdrant.

### 10. Why are the tools separate methods? (modularity)
**Short:** Composability, testability, readability, and it maps to the rubric.
**Detailed:** Each tool is single-purpose, so tasks are just different compositions of the same tools, each is independently testable, and the workflow reads like human actions. (See ARCHITECTURE §4.)

### 11. How does `click_on_screen(x, y)` work?
**Short:** It uses Playwright's `page.mouse.click(x, y)` at absolute pixel coords.
**Detailed:** I compute a field's center from its `boundingBox()` (`x + width/2`, `y + height/2`) and click there to focus it — exercising the raw coordinate-click primitive — then type with `send_keys`. `double_click` uses `page.mouse.dblclick`.

### 12. How do live logs reach the browser?
**Short:** Server-Sent Events (SSE) over a single GET connection.
**Detailed:** The logger is a pub/sub. The SSE controller subscribes and writes each entry as an `event: log` frame. The React frontend uses `EventSource` and appends entries to the panel in real time, then handles a final `done` event.

### 13. Why SSE instead of WebSockets?
**Short:** Logs are one-directional (server→client); SSE is simpler.
**Detailed:** I only push from server to client, which is exactly SSE's model — no need for bidirectional WebSocket overhead. SSE auto-reconnects and works over plain HTTP.

### 14. How is error handling implemented?
**Short:** try/catch around every step; failures are logged, not fatal; browser always closed in `finally`.
**Detailed:** Invalid URL is validated up front; navigation has a 45s timeout; missing elements are skipped with a warning; a crash triggers a best-effort error screenshot; Grok/Qdrant failures are caught and the run continues. (See ARCHITECTURE §8.)

### 15. What happens if a field isn't found?
**Short:** It's skipped with a warning; the run still succeeds if the other field filled.
**Detailed:** `find()` returns `null`, we log a warning, and continue. `status` is `success` if at least one field filled, else `failed`.

### 16. What's the embedding you store in Qdrant?
**Short:** A 128-dim deterministic hashing embedding of the run text.
**Detailed:** To avoid a paid embedding API, I hash each word into a fixed-size vector and L2-normalize. It's swappable for a real embedding model (`text-embedding-3`) — that's noted as a future improvement.

### 17. Is Grok/Qdrant required to run?
**Short:** No — both are optional and degrade gracefully.
**Detailed:** `env.grok.enabled` / `qdrant.enabled` gate them. Without keys, detection uses only deterministic strategies and history is in-memory. The core task always works.

### 18. How do you handle the client-rendered shadcn page?
**Short:** Wait for `domcontentloaded` then best-effort `networkidle`.
**Detailed:** shadcn docs hydrate client-side, so I wait for the DOM and then for network to settle (with a catch so a never-idle page doesn't hang the run).

### 19. Why TypeScript?
**Short:** Type safety catches errors at compile time; better IDE support.
**Detailed:** Interfaces like `AutomationResult`, `LogEntry`, `FieldQuery` document the contracts between layers and prevent whole classes of runtime bugs.

### 20. How do screenshots get to the UI?
**Short:** Saved to `backend/screenshots`, served statically, filenames sent in the `done` event.
**Detailed:** `take_screenshot` writes a timestamped PNG; Express serves `/screenshots/<file>`; the frontend builds `${API_URL}/screenshots/<file>` as the `<img>` src.

### 21. How would you make selectors self-healing?
**Detailed:** On a failed detection, store the failure in Qdrant, ask Grok for a new selector, verify it, and persist the working selector for next time — closing the loop into agent memory.

### 22. What are the security considerations?
**Detailed:** API keys live only in environment variables (never committed — `.env` is gitignored). CORS restricts allowed origins in production. URL input is validated. No secrets are returned to the client.

### 23. How does CORS work here?
**Short:** The backend whitelists the frontend origin via the `cors` middleware.
**Detailed:** `CORS_ORIGIN` env (comma-separated) is passed to `cors()`. In production it's set to the Vercel URL so only the dashboard can call the API.

### 24. What's the deployment topology?
**Short:** Frontend on Vercel, backend (with Chromium) on Render, Grok + Qdrant as managed services.
**Detailed:** Render's build installs Chromium via `npx playwright install --with-deps chromium`; `HEADLESS=true` in prod. Vercel serves the static Vite build with `VITE_API_URL` pointing at Render.

### 25. Why might the first request on Render be slow?
**Short:** Free tier cold-start — the service sleeps after inactivity.
**Detailed:** The first hit spins the instance up (~30–60s). A paid tier or a keep-alive ping removes this.

### 26. How is this similar to "Browser Use"?
**Detailed:** Browser Use is an LLM-driven agent that perceives a page and chooses browser actions. Mine is a focused mini-version: modular browser tools + element perception + LLM fallback reasoning, scoped to one well-defined task.

### 27. How would you extend it to arbitrary tasks?
**Detailed:** Give Grok the page state and the tool list, and let it decide which tool to call next in a loop (ReAct-style) until the goal is met — turning the fixed workflow into a planned one.

### 28. How did you test it?
**Short:** Type-check, a headed smoke test, and an SSE API test with curl.
**Detailed:** `tsc --noEmit` for both apps; `smoke.ts` runs the full automation and asserts both fields filled; `curl -N` against the SSE endpoint verifies the HTTP pipeline end-to-end.

### 29. What was the hardest problem?
**Detailed:** The live page changed from the assignment's "Name/Description" to a multi-form layout ("Bug Title"/"Description"). My first version typed Name into the wrong form. I fixed it with **form-scoped detection** — anchoring on the Description textarea's parent form.

### 30. What would you improve with more time?
**Detailed:** Real embeddings for Qdrant, LLM-driven multi-step planning, self-healing selectors, Playwright trace/video capture, retries with exponential backoff, and unit tests per tool.
