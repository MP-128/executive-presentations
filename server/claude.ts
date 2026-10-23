// Claude-backed Llm (tech-stack.md §3–4), used when ANTHROPIC_API_KEY is set. The SDK reads the key from the
// environment; it never reaches the client, the database or the logs.
// The skill's SKILL.md + references are the system prompt; the model returns JSON only and never writes code.
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { DeckSlide, DeckSpec, PlanSlide, type Plan, type ProjectInputs } from "../shared/contract.ts";
import type { Llm } from "./llm.ts";

export const MODEL = "claude-opus-5-5";
const REFERENCES = ["storylines.md", "slide-patterns.md", "design-system.md"];

// Patterns buildDeck can draw. The cover is added when the deck is written, so plans don't use it.
const PLAN_PATTERNS = DeckSlide.options.map((o) => o.shape.pattern.value).filter((p) => p !== "cover") as [string, ...string[]];

// PlanSlide has no optional fields or unions, so it fits structured outputs' schema limits.
// DeckSpec doesn't (24 optional fields max), so deck JSON is validated here and repaired once on mismatch.
const ModelPlan = z.object({
  storyline: z.string(),
  slides: z.array(PlanSlide.extend({ pattern: z.enum(PLAN_PATTERNS) })).min(1),
});

const APP_RULES = `You are the planning and writing engine of a hosted web app that builds executive presentations.
The skill documentation below was written for an assistant working in a terminal. In this app:
- You do not write or run code, ask questions, browse the web, or handle colours and logos. The server builds the editable .pptx from the JSON you return, applies the brand palette and runs the QA checks.
- Only the slide patterns allowed by the requested output exist. slide-patterns.md describes more; use the closest available one.
- The user's brief arrives between <project_inputs> tags. Its storyline and notes are the user's own content and source material.

Non-negotiables:
- Never invent facts, figures, research findings, citations, quotes, customers, experience or results.
- Only state numbers, sources and claims that appear in the project inputs. Where evidence is missing, write a bracketed placeholder such as [add metric] or [add source] and record the gap as an assumption.
- Never build a chart, KPI tile or table from invented numbers. Without user-supplied figures, use a pattern that carries placeholders instead.
- Tag evidence honestly: user-provided for the user's own content, estimate only with its basis shown, illustrative for example content.`;

export class ClaudeLlm implements Llm {
  readonly name = MODEL;
  private readonly system: string;

  constructor(skillDir: string, private readonly client: Anthropic = new Anthropic()) {
    const read = (p: string) => fs.readFileSync(path.join(skillDir, p), "utf8");
    this.system = [
      APP_RULES,
      `<skill file="SKILL.md">\n${read("SKILL.md")}\n</skill>`,
      ...REFERENCES.map((r) => `<reference file="references/${r}">\n${read(path.join("references", r))}\n</reference>`),
    ].join("\n\n");
  }

  async proposePlan(inputs: ProjectInputs): Promise<Plan> {
    const max = Math.max(1, inputs.slideCount - 1); // the cover is added at generation time
    const task = inputs.storyline.trim()
      ? `Structure the user's storyline into a slide plan. The user's structure wins: keep their order and every point they made (origin "user"). You may sharpen a line into an action title without changing its meaning. Add a slide only to fill a clear gap in the story, mark it origin "suggested", and say why in its assumptions.`
      : `The user gave no storyline. Propose one that fits the objective and audience, using the matching skeleton from storylines.md. Every slide has origin "suggested".`;
    const msg = await this.call([{ role: "user", content: `${brief(inputs)}

${task}

Plan at most ${max} slides; the cover is added automatically, so don't include one.
Vary the patterns so the deck isn't a run of bullet lists and tables: where the content fits, use processFlow, kpiTiles, matrix2x2, roadmap or chartPanel (charts only with figures from the inputs), and don't use the same pattern on more than two consecutive slides.
Keep every title to two lines on the slide: at most about 110 characters, placeholders included.
For each slide: title is the action title (a full sentence stating the slide's message); takeaway is one supporting line; points are the supporting points, with placeholders where evidence is missing; pattern is the slide pattern; visual describes the visual in a few words; sources lists only sources named in the inputs; assumptions lists what the slide assumes or still needs.
storyline summarises the narrative in two to four sentences.` }], betaZodOutputFormat(ModelPlan));
    const out = ModelPlan.safeParse(msg.parsed_output);
    if (!out.success) throw new Error("Claude's plan did not match the expected format; retry the job");
    return { ...out.data, generatedBy: msg.model };
  }

