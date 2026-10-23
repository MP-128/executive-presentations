// Model boundary. ClaudeLlm (claude.ts) calls the Anthropic API (claude-opus-5-5) with the
// skill's SKILL.md + references as system prompt and returns the same validated shapes.
// When ANTHROPIC_API_KEY is not set, StubLlm produces deterministic, clearly labelled placeholder
// content: it never invents facts, and every slide it writes carries the "synthetic" evidence tag.
import type { DeckSlide, DeckSpec, Plan, PlanSlide, ProjectInputs } from "../shared/contract.ts";

export interface Llm {
  readonly name: string;
  /** Propose a storyline (blank input) or structure the user's storyline into a slide plan. */
  proposePlan(inputs: ProjectInputs): Promise<Plan>;
  /** Turn an approved plan into a DeckSpec for buildDeck. */
  writeDeckSpec(plan: Plan, inputs: ProjectInputs): Promise<DeckSpec>;
}

const TBD = "[Add supporting point]";

export class StubLlm implements Llm {
  readonly name = "stub";

  async proposePlan(inputs: ProjectInputs): Promise<Plan> {
    const lines = inputs.storyline
      .split("\n")
      .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
      .filter(Boolean);
    const max = Math.max(1, inputs.slideCount - 1); // the cover is added at generation time
    if (lines.length) {
      // Preserve the user's narrative; the only addition is a labelled suggestion.
      const slides = lines.map((title) => slide(title, "bullets", "user", "user-provided"));
      if (!lines.some((l) => /summary/i.test(l))) {
        slides.unshift(slide("Executive summary", "execSummary", "suggested", "illustrative",
          "Suggested: lead with the answer so the audience hears the conclusion first."));
      }
      return { storyline: inputs.storyline, slides: slides.slice(0, max), generatedBy: this.name };
    }
    const goal = inputs.objective || inputs.topic;
    const slides = [
      slide("Executive summary", "execSummary", "suggested", "illustrative"),
      slide(`Why this matters for ${inputs.companyName}`, "bullets", "suggested", "illustrative"),
      slide("Current situation", "bullets", "suggested", "illustrative"),
      slide("Options considered", "twoColumns", "suggested", "illustrative"),
      slide("Recommendation", "bullets", "suggested", "illustrative"),
      slide(inputs.callToAction ? `Decision requested: ${inputs.callToAction}` : "Next steps", "processFlow", "suggested", "illustrative"),
    ].slice(0, max);
    const storyline = [
      `Proposed storyline for ${inputs.companyName}: ${goal}.`,
      inputs.audience ? `Audience: ${inputs.audience}.` : "",
      "Answer first, then context, options, recommendation and the decision requested.",
    ].filter(Boolean).join(" ");
    return { storyline, slides, generatedBy: this.name };
  }

  async writeDeckSpec(plan: Plan, inputs: ProjectInputs): Promise<DeckSpec> {
    const presenter = inputs.presentingCompany.include ? inputs.presentingCompany.name : undefined;
    const notes = "Placeholder content written by the stub model, not by Claude.";
    const slides: DeckSlide[] = [{
      pattern: "cover",
      label: inputs.companyName,
      title: inputs.topic || plan.slides[0].title,
      subtitle: inputs.objective || undefined,
      presenter,
      date: new Date().toISOString().slice(0, 10),
      evidence: "synthetic",
      notes,
    }];

    plan.slides.forEach((p, i) => {
      const points = p.points.length ? p.points : [TBD];
      const frame = {
        kicker: inputs.companyName, title: p.title, subtitle: p.takeaway || undefined,
        source: p.sources.length ? `Source: ${p.sources.join("; ")}` : undefined, evidence: "synthetic" as const, notes,
      };
      switch (p.pattern) {
        case "execSummary": {
          const rest = plan.slides.slice(i + 1, i + 5);
          slides.push({ ...frame, pattern: "execSummary",
            recommendation: inputs.callToAction || undefined,
            messages: rest.length ? rest.map((r) => ({ head: r.title, body: r.takeaway || TBD })) : [{ head: p.title, body: TBD }] });
          break;
        }
        case "twoColumns":
          slides.push({ ...frame, pattern: "twoColumns",
            left: { title: "Supporting points", items: points },
            right: { title: "Assumptions and gaps", items: p.assumptions.length ? p.assumptions : ["None recorded"] } });
          break;
        case "processFlow":
          slides.push(points.length >= 2
            ? { ...frame, pattern: "processFlow", steps: points.slice(0, 6).map((t, k) => ({ title: `Step ${k + 1}`, body: t })) }
            : { ...frame, pattern: "bullets", points });
          break;
        default:
          slides.push({ ...frame, pattern: "bullets", points });
      }
    });

    const assumptions = [...new Set(plan.slides.flatMap((p) => p.assumptions))];
    if (assumptions.length) {
      slides.push({ pattern: "twoColumns", kicker: inputs.companyName, title: "Assumptions and open questions", evidence: "synthetic", notes,
        left: { title: "Assumptions", items: assumptions.slice(0, 8) },
        right: { title: "Information still needed", items: ["Source material for each claim", "Confirmed figures and dates"] } });
    }
    return { title: inputs.topic || inputs.companyName, footer: presenter, slides };
  }
}

function slide(title: string, pattern: string, origin: PlanSlide["origin"], evidence: PlanSlide["evidence"], takeaway = ""): PlanSlide {
  return {
    title,
    takeaway,
    points: ["[Add supporting point]", "[Add evidence and source]"],
    pattern,
    visual: pattern === "bullets" ? "Key points panel" : pattern,
    sources: [],
    evidence,
    assumptions: ["No source material provided; content to be confirmed"],
    origin,
  };
}
