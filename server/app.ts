import express, { type ErrorRequestHandler } from "express";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { ZodError } from "zod";
import { now, type DB } from "./db.ts";
import type { Config } from "./config.ts";
import type { Worker } from "./worker.ts";
import { BrandLookupBody, GenerateBody, ProjectInputs, SavePlanBody } from "../shared/contract.ts";
import {
  HttpError, assertCanQueue, getInputs, getJob, getPlanRow, insertPlanVersion, jobView, latestVersion, listPlans, outputFiles, planView,
} from "./store.ts";
import { MAX_LOGO_BYTES, assertLogosExist, getLogo, lookupBrand, normalizeImage, saveLogo } from "./logos.ts";

export function createApp({ db, cfg, worker }: { db: DB; cfg: Config; worker: Worker }) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  const enqueue = (projectId: string, type: "plan" | "generate", planVersionId: number | null = null) => {
    const id = randomUUID();
    db.transaction(() => {
      assertCanQueue(db, projectId, cfg.dailyJobLimit);
      db.prepare("INSERT INTO jobs (id, project_id, type, plan_version_id, status, created_at) VALUES (?, ?, ?, ?, 'queued', ?)")
        .run(id, projectId, type, planVersionId, now());
    })();
    void worker.tick();
    return id;
  };

  // ---------- projects ----------
  app.post("/api/projects", (req, res) => {
    const inputs = ProjectInputs.parse(req.body);
    assertLogosExist(db, cfg.dataDir, inputs);
    const id = randomUUID();
    db.prepare("INSERT INTO projects (id, created_at, inputs_json) VALUES (?, ?, ?)").run(id, now(), JSON.stringify(inputs));
    res.status(201).json({ projectId: id });
  });

  app.get("/api/projects/:id", (req, res) => {
    res.json({ projectId: req.params.id, inputs: getInputs(db, req.params.id) });
  });

  app.patch("/api/projects/:id", (req, res) => {
    const merged: Record<string, unknown> = { ...getInputs(db, req.params.id), ...req.body };
    for (const [k, v] of Object.entries(merged)) if (v === null) delete merged[k]; // null clears an optional field
    const inputs = ProjectInputs.parse(merged);
    assertLogosExist(db, cfg.dataDir, inputs);
    db.prepare("UPDATE projects SET inputs_json = ? WHERE id = ?").run(JSON.stringify(inputs), req.params.id);
    res.json({ projectId: req.params.id, inputs });
  });

  // ---------- logos ----------
  /** Raw image body (PNG, JPEG or SVG). Not tied to a project, so it works before the project is first saved. */
  app.post("/api/uploads/logo", express.raw({ type: () => true, limit: MAX_LOGO_BYTES }), (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, "Send the logo file as the request body");
    res.status(201).json(saveLogo(db, cfg.dataDir, normalizeImage(req.body), { sourceUrl: null, label: "Uploaded by you" }));
  });

  app.get("/api/uploads/:id", (req, res) => {
    const logo = getLogo(db, cfg.dataDir, req.params.id);
    res.type(logo.mime).sendFile(logo.abs);
  });

  /** Candidate logos from the company's own homepage, for the user to confirm. Never applied automatically. */
  app.post("/api/brand/lookup", async (req, res) => {
    const { website } = BrandLookupBody.parse(req.body);
    res.json(await lookupBrand(db, cfg.dataDir, website));
  });

  // ---------- planning ----------
  app.post("/api/projects/:id/plan", (req, res) => {
    getInputs(db, req.params.id); // 404 if missing
    res.status(202).json({ jobId: enqueue(req.params.id, "plan") });
  });

  app.get("/api/projects/:id/plans", (req, res) => {
    getInputs(db, req.params.id);
    res.json({ plans: listPlans(db, req.params.id) });
  });

  /** Save an edit of :version. Always creates a new, unapproved version. */
  app.put("/api/projects/:id/plans/:version", (req, res) => {
    const { id } = req.params, base = Number(req.params.version);
    getPlanRow(db, id, base);
    if (base !== latestVersion(db, id)) throw new HttpError(409, `Version ${base} is not the latest plan; reload before editing`);
    const { plan } = SavePlanBody.parse(req.body);
    const { version } = insertPlanVersion(db, id, { ...plan, generatedBy: "user" }, "user");
    res.status(201).json(planView(getPlanRow(db, id, version)));
  });

  app.post("/api/projects/:id/plans/:version/approve", (req, res) => {
    const { id } = req.params, version = Number(req.params.version);
    const row = getPlanRow(db, id, version);
    if (version !== latestVersion(db, id)) throw new HttpError(409, `Version ${version} has been superseded; approve the latest version`);
    if (!row.approved_at) db.prepare("UPDATE plan_versions SET approved_at = ? WHERE id = ?").run(now(), row.id);
    res.json(planView(getPlanRow(db, id, version)));
  });

  // ---------- generation ----------
  app.post("/api/projects/:id/generate", (req, res) => {
    const { id } = req.params;
    const { planVersion } = GenerateBody.parse(req.body);
    const row = getPlanRow(db, id, planVersion);
    if (planVersion !== latestVersion(db, id)) throw new HttpError(409, `Plan version ${planVersion} has been edited since; approve the latest version first`);
    if (!row.approved_at) throw new HttpError(409, `Plan version ${planVersion} is not approved`);
    res.status(202).json({ jobId: enqueue(id, "generate", row.id) });
  });

  // ---------- jobs ----------
  app.get("/api/jobs/:id", (req, res) => {
    res.json(jobView(db, getJob(db, req.params.id)));
  });

  app.post("/api/jobs/:id/retry", (req, res) => {
    const job = getJob(db, req.params.id);
    if (job.status !== "failed") throw new HttpError(409, `Only failed jobs can be retried (status: ${job.status})`);
    db.transaction(() => {
      assertCanQueue(db, job.project_id, Infinity); // a retry doesn't count against the daily cap
      db.prepare("UPDATE jobs SET status = 'queued', stage = NULL, error = NULL, finished_at = NULL, attempt = attempt + 1 WHERE id = ?").run(job.id);
    })();
    void worker.tick();
    res.status(202).json(jobView(db, getJob(db, job.id)));
  });

  app.get("/api/jobs/:id/files/*file", (req, res) => {
    const job = getJob(db, req.params.id);
    const rel = (req.params as unknown as { file: string[] }).file.join("/");
    if (!outputFiles(db, job.id).includes(rel)) throw new HttpError(404, "File not found");
    const abs = path.join(cfg.dataDir, "jobs", job.id, rel);
    if (rel.endsWith(".png")) res.sendFile(abs);
    else res.download(abs, path.basename(rel));
  });

  app.use("/api", (_req, _res, next) => next(new HttpError(404, "Not found")));

  const onError: ErrorRequestHandler = (err, req, res, _next) => {
    if (err instanceof ZodError) return void res.status(400).json({ error: "Invalid request", issues: err.issues });
    if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message });
    if (err?.type === "entity.too.large") {
      return void res.status(413).json({ error: req.path === "/api/uploads/logo" ? "Logo must be 2 MB or smaller" : "Request body is too large" });
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  };
  app.use(onError);
  return app;
}
