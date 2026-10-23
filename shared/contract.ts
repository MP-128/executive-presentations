// Shared API + data contract (tech-stack.md §5–6). Used by the server now and the client later.
import { z } from "zod";

const hex = z.string().regex(/^#?[0-9a-fA-F]{6}$/, "6-digit hex colour");

// ---------- logos ----------
export const LogoPlacement = z.enum(["title", "titleAndClosing", "footer"]);
export type LogoPlacement = z.infer<typeof LogoPlacement>;

export const LogoAsset = z.object({
  id: z.string(),
  width: z.number(),
  height: z.number(),
  sourceUrl: z.string().nullable(), // null when uploaded by the user
  label: z.string(), // where it was found, e.g. "Site logo (header image)"
});
export type LogoAsset = z.infer<typeof LogoAsset>;

export const BrandLookup = z.object({
  website: z.string(), // final URL after redirects
  pageTitle: z.string().nullable(),
  candidates: z.array(LogoAsset),
  skipped: z.array(z.string()), // candidates that couldn't be used, with the reason
});
export type BrandLookup = z.infer<typeof BrandLookup>;

// ---------- project inputs (setup form) ----------
export const ProjectInputs = z
  .object({
    companyName: z.string().trim().min(1, "Company name is required"),
    companyWebsite: z.string().url().optional(),
    colorMode: z.enum(["subject", "presenting", "neutral", "custom"]).default("neutral"),
    // User-confirmed colours; required for any mode other than neutral to take effect.
    palette: z.object({ dark: hex, accent: hex, accent2: hex.optional() }).optional(),
    presentingCompany: z
      .object({ include: z.boolean().default(false), name: z.string().optional(), website: z.string().url().optional() })
      .default({ include: false }),
    // Upload ids from POST /api/uploads/logo or a confirmed /api/brand/lookup candidate. Never set without the user's choice.
    logos: z
      .object({
        subject: z.string().optional(),
        presenting: z.string().optional(), // used only while presentingCompany.include is on
        placement: LogoPlacement.default("title"),
      })
      .default({ placement: "title" }),
    storyline: z.string().default(""),
    topic: z.string().default(""),
    objective: z.string().default(""),
    audience: z.string().default(""),
    callToAction: z.string().default(""),
    slideCount: z.number().int().min(3).max(30).default(8),
    notes: z.string().default(""),
  })
  // blueprint §4E: a company name alone is not enough to determine the presentation's purpose
  .refine((v) => v.storyline.trim() || v.topic.trim() || v.objective.trim(), {
    message: "Provide a proposed storyline, or at least a topic or objective",
    path: ["storyline"],
  });
export type ProjectInputs = z.infer<typeof ProjectInputs>;

// ---------- slide plan ----------
export const Evidence = z.enum(["verified", "user-provided", "estimate", "illustrative"]);

export const PlanSlide = z.object({
  title: z.string().min(1),
  takeaway: z.string(),
  points: z.array(z.string()),
  pattern: z.string(), // a deck_kit builder name, see DeckSlide below
  visual: z.string(),
  sources: z.array(z.string()),
  evidence: Evidence,
  assumptions: z.array(z.string()),
  origin: z.enum(["user", "suggested"]),
});
export type PlanSlide = z.infer<typeof PlanSlide>;

export const Plan = z.object({
  storyline: z.string(),
  slides: z.array(PlanSlide).min(1),
  generatedBy: z.string(), // model id, "stub", or "user"
});
export type Plan = z.infer<typeof Plan>;

export const PlanVersion = z.object({
  version: z.number().int(),
  plan: Plan,
  createdBy: z.enum(["model", "user"]),
  createdAt: z.string(),
  approvedAt: z.string().nullable(),
});
export type PlanVersion = z.infer<typeof PlanVersion>;

// ---------- deck spec (model output → buildDeck) ----------
const frame = {
  kicker: z.string().optional(),
  title: z.string(),
  subtitle: z.string().optional(),
  source: z.string().optional(),
  evidence: z.enum(["verified", "user", "estimate", "illustrative", "synthetic"]).optional(),
  notes: z.string().optional(),
};
const points = z.array(z.string()).min(1);

export const DeckSlide = z.discriminatedUnion("pattern", [
  z.object({ pattern: z.literal("cover"), label: z.string().optional(), title: z.string(), subtitle: z.string().optional(),
    presenter: z.string().optional(), date: z.string().optional(), evidence: frame.evidence, notes: z.string().optional() }),
  z.object({ pattern: z.literal("section"), number: z.number().optional(), title: z.string(), summary: z.string().optional(), notes: z.string().optional() }),
  z.object({ pattern: z.literal("agenda"), ...frame, items: points, active: z.number().optional() }),
  z.object({ pattern: z.literal("execSummary"), ...frame, recommendation: z.string().optional(),
    messages: z.array(z.object({ head: z.string(), body: z.string() })).min(1).max(5) }),
  z.object({ pattern: z.literal("bullets"), ...frame, panelTitle: z.string().optional(), points }),
  z.object({ pattern: z.literal("twoColumns"), ...frame,
    left: z.object({ title: z.string(), items: points }), right: z.object({ title: z.string(), items: points }) }),
  z.object({ pattern: z.literal("processFlow"), ...frame,
    steps: z.array(z.object({ title: z.string(), body: z.string(), pain: z.string().optional(), focus: z.boolean().optional() })).min(2).max(6) }),
  z.object({ pattern: z.literal("kpiTiles"), ...frame,
    tiles: z.array(z.object({ value: z.string(), label: z.string(), note: z.string().optional() })).min(1).max(5) }),
  z.object({ pattern: z.literal("chartPanel"), ...frame,
    chart: z.object({ type: z.enum(["bar", "col", "line", "stacked"]), title: z.string().optional(), unit: z.string().optional(),
      labels: z.array(z.string()).min(1), series: z.array(z.object({ name: z.string(), values: z.array(z.number()) })).min(1),
      highlight: z.number().optional(), valueFormat: z.string().optional() }),
    panel: z.object({ title: z.string().optional(), points: z.array(z.string()), callout: z.object({ value: z.string(), label: z.string() }).optional() }).optional() }),
  z.object({ pattern: z.literal("comparisonTable"), ...frame, columns: z.array(z.string()).min(2),
    rows: z.array(z.array(z.union([z.string(), z.object({ text: z.string().optional(), rating: z.number().min(0).max(4).optional() })]))).min(1),
    recommended: z.number().optional(), verdict: z.string().optional() }),
  z.object({ pattern: z.literal("roadmap"), ...frame, periods: z.array(z.string()).min(1),
    lanes: z.array(z.object({ name: z.string(), bars: z.array(z.object({ start: z.number(), end: z.number(), label: z.string(), focus: z.boolean().optional() })) })).min(1),
    milestones: z.array(z.object({ at: z.number(), label: z.string() })).optional() }),
  z.object({ pattern: z.literal("riskTable"), ...frame,
    rows: z.array(z.object({ risk: z.string(), level: z.enum(["High", "Med", "Low"]), mitigation: z.string() })).min(1) }),
  z.object({ pattern: z.literal("matrix2x2"), ...frame, xLabel: z.string(), yLabel: z.string(), quadrants: z.array(z.string()).max(4).optional(),
    items: z.array(z.object({ label: z.string(), x: z.number().min(0).max(1), y: z.number().min(0).max(1), focus: z.boolean().optional() })).min(1),
    panel: z.object({ title: z.string().optional(), points: z.array(z.string()) }).optional() }),
]);
export type DeckSlide = z.infer<typeof DeckSlide>;

export const DeckSpec = z.object({
  title: z.string(),
  footer: z.string().optional(),
  slides: z.array(DeckSlide).min(1),
});
export type DeckSpec = z.infer<typeof DeckSpec>;

// ---------- jobs ----------
export const JobType = z.enum(["plan", "generate"]);
export const JobStatus = z.enum(["queued", "running", "succeeded", "failed"]);
// Real generation stages (tech-stack.md §6); no percentages.
export const GenerateStage = z.enum(["writing_content", "building_slides", "qa_check", "rendering_previews", "done"]);

export const JobView = z.object({
  id: z.string(),
  projectId: z.string(),
  type: JobType,
  status: JobStatus,
  stage: z.string().nullable(),
  error: z.string().nullable(),
  attempt: z.number(),
  planVersion: z.number().nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  outputs: z
    .object({
      files: z.array(z.string()), // relative paths for GET /api/jobs/:id/files/<path>
      qa: z.object({ errors: z.number(), warnings: z.number(), report: z.string() }).nullable(),
      renderSkipped: z.string().nullable(),
    })
    .nullable(),
});
export type JobView = z.infer<typeof JobView>;

// ---------- request bodies ----------
export const SavePlanBody = z.object({ plan: Plan.omit({ generatedBy: true }) });
export const GenerateBody = z.object({ planVersion: z.number().int() });
export const BrandLookupBody = z.object({ website: z.string().url() });
