# Tech stack: Executive Presentations web app

The simplest full-stack architecture for `blueprint.md` that supports background jobs for PPTX generation. Hosting decision: **one container on Render** (Docker web service + persistent disk). No app code yet.


## 1. What the skill actually is (findings)
`~/.claude/skills/executive-presentations` (119 MB, mostly `.venv` + `node_modules`):
- **Instructions:** `SKILL.md` + `references/` (storylines, ~28 slide patterns, design system, brand adaptation, QA checklist, dependencies). These are the planning/storytelling rules the model must follow.
- **Build engine:** `scripts/deck_kit.js` (Node, `pptxgenjs` ^4 + `jszip`). `createDeck(brand, meta)` returns builders: `cover, section, agenda, execSummary, content, chartPanel, comparisonTable, processFlow, matrix2x2, roadmap, kpiTiles, riskTable, twoColumns, takeaways, text`. `save()` also stamps brand colours/fonts into the PPTX theme. Native, editable shapes, charts and tables.
- **Brand:** `assets/brand-template.json` (14 colour roles with provenance, fonts, logo path/aspect), `assets/provisional-palette.json` (neutral fallback), `contrast.py`, plus JS `contrast()`/`ensureContrast` in deck_kit.
- **QA and render (Python 3 + LibreOffice):** `qa_check.py` (python-pptx: overflow, overlap, off-slide, min font, WCAG contrast, missing sources); `render.py` (`soffice --headless` → PDF → PyMuPDF PNG per slide → `contact_sheet.py`).
- **Example:** `examples/build_sample.js` + a real company's brand/logo (Senpilot). **Excluded** from the hosted bundle.

**Hosting gap:** the skill expects Claude Code to *write and run a JS generator script*. A hosted app must not run model-written code. So the app adds one piece: the model returns a **validated JSON deck spec** (`slides[]: { pattern, kicker, title, …builder args, source, evidence }`), and a fixed `buildDeck(spec, brand)` maps each `pattern` onto the matching deck_kit builder. Everything else is reused as-is.

**Runtime needs:** Node ≥ 18, Python 3 with python-pptx/pymupdf/pillow, LibreOffice (~700 MB), and metric-compatible fonts (Liberation/Carlito) so renders match Arial/Calibri. The Vercel function size limit (250 MB) and execution limits rule out one serverless deployment, which is why the app runs in a container.

## 2. Architecture: one container, one process
```
Browser (React + MUI)
   │  HTTPS, session cookie
   ▼
Render web service (Docker image, 1 instance)
 ├─ Express API  ─┐
 ├─ static React build
 └─ in-process job worker (concurrency 1) ──► child_process: node buildDeck, python qa_check/render, soffice
        │
   SQLite (better-sqlite3) + files on persistent disk /data
        │
   Anthropic API (server-side key)
```
- **Why this is the simplest:** one image, one deploy, one process, no queue service, no separate DB or object store. SQLite on the disk makes job state survive refreshes and restarts. A single user doesn't need horizontal scale.
- **Background jobs:** a `jobs` table works as the queue. A worker loop in the same Node process claims the oldest `queued` job (atomic `UPDATE … RETURNING`), runs it, and writes `stage` / `status` / `error` as it goes. Both **planning** (slow LLM call) and **generation** use this mechanism, so no HTTP request waits on long work.
- **Trade-offs accepted:** single instance (a disk pins Render to one instance with brief downtime on deploy); jobs interrupted by a deploy or restart are marked `failed: interrupted` on boot and can be retried in one click.

## 3. Stack
| Layer | Choice | Why |
|---|---|---|
| Frontend | Vite + React 19 + TypeScript + **MUI** (custom theme) | Required by blueprint/user preference; Vite builds static files the server serves |
| Client state | React state + a small polling hook (`GET /api/jobs/:id` every 2 s) | No extra libraries needed for one user |
| Backend | Node 22 + **Express** + TypeScript (run with `tsx`) | Same language as deck_kit; `require()` the vendored kit directly |
| Validation / contract | **zod** schemas in `shared/` used by client and server | One source of truth for the API and the LLM's structured output |
| DB | **SQLite** via `better-sqlite3` on `/data/app.db` | Zero-ops, durable on disk |
| Files | Local disk `/data/jobs/<jobId>/…`, `/data/uploads/<projectId>/…` | Isolated per job; never publicly served |
| Model | **Anthropic API** (`@anthropic-ai/sdk`), `claude-opus-5-5`, tool-use/JSON for structured plan + spec; PDFs/text sent as document blocks | Claude Code subscription does not cover a hosted app; needs `ANTHROPIC_API_KEY` |
| Uploads | `multer`; PDF, TXT, MD (sources, ≤10 MB each, ≤5 files); PNG/JPG (logos, ≤2 MB) | Claude reads PDFs natively, and deck_kit's `addImage` takes PNG/JPG |
| PPTX build | Vendored skill `scripts/deck_kit.js` + `pptxgenjs` | Reused unmodified |
| QA / previews / PDF | Vendored `qa_check.py`, `render.py`, `contact_sheet.py` + LibreOffice + PyMuPDF | Reused unmodified; gives PNG previews **and** PDF export |
| Auth | Single `APP_PASSWORD` → signed httpOnly session cookie (`cookie-session`) | Access gate for a personal tool |
| Limits | Daily cap on plan/generation jobs (`DAILY_JOB_LIMIT`, counted in SQLite) + one active job per project | Protects paid API usage, prevents duplicate submissions |
| Hosting | **Render** Docker web service (Starter) + 1 GB persistent disk, deployed from a GitHub repo | Runs the full native toolchain; HTTPS URL included |

