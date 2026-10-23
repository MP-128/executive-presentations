// Fixed mapping from a validated DeckSpec onto the vendored skill's deck_kit builders.
// The model never writes code; it only produces DeckSpec JSON (tech-stack.md §1 "Hosting gap").
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { DeckSpec, type DeckSlide, type LogoPlacement, type ProjectInputs } from "../../shared/contract.ts";

const require = createRequire(import.meta.url);

export interface BrandLogo { path: string; aspect: number; source: string }

export interface Brand {
  company: string;
  status: string;
  statusNote: string;
  colors: Record<string, { hex: string; role?: string; provenance?: string }>;
  dataSeries?: string[];
  fonts?: unknown;
  logos?: { subject?: BrandLogo; presenting?: BrandLogo; placement: LogoPlacement };
}

// Slides QA expects a source line on; without one the deck says what is missing.
const DATA_PATTERNS = new Set(["chartPanel", "comparisonTable", "riskTable"]);

/**
 * Neutral provisional palette from the skill, with user-confirmed colours layered on when a non-neutral mode is chosen.
 * `logos` are the user's confirmed choices, already resolved to files.
 */
export function brandFor(inputs: ProjectInputs, skillDir: string, logos?: Omit<NonNullable<Brand["logos"]>, "placement">): Brand {
  const base: Brand = JSON.parse(fs.readFileSync(path.join(skillDir, "assets/provisional-palette.json"), "utf8"));
  const brand: Brand = { ...base, company: inputs.companyName, colors: { ...base.colors } };
  if (logos?.subject || logos?.presenting) brand.logos = { ...logos, placement: inputs.logos.placement };
  if (inputs.colorMode === "neutral" || !inputs.palette) {
    if (inputs.colorMode !== "neutral") brand.statusNote = `No confirmed colours for mode "${inputs.colorMode}"; neutral palette used.`;
    return brand;
  }
  const strip = (h: string) => h.replace(/^#/, "").toUpperCase();
  const { dark, accent, accent2 } = inputs.palette;
  brand.status = "user-confirmed";
  brand.statusNote = `Colours supplied by the user (mode: ${inputs.colorMode}).`;
  brand.colors.dark = { hex: strip(dark), provenance: "user" };
  brand.colors.accent = { hex: strip(accent), provenance: "user" };
  if (accent2) brand.colors.accent2 = { hex: strip(accent2), provenance: "user" };
  brand.dataSeries = [strip(accent), strip(dark), strip(accent2 ?? base.colors.accent2.hex), base.colors.muted.hex];
  return brand;
}

export interface Closing { label?: string; title: string; subtitle?: string }

/**
 * Build and save the .pptx. Returns the number of slides written. With logo placement "titleAndClosing",
 * `closing` is appended as a dark closing slide that carries the logos.
 */
export async function buildDeck(specInput: unknown, brand: Brand, outFile: string, skillDir: string, closing?: Closing): Promise<number> {
  const spec = DeckSpec.parse(specInput);
  const kit = require(path.join(skillDir, "scripts/deck_kit.js"));
  const deck = kit.createDeck(brand, { title: spec.title, author: brand.company, footer: spec.footer });
  const { G } = kit;

  for (const s of spec.slides) addSlide(deck, G, s);
  if (closing && brand.logos?.placement === "titleAndClosing") deck.closing(closing);

  await deck.save(outFile);
  return deck.count();
}

// deck_kit is untyped JS; keep the `any` surface confined to this function.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addSlide(deck: any, G: any, s: DeckSlide) {
  switch (s.pattern) {
    case "cover":
      return deck.cover(s);
    case "section":
      return deck.section(s);
  }
  const source = s.source ?? (DATA_PATTERNS.has(s.pattern) ? "Source: [add source]" : undefined);
  const frame = deck.content({ kicker: s.kicker, title: s.title, subtitle: s.subtitle, source, evidence: s.evidence, notes: s.notes });
  switch (s.pattern) {
    case "agenda":
      return deck.agenda(frame, { items: s.items, active: s.active });
    case "execSummary":
      return deck.execSummary(frame, { recommendation: s.recommendation, messages: s.messages });
    case "bullets":
      // 2–6 parallel points read better as a card grid; longer lists stay a panel
      if (s.points.length >= 2 && s.points.length <= 6) return deck.cards(frame, { points: s.points });
      return deck.takeaways(frame, { title: s.panelTitle ?? "Key points", points: s.points,
        x: G.mx, y: frame._top, w: G.cw, h: G.bodyBottom - frame._top });
    case "twoColumns":
      return deck.twoColumns(frame, { left: s.left, right: s.right });
    case "processFlow":
      return deck.processFlow(frame, { steps: s.steps });
    case "kpiTiles":
      return deck.kpiTiles(frame, { tiles: s.tiles });
    case "chartPanel":
      return deck.chartPanel(frame, { chart: s.chart, panel: s.panel });
    case "comparisonTable":
      return deck.comparisonTable(frame, { columns: s.columns, rows: s.rows, recommended: s.recommended, verdict: s.verdict });
    case "roadmap":
      return deck.roadmap(frame, { periods: s.periods, lanes: s.lanes, milestones: s.milestones });
    case "riskTable":
      return deck.riskTable(frame, { rows: s.rows });
    case "matrix2x2":
      return deck.matrix2x2(frame, { xLabel: s.xLabel, yLabel: s.yLabel, quadrants: s.quadrants, items: s.items, panel: s.panel });
  }
}
