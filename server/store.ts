import { now, type DB } from "./db.ts";
import { Plan, ProjectInputs, type JobView, type PlanVersion } from "../shared/contract.ts";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export interface JobRow {
  id: string; project_id: string; type: "plan" | "generate"; plan_version_id: number | null;
  status: string; stage: string | null; error: string | null; attempt: number; created_at: string; finished_at: string | null;
}
interface PlanRow { id: number; version: number; plan_json: string; created_by: "model" | "user"; created_at: string; approved_at: string | null }

export function getInputs(db: DB, projectId: string): ProjectInputs {
  const row = db.prepare("SELECT inputs_json FROM projects WHERE id = ?").get(projectId) as { inputs_json: string } | undefined;
  if (!row) throw new HttpError(404, "Project not found");
  return ProjectInputs.parse(JSON.parse(row.inputs_json));
}

export function insertPlanVersion(db: DB, projectId: string, plan: Plan, createdBy: "model" | "user"): { id: number; version: number } {
  const { v } = db.prepare("SELECT COALESCE(MAX(version), 0) + 1 AS v FROM plan_versions WHERE project_id = ?").get(projectId) as { v: number };
  const r = db.prepare("INSERT INTO plan_versions (project_id, version, plan_json, created_by, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(projectId, v, JSON.stringify(Plan.parse(plan)), createdBy, now());
  return { id: Number(r.lastInsertRowid), version: v };
}

export function getPlanRow(db: DB, projectId: string, version: number): PlanRow {
  const row = db.prepare("SELECT * FROM plan_versions WHERE project_id = ? AND version = ?").get(projectId, version) as PlanRow | undefined;
  if (!row) throw new HttpError(404, `Plan version ${version} not found`);
  return row;
}

export function latestVersion(db: DB, projectId: string): number {
  return (db.prepare("SELECT COALESCE(MAX(version), 0) AS v FROM plan_versions WHERE project_id = ?").get(projectId) as { v: number }).v;
}

export function planView(row: PlanRow): PlanVersion {
  return { version: row.version, plan: JSON.parse(row.plan_json), createdBy: row.created_by, createdAt: row.created_at, approvedAt: row.approved_at };
}

export function listPlans(db: DB, projectId: string): PlanVersion[] {
  return (db.prepare("SELECT * FROM plan_versions WHERE project_id = ? ORDER BY version").all(projectId) as PlanRow[]).map(planView);
}

export function getJob(db: DB, id: string): JobRow {
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow | undefined;
  if (!job) throw new HttpError(404, "Job not found");
  return job;
}

export function jobView(db: DB, job: JobRow): JobView {
  const out = db.prepare("SELECT * FROM outputs WHERE job_id = ?").get(job.id) as
    { qa_json: string | null; render_skipped: string | null } | undefined;
  const version = job.plan_version_id == null ? null
    : (db.prepare("SELECT version FROM plan_versions WHERE id = ?").get(job.plan_version_id) as { version: number }).version;
  return {
    id: job.id, projectId: job.project_id, type: job.type, status: job.status as JobView["status"], stage: job.stage,
    error: job.error, attempt: job.attempt, planVersion: version, createdAt: job.created_at, finishedAt: job.finished_at,
    outputs: out ? { files: outputFiles(db, job.id), qa: out.qa_json ? JSON.parse(out.qa_json) : null, renderSkipped: out.render_skipped } : null,
  };
}

/** Relative file paths a job exposes for download. Only these are ever served. */
export function outputFiles(db: DB, jobId: string): string[] {
  const out = db.prepare("SELECT pptx_path, pdf_path, previews_json FROM outputs WHERE job_id = ?").get(jobId) as
    { pptx_path: string; pdf_path: string | null; previews_json: string | null } | undefined;
  if (!out) return [];
  const previews = out.previews_json ? (JSON.parse(out.previews_json) as string[]) : [];
  return [out.pptx_path, ...(out.pdf_path ? [out.pdf_path] : []), ...previews];
}

/** Rejects when the project already has a queued/running job or the daily cap is reached. */
export function assertCanQueue(db: DB, projectId: string, dailyLimit: number) {
  const active = db.prepare("SELECT id FROM jobs WHERE project_id = ? AND status IN ('queued','running')").get(projectId) as { id: string } | undefined;
  if (active) throw new HttpError(409, `Project already has an active job (${active.id})`);
  const today = new Date().toISOString().slice(0, 10);
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE substr(created_at, 1, 10) = ?").get(today) as { n: number };
  if (n >= dailyLimit) throw new HttpError(429, `Daily job limit (${dailyLimit}) reached`);
}
