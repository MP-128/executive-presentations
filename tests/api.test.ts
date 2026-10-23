import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { binary, setup, slideCount, sofficeAvailable } from "./helpers.ts";
import { StubLlm } from "../server/llm.ts";
import { Worker } from "../server/worker.ts";
import type { Plan, ProjectInputs } from "../shared/contract.ts";

const base = { companyName: "Sample Co (labelled sample)", objective: "Decide whether to pilot an AI support assistant", audience: "Executive team" };

async function planned(t: ReturnType<typeof setup>, inputs: object = base) {
  const { body: { projectId } } = await t.api.post("/api/projects").send(inputs).expect(201);
  const { body: { jobId } } = await t.api.post(`/api/projects/${projectId}/plan`).expect(202);
  await t.worker.tick();
  const { body: job } = await t.api.get(`/api/jobs/${jobId}`).expect(200);
  expect(job).toMatchObject({ type: "plan", status: "succeeded", planVersion: 1 });
  const { body: { plans } } = await t.api.get(`/api/projects/${projectId}/plans`).expect(200);
  return { projectId, plan: plans[0].plan as Plan };
}

describe("projects", () => {
  it("rejects a company name with no storyline, topic or objective", async () => {
    const t = setup();
    const res = await t.api.post("/api/projects").send({ companyName: "Sample Co" }).expect(400);
    expect(res.body.issues[0].message).toMatch(/storyline/);
  });

  it("PATCH merges inputs and keeps them valid", async () => {
    const t = setup();
    const { body: { projectId } } = await t.api.post("/api/projects").send(base).expect(201);
    const { body } = await t.api.patch(`/api/projects/${projectId}`).send({ audience: "Board" }).expect(200);
    expect(body.inputs).toMatchObject({ companyName: base.companyName, audience: "Board", colorMode: "neutral" });
    await t.api.patch(`/api/projects/${projectId}`).send({ companyName: "" }).expect(400);
  });

  it("PATCH with null clears an optional field", async () => {
    const t = setup();
    const { body: { projectId } } = await t.api.post("/api/projects").send({ ...base, companyWebsite: "https://example.com" }).expect(201);
    const { body } = await t.api.patch(`/api/projects/${projectId}`).send({ companyWebsite: null }).expect(200);
    expect(body.inputs).not.toHaveProperty("companyWebsite");
  });
});

describe("storyline planning", () => {
  it("proposes a storyline and plan when the storyline is blank", async () => {
    const { plan } = await planned(setup());
    expect(plan.generatedBy).toBe("stub");
    expect(plan.storyline).toContain(base.objective);
    expect(plan.slides.length).toBeGreaterThan(2);
    expect(plan.slides.every((s) => s.origin === "suggested")).toBe(true);
  });

  it("preserves a supplied storyline and labels additions as suggestions", async () => {
    const storyline = "1. The support backlog is growing\n2. Three options we considered\n- Recommendation: pilot in Q1";
    const { plan } = await planned(setup(), { ...base, storyline });
    expect(plan.storyline).toBe(storyline);
    const user = plan.slides.filter((s) => s.origin === "user").map((s) => s.title);
    expect(user).toEqual(["The support backlog is growing", "Three options we considered", "Recommendation: pilot in Q1"]);
    expect(plan.slides[0]).toMatchObject({ title: "Executive summary", origin: "suggested" });
  });
});

describe("plan approval and generation", () => {
  it("only generates from the latest approved plan version, then serves a real PPTX", async () => {
    const t = setup();
    const { projectId, plan } = await planned(t);

    // Not approved yet
    await t.api.post(`/api/projects/${projectId}/generate`).send({ planVersion: 1 }).expect(409);
    await t.api.post(`/api/projects/${projectId}/plans/1/approve`).expect(200);

    // Editing an approved plan creates v2, which needs its own approval
    const edited = { storyline: plan.storyline, slides: plan.slides.slice(0, 3).map((s, i) => (i === 1 ? { ...s, title: "Edited by user", points: ["User point A", "User point B"] } : s)) };
    const { body: v2 } = await t.api.put(`/api/projects/${projectId}/plans/1`).send({ plan: edited }).expect(201);
    expect(v2).toMatchObject({ version: 2, createdBy: "user", approvedAt: null });
    await t.api.post(`/api/projects/${projectId}/generate`).send({ planVersion: 1 }).expect(409);
    await t.api.post(`/api/projects/${projectId}/generate`).send({ planVersion: 2 }).expect(409);
    await t.api.post(`/api/projects/${projectId}/plans/2/approve`).expect(200);

    const { body: { jobId } } = await t.api.post(`/api/projects/${projectId}/generate`).send({ planVersion: 2 }).expect(202);
    // Duplicate submission while the job is active is refused
    await t.api.post(`/api/projects/${projectId}/generate`).send({ planVersion: 2 }).expect(409);
    await t.worker.tick();

    const { body: job } = await t.api.get(`/api/jobs/${jobId}`).expect(200);
    expect(job).toMatchObject({ type: "generate", status: "succeeded", stage: "done", planVersion: 2, error: null });
    expect(job.outputs.files).toEqual(["deck.pptx"]);
    expect(job.outputs.qa).toMatchObject({ errors: expect.any(Number), warnings: expect.any(Number) });
    expect(job.outputs.renderSkipped).toMatch(/disabled/);

    // Saved locally, isolated per job
    const onDisk = path.join(t.dataDir, "jobs", jobId, "deck.pptx");
    expect(fs.existsSync(onDisk)).toBe(true);

    const res = await t.api.get(`/api/jobs/${jobId}/files/deck.pptx`).buffer(true).parse(binary).expect(200);
    expect(res.headers["content-disposition"]).toContain("deck.pptx");
    // cover + 3 planned slides + assumptions slide
    expect(await slideCount(res.body)).toBe(5);
    const spec = JSON.parse(fs.readFileSync(path.join(t.dataDir, "jobs", jobId, "spec.json"), "utf8"));
    expect(spec.slides.map((s: { title: string }) => s.title)).toContain("Edited by user");
  });

  it("does not serve files outside the job's outputs", async () => {
    const t = setup();
    const { projectId } = await planned(t);
    await t.api.post(`/api/projects/${projectId}/plans/1/approve`).expect(200);
    const { body: { jobId } } = await t.api.post(`/api/projects/${projectId}/generate`).send({ planVersion: 1 }).expect(202);
    await t.worker.tick();
    await t.api.get(`/api/jobs/${jobId}/files/spec.json`).expect(404);
    await t.api.get(`/api/jobs/${jobId}/files/..%2F..%2Fapp.db`).expect(404);
  });
});

