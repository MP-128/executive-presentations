// In-process background worker (concurrency 1). The `jobs` table is the queue; both plan and
// generate jobs run here so no HTTP request waits on slow model calls or rendering.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { now, type DB } from "./db.ts";
import type { Config } from "./config.ts";
import type { Llm } from "./llm.ts";
import { brandFor, buildDeck } from "./deck/buildDeck.ts";
import { getInputs, insertPlanVersion, type JobRow } from "./store.ts";
import { getLogo } from "./logos.ts";
import { Plan } from "../shared/contract.ts";

const exec = promisify(execFile);

export class Worker {
  private current: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(private db: DB, private cfg: Config, private llm: Llm) {}

  /** Mark jobs left running by a previous process as failed, then poll for queued work. */
  start(intervalMs = 1000) {
    this.db.prepare("UPDATE jobs SET status = 'failed', error = 'Interrupted by a server restart; retry to run it again', finished_at = ? WHERE status = 'running'")
      .run(now());
    this.timer = setInterval(() => void this.tick(), intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Process queued jobs until none remain. Concurrent callers share the in-flight run. */
  tick(): Promise<void> {
    this.current ??= this.drain().finally(() => { this.current = null; });
    return this.current;
  }

  private async drain() {
    let job: JobRow | undefined;
    while ((job = this.claim())) await this.run(job);
  }

  private claim(): JobRow | undefined {
    return this.db.prepare(`
      UPDATE jobs SET status = 'running', stage = NULL, error = NULL
      WHERE id = (SELECT id FROM jobs WHERE status = 'queued' ORDER BY created_at, rowid LIMIT 1)
      RETURNING *`).get() as JobRow | undefined;
  }

  private async run(job: JobRow) {
    try {
      if (job.type === "plan") await this.runPlan(job);
      else await this.runGenerate(job);
      this.db.prepare("UPDATE jobs SET status = 'succeeded', finished_at = ? WHERE id = ?").run(now(), job.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.db.prepare("UPDATE jobs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?").run(message, now(), job.id);
    }
  }

  private setStage(job: JobRow, stage: string) {
    this.db.prepare("UPDATE jobs SET stage = ? WHERE id = ?").run(stage, job.id);
  }

  private async runPlan(job: JobRow) {
    this.setStage(job, "planning");
    const plan = Plan.parse(await this.llm.proposePlan(getInputs(this.db, job.project_id)));
    const { id } = insertPlanVersion(this.db, job.project_id, plan, "model");
    this.db.prepare("UPDATE jobs SET plan_version_id = ?, stage = 'done' WHERE id = ?").run(id, job.id);
  }

  private async runGenerate(job: JobRow) {
    const row = this.db.prepare("SELECT plan_json, approved_at FROM plan_versions WHERE id = ?").get(job.plan_version_id) as
      { plan_json: string; approved_at: string | null } | undefined;
    if (!row?.approved_at) throw new Error("Plan version is not approved");
    const inputs = getInputs(this.db, job.project_id);
    const dir = path.join(this.cfg.dataDir, "jobs", job.id);
    fs.rmSync(dir, { recursive: true, force: true }); // a retry starts clean
    fs.mkdirSync(dir, { recursive: true });
    const pptx = path.join(dir, "deck.pptx");

    this.setStage(job, "writing_content");
    const spec = await this.llm.writeDeckSpec(Plan.parse(JSON.parse(row.plan_json)), inputs);
    const logo = (id?: string) => {
      if (!id) return undefined;
      const l = getLogo(this.db, this.cfg.dataDir, id);
      return { path: l.abs, aspect: l.width / l.height, source: l.source_url ?? "uploaded by the user" };
    };
    const brand = brandFor(inputs, this.cfg.skillDir, {
      subject: logo(inputs.logos.subject),
      presenting: inputs.presentingCompany.include ? logo(inputs.logos.presenting) : undefined,
    });
    fs.writeFileSync(path.join(dir, "spec.json"), JSON.stringify(spec, null, 2));
    fs.writeFileSync(path.join(dir, "brand.json"), JSON.stringify(brand, null, 2));

    this.setStage(job, "building_slides");
    const presenter = inputs.presentingCompany.include ? inputs.presentingCompany.name : undefined;
    await buildDeck(spec, brand, pptx, this.cfg.skillDir, {
      label: inputs.callToAction ? "Next step" : undefined,
      title: inputs.callToAction || "Thank you",
      subtitle: presenter ? `${presenter} for ${inputs.companyName}` : inputs.companyName,
    });

    this.setStage(job, "qa_check");
    const qa = await this.qaCheck(pptx);

    this.setStage(job, "rendering_previews");
    let pdf: string | null = null, previews: string[] = [], renderSkipped: string | null = null;
    if (!this.cfg.render) {
      renderSkipped = "Preview rendering disabled (RENDER_PREVIEWS=false)";
    } else {
      try {
        await this.python("render.py", [pptx, "--outdir", path.join(dir, "preview")], 300_000);
        pdf = "preview/deck.pdf";
        previews = fs.readdirSync(path.join(dir, "preview/slides")).filter((f) => f.endsWith(".png")).sort().map((f) => `preview/slides/${f}`);
      } catch (err) {
        // The editable PPTX is the deliverable; record the exact renderer blocker rather than failing it.
        renderSkipped = `Rendering failed: ${processError(err)}`;
      }
    }

    this.db.prepare("INSERT OR REPLACE INTO outputs (job_id, pptx_path, pdf_path, previews_json, qa_json, render_skipped) VALUES (?, ?, ?, ?, ?, ?)")
      .run(job.id, "deck.pptx", pdf, JSON.stringify(previews), JSON.stringify(qa), renderSkipped);
    this.setStage(job, "done");
  }

  /** Run the skill's qa_check.py. Exit code 1 means "errors found", which is reported, not fatal. */
  private async qaCheck(pptx: string) {
    let report: string;
    try {
      report = (await this.python("qa_check.py", [pptx], 120_000)).stdout;
    } catch (err) {
      const e = err as { code?: unknown; stdout?: string };
      if (e.code !== 1 || !e.stdout) throw new Error(`QA check could not run: ${processError(err)}`);
      report = e.stdout;
    }
    const m = report.match(/QA result: (\d+) error\(s\), (\d+) warning\(s\)/);
    if (!m) throw new Error("QA check produced no result line");
    return { errors: Number(m[1]), warnings: Number(m[2]), report };
  }

  private python(script: string, args: string[], timeout: number) {
    return exec(this.cfg.pythonBin, [path.join(this.cfg.skillDir, "scripts", script), ...args], { timeout, maxBuffer: 10 * 1024 * 1024 });
  }
}

function processError(err: unknown): string {
  const e = err as { stderr?: string; stdout?: string; message?: string };
  return (e.stderr?.trim() || e.stdout?.trim() || e.message || String(err)).slice(-1000);
}
