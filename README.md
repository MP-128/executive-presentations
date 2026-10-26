# Executive Presentations

A web app that turns the `executive-presentations` Claude Code skill into a hosted tool for building executive slide decks. You enter a company, branding and a storyline. Claude proposes a slide plan, which you edit and approve, and the app then generates an editable PowerPoint file with slide previews and a PDF.

**Live:** https://executive-presentations.onrender.com

## How it works

```
Setup form ──► proposed slide plan ──► edit + approve a version ──► generate ──► PPTX + PDF + previews
```

1. **Setup**: company name and website, a colour mode (subject company, presenting company, neutral or custom palette), optional logos (uploaded, or picked from candidates found on the company's homepage), and a storyline or a topic/objective, audience, call to action and slide count.
2. **Plan**: a background job asks Claude for a slide-by-slide plan. Each slide has a title, takeaway, points, a layout pattern, sources and an evidence tag (`verified`, `user-provided`, `estimate`, `illustrative`).
3. **Review**: edits are saved as new plan versions. You approve one specific version.
4. **Generate**: a second job works through these stages:
   - `writing_content`: Claude turns the approved plan into a validated JSON deck spec.
   - `building_slides`: `buildDeck` maps each slide onto the skill's `deck_kit.js` builders (pptxgenjs).
   - `qa_check`: the skill's `qa_check.py` checks for overflow, overlap, small fonts, contrast and missing sources.
   - `rendering_previews`: `render.py` uses LibreOffice to produce a PDF and one PNG per slide.

The model only ever returns JSON validated against `shared/contract.ts`. It never writes or runs code.

## Architecture

The app runs as one container and one Node process:

```
Browser (React 19 + MUI)
   │
   ▼
Express API ── serves client/dist
   │
   ├─ in-process job worker (plan + generate jobs, SQLite as the queue)
   │     ├─ Anthropic API (claude-opus-5-5)
   │     ├─ skill/scripts/deck_kit.js   (PPTX build)
   │     └─ python: qa_check.py, render.py + LibreOffice
   │
   └─ SQLite + files under DATA_DIR (app.db, uploads/, jobs/<id>/)
```

| Path | Contents |
|---|---|
| `client/` | Vite + React + MUI frontend (setup form, plan review, generation view) |
| `server/` | Express API (`app.ts`), job worker (`worker.ts`), Claude integration (`claude.ts`), placeholder planner (`llm.ts`), deck builder (`deck/buildDeck.ts`), logo handling (`logos.ts`) |
| `shared/contract.ts` | zod schemas shared by client and server: project inputs, plans, deck spec, jobs |
| `skill/` | Vendored subset of the `executive-presentations` skill (instructions, references, assets, scripts) |
| `tests/` | Vitest + supertest tests for the API, deck builder, Claude integration and logos |
| `blueprint.md`, `tech-stack.md` | Original brief and architecture decisions |

## Running locally

Requirements:

- Node 22 or later
- Python 3 with `python-pptx`, `pillow` and `pymupdf`, for QA and rendering
- LibreOffice (`soffice` on your `PATH`), for previews and PDF. You can skip it with `RENDER_PREVIEWS=false`.

```bash
npm install
python3 -m venv .venv && .venv/bin/pip install python-pptx pillow pymupdf   # picked up automatically from .venv

export ANTHROPIC_API_KEY=sk-ant-...   # optional, see below
npm run dev          # API + worker on http://localhost:3001
npm run dev:client   # frontend on http://localhost:5173, proxies /api to the API
```

If `ANTHROPIC_API_KEY` is not set, the app uses a deterministic placeholder planner. Everything it writes is clearly labelled and tagged `synthetic`, so you can test the whole flow without making API calls.

To serve the built frontend from the API, the same way production does:

```bash
npm run build && npm start
```

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API + worker with reload on change |
| `npm run dev:client` | Vite dev server for the frontend |
| `npm run build` | Build the frontend into `client/dist` |
| `npm start` | Run the server, which also serves `client/dist` if it has been built |
| `npm test` | Run the Vitest suite |
| `npm run typecheck` | Type-check the server and the client |
| `npm run vendor-skill` | Re-copy the skill from `~/.claude/skills/executive-presentations` (see below) |

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | not set | Enables Claude. Without it, the placeholder planner runs. |
| `PORT` | `3001` | HTTP port |
| `DATA_DIR` | `./data` | SQLite database, uploads and job outputs |
| `PYTHON_BIN` | `.venv/bin/python` if present, else `python3` | Python used for the skill's scripts |
| `DAILY_JOB_LIMIT` | `50` | Maximum plan and generate jobs per day |
| `RENDER_PREVIEWS` | `true` | Set to `false` to skip LibreOffice rendering. You still get the PPTX. |
| `API_PORT` | `3001` | Port the Vite dev proxy forwards `/api` to |

## API

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/projects` | Create a project from setup inputs |
| `GET` / `PATCH` | `/api/projects/:id` | Read or update inputs (`null` clears an optional field) |
| `POST` | `/api/uploads/logo` | Upload a logo as a raw PNG, JPEG or SVG body (2 MB max) |
| `GET` | `/api/uploads/:id` | Fetch a stored logo |
| `POST` | `/api/brand/lookup` | Find candidate logos on a company website. These are never applied automatically. |
| `POST` | `/api/projects/:id/plan` | Queue a planning job |
| `GET` | `/api/projects/:id/plans` | List plan versions |
| `PUT` | `/api/projects/:id/plans/:version` | Save an edited plan as a new version |
| `POST` | `/api/projects/:id/plans/:version/approve` | Approve a plan version |
| `POST` | `/api/projects/:id/generate` | Queue generation for an approved version |
| `GET` | `/api/jobs/:id` | Job status, stage, error and outputs |
| `POST` | `/api/jobs/:id/retry` | Retry a failed job |
| `GET` | `/api/jobs/:id/files/*` | Download `deck.pptx`, `preview/deck.pdf` or slide PNGs |

The request and response shapes are defined in `shared/contract.ts`.

## Deployment

The app is deployed on [Render](https://render.com) from `render.yaml`:

- A single Docker web service (`0.5c-512mb`, Oregon) with a 5 GB persistent disk mounted at `/var/data`.
- The `Dockerfile` builds the frontend, then installs LibreOffice Impress, Liberation fonts and a Python venv with the skill's dependencies.
- Every commit to `main` triggers a deploy.
- `ANTHROPIC_API_KEY` is set in the Render dashboard and is never committed.

The worker and the web server share the SQLite database and the files on the disk, and a Render disk can only attach to one service. For that reason the app runs as a single instance, and deploys cause brief downtime. Jobs that are interrupted by a restart are marked failed and can be retried. If LibreOffice runs out of memory while rendering, move to the `1c-2g` plan.

> **Note:** the app has no login. Anyone with the URL can create projects and use the daily job quota, which is charged to the API key.

## The vendored skill

`skill/` is a copy of `~/.claude/skills/executive-presentations`, made by `scripts/vendor-skill.sh`. The copy leaves out `.venv`, `node_modules`, `__pycache__` and `examples/`. The original skill is never modified. `SKILL.md` and `references/` become Claude's system prompt, and `scripts/` provides the deck builder, QA and rendering.

`skill/scripts/deck_kit.js` has local changes that are not in the source skill: a brand strip, card grids, panelled columns, table styling, title fitting, logo placement and a closing slide. They are listed in `skill/SOURCE.md`. **Running `npm run vendor-skill` overwrites these changes.**