describe("job failures, retries and restarts", () => {
  it("records a useful error and succeeds on retry", async () => {
    class FlakyLlm extends StubLlm {
      calls = 0;
      override async writeDeckSpec(plan: Plan, inputs: ProjectInputs) {
        if (this.calls++ === 0) throw new Error("Model provider unavailable (simulated)");
        return super.writeDeckSpec(plan, inputs);
      }
    }
    const t = setup({ llm: new FlakyLlm() });
    const { projectId } = await planned(t);
    await t.api.post(`/api/projects/${projectId}/plans/1/approve`).expect(200);
    const { body: { jobId } } = await t.api.post(`/api/projects/${projectId}/generate`).send({ planVersion: 1 }).expect(202);
    await t.worker.tick();

    const { body: failed } = await t.api.get(`/api/jobs/${jobId}`).expect(200);
    expect(failed).toMatchObject({ status: "failed", stage: "writing_content", error: "Model provider unavailable (simulated)", attempt: 1 });

    await t.api.post(`/api/jobs/${jobId}/retry`).expect(202);
    await t.worker.tick();
    const { body: retried } = await t.api.get(`/api/jobs/${jobId}`).expect(200);
    expect(retried).toMatchObject({ status: "succeeded", attempt: 2, error: null });
    await t.api.post(`/api/jobs/${jobId}/retry`).expect(409); // only failed jobs
  });

  it("marks jobs interrupted by a restart as failed so they can be retried", async () => {
    const t = setup();
    const { body: { projectId } } = await t.api.post("/api/projects").send(base).expect(201);
    t.db.prepare("INSERT INTO jobs (id, project_id, type, status, stage, created_at) VALUES ('j1', ?, 'plan', 'running', 'planning', ?)")
      .run(projectId, new Date().toISOString());
    const restarted = new Worker(t.db, t.cfg, new StubLlm());
    restarted.start(60_000);
    restarted.stop();
    const { body } = await t.api.get("/api/jobs/j1").expect(200);
    expect(body).toMatchObject({ status: "failed", error: expect.stringMatching(/restart/) });
  });

  it("enforces the daily job limit", async () => {
    const t = setup({ cfg: { dailyJobLimit: 1 } });
    await planned(t);
    const { body: { projectId } } = await t.api.post("/api/projects").send(base).expect(201);
    await t.api.post(`/api/projects/${projectId}/plan`).expect(429);
  });
});

describe.skipIf(!sofficeAvailable)("rendering (LibreOffice)", () => {
  it("produces a PDF and one PNG preview per slide", async () => {
    const t = setup({ cfg: { render: true } });
    const { projectId } = await planned(t);
    await t.api.post(`/api/projects/${projectId}/plans/1/approve`).expect(200);
    const { body: { jobId } } = await t.api.post(`/api/projects/${projectId}/generate`).send({ planVersion: 1 }).expect(202);
    await t.worker.tick();
    const { body: job } = await t.api.get(`/api/jobs/${jobId}`).expect(200);
    expect(job.status).toBe("succeeded");
    expect(job.outputs.renderSkipped).toBeNull();
    const pngs = job.outputs.files.filter((f: string) => f.endsWith(".png"));
    expect(job.outputs.files).toContain("preview/deck.pdf");
    const pptx = await t.api.get(`/api/jobs/${jobId}/files/deck.pptx`).buffer(true).parse(binary).expect(200);
    expect(pngs.length).toBe(await slideCount(pptx.body));
    const png = await t.api.get(`/api/jobs/${jobId}/files/${pngs[0]}`).expect(200);
    expect(png.headers["content-type"]).toBe("image/png");
  }, 180_000);
});