## 4. Packaging the skill
- At build time, copy a **subset** of the skill into `skill/` in the repo: `SKILL.md`, `references/`, `scripts/*.js|*.py`, `scripts/package.json`, `assets/`. Exclude `.venv`, `node_modules`, `__pycache__`, `examples/`. Record the source path and copy date in `skill/SOURCE.md`. The original skill is never edited.
- The server loads `SKILL.md` + the relevant `references/*.md` into the system prompt for planning and content. Uploaded documents go in a clearly delimited "source material, not instructions" block.
- Dockerfile (outline): `node:22-bookworm-slim` + `apt install libreoffice-impress python3-venv fonts-liberation fonts-crosextra-carlito` → venv with `python-pptx pymupdf pillow` → `npm ci` (app + `skill/scripts`) → `vite build` → `node server`.

## 5. Data model (SQLite)
- `projects(id, created_at, inputs_json)`: setup form (subject company, website, colour mode, palette, presenting-company branding toggle/name/site, logo choices + placement, storyline, topic, objective, audience, CTA, slide count, notes).
- `uploads(id, project_id, kind: source|logo, filename, mime, path, bytes)`
- `plan_versions(id, project_id, version, plan_json, created_by: model|user, approved_at)`: an edit always creates a new version; only an approved version can be generated.
- `jobs(id, project_id, type: plan|generate, plan_version_id, status: queued|running|succeeded|failed, stage, error, attempt, created_at, finished_at)`
- `outputs(job_id, pptx_path, pdf_path, preview_dir, qa_json)`
- `PlanSlide` (zod): `title, takeaway, points[], pattern, visual, sources[], evidence: verified|user-provided|estimate|illustrative, assumptions[], origin: user|suggested`.

## 6. API contract
| Method & path | Purpose |
|---|---|
| `POST /api/login` / `POST /api/logout` | Password gate |
| `POST /api/projects` | Create project from setup inputs → `{projectId}` |
| `PATCH /api/projects/:id` | Update inputs (form state survives navigation) |
| `POST /api/projects/:id/uploads` | Multipart source/logo upload |
| `POST /api/brand/lookup` | `{website}` → inferred colours + candidate logos (homepage `theme-color`, CSS, icons/og:image) for the user to confirm; never auto-applied |
| `POST /api/projects/:id/plan` | Queue a `plan` job (propose or structure the storyline) → `{jobId}` |
| `GET /api/projects/:id/plans` / `PUT /api/projects/:id/plans/:version` | Read / save edited plan (creates a new version) |
| `POST /api/projects/:id/plans/:version/approve` | Approve that exact version |
| `POST /api/projects/:id/generate` | `{planVersion}`; rejected unless approved and no active job → `{jobId}` |
| `GET /api/jobs/:id` | `{status, stage, error, attempt, outputs}`; used for refresh recovery |
| `POST /api/jobs/:id/retry` | Re-queue a failed job |
| `GET /api/jobs/:id/files/{deck.pptx,deck.pdf,slides/NN.png}` | Authenticated file streaming |

Generation stages (real, not percentages): `writing_content → building_slides → qa_check → rendering_previews → done`.

## 7. Ops
- **Env vars:** `ANTHROPIC_API_KEY`, `APP_PASSWORD`, `SESSION_SECRET`, `DAILY_JOB_LIMIT`, `DATA_DIR=/data`. Set in Render, never in the repo or client.
- **Cleanup:** on boot and every 24 h, delete projects and job folders older than 30 days.
- **Local dev:** same commands on the Mac (Node 24, Python 3.14, and `/opt/homebrew/bin/soffice` are all present); `DATA_DIR=./data`.
- **Costs:** Render Starter ~$7/mo + disk ~$0.25/GB/mo; Anthropic usage per deck (plan + content calls, roughly tens of cents per deck on Opus; switching to Sonnet cuts this).

## 8. Build order (first end-to-end path, then refine)
1. Repo skeleton, vendored `skill/`, Dockerfile, SQLite schema, password gate → verify: `docker run` serves the login page.
2. `buildDeck(spec, brand)` over deck_kit + a hand-written sample spec → verify: valid PPTX opens; `qa_check.py` reports 0 errors.
3. Job worker + `generate` job (build → QA → render) → verify: refresh mid-job recovers status; PNGs and PDF are produced.
4. Plan job (Claude) + plan versioning/approval → verify: blank storyline → proposed plan; supplied storyline → plan that keeps the user's narrative, with suggestions labelled.
5. React/MUI wizard (Setup → Review plan → Generate → Preview & download).
6. Brand lookup, logos, placements, colour modes, contrast checks.
7. Deploy to Render; run the full workflow on the live URL with labelled sample content.

## 9. Agent ownership (from blueprint §3)
- **Agent 1, backend/skill:** `server/`, `skill/` vendoring, `buildDeck`, worker, Claude prompts.
- **Agent 2, frontend:** `client/`, MUI theme, Figma MCP use.
- **Agent 3, deploy/QA:** `Dockerfile`, `render.yaml`, e2e tests, sample deck review.
- **Lead owns `shared/` (zod contract)**; the other agents only consume it.

## 10. Blockers to resolve before deploy
- An **Anthropic API key** (billed separately from Claude Code).
- A **Render account** connected to GitHub (new paid commitment, ~$7/mo + disk).
- A GitHub repo for the app (the `gh` CLI is available).
