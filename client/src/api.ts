// Thin typed client for the Express API (tech-stack.md §6).
import type { BrandLookup, JobView, LogoAsset, Plan, PlanVersion, ProjectInputs } from "../../shared/contract.ts";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** A Blob body (a file) is sent as-is with its own type; anything else is sent as JSON. */
async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  const raw = body instanceof Blob;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": raw ? body.type || "application/octet-stream" : "application/json" },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const issue = data.issues?.[0]?.message;
    throw new ApiError(res.status, issue ?? data.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

type EditablePlan = Omit<Plan, "generatedBy">;
/** PATCH merges; `null` clears an optional field on the server. */
type InputsPatch = { [K in keyof ProjectInputs]?: ProjectInputs[K] | null };

export const api = {
  createProject: (inputs: ProjectInputs) => call<{ projectId: string }>("POST", "/api/projects", inputs),
  getProject: (id: string) => call<{ projectId: string; inputs: ProjectInputs }>("GET", `/api/projects/${id}`),
  updateProject: (id: string, inputs: InputsPatch) => call<{ inputs: ProjectInputs }>("PATCH", `/api/projects/${id}`, inputs),
  requestPlan: (id: string) => call<{ jobId: string }>("POST", `/api/projects/${id}/plan`),
  listPlans: (id: string) => call<{ plans: PlanVersion[] }>("GET", `/api/projects/${id}/plans`),
  savePlan: (id: string, baseVersion: number, plan: EditablePlan) =>
    call<PlanVersion>("PUT", `/api/projects/${id}/plans/${baseVersion}`, { plan }),
  approvePlan: (id: string, version: number) => call<PlanVersion>("POST", `/api/projects/${id}/plans/${version}/approve`),
  generate: (id: string, planVersion: number) => call<{ jobId: string }>("POST", `/api/projects/${id}/generate`, { planVersion }),
  getJob: (id: string) => call<JobView>("GET", `/api/jobs/${id}`),
  retryJob: (id: string) => call<JobView>("POST", `/api/jobs/${id}/retry`),
  fileUrl: (jobId: string, file: string) => `/api/jobs/${jobId}/files/${file}`,
  uploadLogo: (file: File) => call<LogoAsset>("POST", "/api/uploads/logo", file),
  lookupBrand: (website: string) => call<BrandLookup>("POST", "/api/brand/lookup", { website }),
  logoUrl: (id: string) => `/api/uploads/${id}`,
};