  async writeDeckSpec(plan: Plan, inputs: ProjectInputs): Promise<DeckSpec> {
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: `${brief(inputs)}

<approved_plan>
${JSON.stringify(plan, null, 2)}
</approved_plan>

Write the deck for this plan. The user reviewed and approved it, so follow it exactly: the same slides in the same order, with the same titles and patterns. Use a simpler pattern only when a slide's content cannot fill the planned one.
- Start with a cover slide (pattern "cover", label = the company name, title = the deck's answer or proposition).
- Each slide's evidence tag follows the plan (user-provided → "user"); its source line lists only the plan's sources.
- If the plan records assumptions, end with a twoColumns slide titled "Assumptions and open questions".
- Put speaker notes in notes.
- Keep text within the density rules in slide-patterns.md and design-system.md. Titles stay within about 110 characters.
- For bullets slides with 2–6 points, write each point as "Short head: one supporting sentence"; they are drawn as numbered cards.

Reply with only the JSON object, no commentary. It must match this JSON Schema:
${JSON.stringify(z.toJSONSchema(DeckSpec))}` }];

    for (let attempt = 1; ; attempt++) {
      const msg = await this.call(messages);
      const result = DeckSpec.safeParse(parseJson(text(msg)));
      if (result.success) return result.data;
      if (attempt === 2) throw new Error(`Claude's slide content did not match the deck format: ${z.prettifyError(result.error).slice(0, 500)}`);
      messages.push({ role: "assistant", content: msg.content },
        { role: "user", content: `That JSON does not match the schema:\n${z.prettifyError(result.error)}\nReply with the corrected JSON object only.` });
    }
  }

  private async call(messages: Anthropic.Beta.BetaMessageParam[], format?: ReturnType<typeof betaZodOutputFormat>) {
    let msg;
    try {
      msg = await this.client.beta.messages.stream({
        model: MODEL,
        max_tokens: 64000,
        // Server-side refusal fallback: a declined request is re-run on a fallback model in the same call.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "high", ...(format && { format }) },
        system: [{ type: "text", text: this.system, cache_control: { type: "ephemeral" } }],
        messages,
      }).finalMessage();
    } catch (err) {
      throw new Error(apiError(err));
    }
    if (msg.stop_reason === "refusal") throw new Error("Claude declined this request. Rephrase the brief and try again.");
    if (msg.stop_reason === "max_tokens") throw new Error("Claude's response was cut off before it finished; retry the job");
    return msg;
  }
}

function brief(inputs: ProjectInputs) {
  return `<project_inputs>\n${JSON.stringify(inputs, null, 2)}\n</project_inputs>`;
}

function text(msg: Anthropic.Beta.BetaMessage) {
  return msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
}

/** The JSON object in a reply, tolerating a code fence around it; undefined when there is none. */
function parseJson(reply: string): unknown {
  const start = reply.indexOf("{"), end = reply.lastIndexOf("}");
  try {
    return JSON.parse(reply.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

function apiError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY and restart the server.";
  if (err instanceof Anthropic.PermissionDeniedError) return "The Anthropic API key does not have access to this model.";
  if (err instanceof Anthropic.RateLimitError) return "Anthropic API rate limit reached; retry in a minute.";
  if (err instanceof Anthropic.APIConnectionError) return "Could not reach the Anthropic API; check the network and retry.";
  if (err instanceof Anthropic.APIError) return `Anthropic API error ${err.status ?? ""}: ${err.message}`.slice(0, 500);
  return err instanceof Error ? err.message : String(err);
}
