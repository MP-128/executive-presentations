import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { brandFor, buildDeck } from "../server/deck/buildDeck.ts";
import { loadConfig } from "../server/config.ts";
import { ProjectInputs, type DeckSpec } from "../shared/contract.ts";
import { slideCount, themeXml } from "./helpers.ts";

const { skillDir } = loadConfig();
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "ep-deck-"));
const ev = "illustrative" as const;

// One slide per supported pattern, all clearly labelled sample content.
const spec: DeckSpec = {
  title: "Sample deck",
  footer: "Sample presenter",
  slides: [
    { pattern: "cover", label: "Sample Co", title: "Labelled sample deck", subtitle: "Every builder", evidence: "synthetic" },
    { pattern: "section", number: 1, title: "Section", summary: "Summary" },
    { pattern: "agenda", title: "Agenda", items: ["One", "Two", "Three"], active: 1 },
    { pattern: "execSummary", title: "Answer first", recommendation: "Do the thing", messages: [{ head: "A", body: "a" }, { head: "B", body: "b" }], evidence: ev },
    { pattern: "bullets", title: "Points", points: ["First", "Second"] },
    { pattern: "twoColumns", title: "Two columns", left: { title: "Left", items: ["l"] }, right: { title: "Right", items: ["r"] } },
    { pattern: "processFlow", title: "Flow", steps: [{ title: "S1", body: "b1", pain: "p1" }, { title: "S2", body: "b2" }] },
    { pattern: "kpiTiles", title: "KPIs", tiles: [{ value: "[x]%", label: "Metric", note: "placeholder" }] },
    { pattern: "chartPanel", title: "Chart", source: "Source: sample", evidence: ev,
      chart: { type: "col", labels: ["A", "B", "C"], series: [{ name: "S", values: [1, 2, 3] }], highlight: 2 }, panel: { points: ["Takeaway"] } },
    { pattern: "comparisonTable", title: "Compare", source: "Source: sample", columns: ["Criterion", "X", "Y"], rows: [["Cost", { rating: 3 }, "Low"]], recommended: 1, verdict: "X" },
    { pattern: "roadmap", title: "Roadmap", periods: ["Q1", "Q2"], lanes: [{ name: "Lane", bars: [{ start: 0, end: 2, label: "Work", focus: true }] }], milestones: [{ at: 1, label: "Go" }] },
    { pattern: "riskTable", title: "Risks", source: "Source: sample", rows: [{ risk: "R", level: "High", mitigation: "M" }] },
    { pattern: "matrix2x2", title: "Matrix", xLabel: "Effort", yLabel: "Impact", quadrants: ["a", "b", "c", "d"], items: [{ label: "I", x: 0.7, y: 0.8, focus: true }] },
  ],
};

describe("buildDeck", () => {
  it("builds every supported pattern into a valid, editable PPTX", async () => {
    const out = path.join(tmp(), "deck.pptx");
    const brand = brandFor(ProjectInputs.parse({ companyName: "Sample Co", topic: "t" }), skillDir);
    const n = await buildDeck(spec, brand, out, skillDir);
    expect(n).toBe(spec.slides.length);
    const buf = fs.readFileSync(out);
    expect(await slideCount(buf)).toBe(spec.slides.length);
    expect(await themeXml(buf)).toContain('val="2F6690"'); // neutral provisional accent
  });

  it("applies user-confirmed colours to the deck theme", async () => {
    const out = path.join(tmp(), "deck.pptx");
    const inputs = ProjectInputs.parse({ companyName: "Sample Co", topic: "t", colorMode: "custom", palette: { dark: "#102030", accent: "#C0392B" } });
    const brand = brandFor(inputs, skillDir);
    expect(brand.status).toBe("user-confirmed");
    await buildDeck(spec, brand, out, skillDir);
    const theme = await themeXml(fs.readFileSync(out));
    expect(theme).toContain('<a:dk2><a:srgbClr val="102030"/>');
    expect(theme).toContain('val="C0392B"');
  });

  it("falls back to neutral when a colour mode has no confirmed palette", () => {
    const brand = brandFor(ProjectInputs.parse({ companyName: "Sample Co", topic: "t", colorMode: "subject" }), skillDir);
    expect(brand.status).toBe("provisional");
    expect(brand.statusNote).toMatch(/neutral/);
  });

  it("rejects an invalid spec before touching deck_kit", async () => {
    await expect(buildDeck({ title: "x", slides: [{ pattern: "nope" }] }, {} as never, "/dev/null", skillDir)).rejects.toThrow();
  });
});
