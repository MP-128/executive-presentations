# Slide pattern library

Each pattern lists:
- **Use when**: the job the slide does.
- **Anatomy**: geometry on the 13.333 × 7.5 in canvas (see `design-system.md`).
- **Rules**: content limits.
- **Refs**: reference deck pages, keyed as in `reference-deck-analysis.md`.
- **Build**: the `scripts/deck_kit.js` builder, or how to compose it.

All patterns sit inside `deck.content({kicker, title, subtitle, source, evidence})` unless marked *(dark)*. Content runs from y≈1.72 in (1.95 with a subtitle) to 6.72 in, x 0.6–12.73 in.

## A. Openers and navigation

### A1 Cover *(dark)*
- **Use when:** first slide.
- **Anatomy:** logo top-left (only if supplied or official), uppercase label at y 2.35, headline 26–38 pt over ≤3 lines, subtitle 16 pt, hairline at y 6.55, presenter · audience | date beneath.
- **Rules:**
  - The headline states the answer or proposition, not just the topic.
  - Evidence tag top-right if content is synthetic or illustrative.
- **Refs:** ACN p1, MCK p1.
- **Build:** `deck.cover()`.

### A2 Executive summary: recommendation + numbered messages
- **Use when:** slide 2 of nearly every type.
- **Anatomy:** dark recommendation band (full width, ~1.0 in), then 3–4 rows: numbered circle | bold message (3.9 in) | evidence sentence (rest).
- **Rules:**
  - Messages are parallel full sentences.
  - Each message maps to a later section, and that section's slides reuse its wording.
- **Refs:** MCK p4–6 (numbered pyramid), BCG p3 (labelled rows), ACN p4 (3-pillar thesis).
- **Build:** `deck.execSummary()`.

### A3 Agenda / storyline map with active state
- **Use when:** decks of more than 10 slides. Re-show it before each section with the active item highlighted.
- **Anatomy:** 3–5 numbered items, the active one in the accent colour and bold, the others muted.
- **Rules:** ≤5 items. Item names match the section-divider titles.
- **Refs:** SFDC p6/20/27, MCK tab bar, ADBE p4.
- **Build:** `deck.agenda({items, active})`.

### A4 Section divider with message title *(dark)*
- **Use when:** to open a section in a longer deck.
- **Anatomy:** large section number, a title that states the section's key message, one-line summary.
- **Rules:** never just a topic word. Skip dividers in decks under ~10 slides.
- **Refs:** MCK p7/11/18 (message as title), SFDC p7, ADBE p5/15.
- **Build:** `deck.section()`.

## B. Evidence

### B1 Chart + takeaway panel (workhorse)
- **Use when:** one claim proven by one quantitative exhibit.
- **Anatomy:**
  - Chart ~7.9 in wide at left, with a chart title (what) and a unit line (how measured, plus colour key).
  - Tinted "So what" panel ~3.9 in at right with an accent edge bar.
  - Optional big-number callout, then 2–4 bullets that add drivers or implications, not restatements.
- **Rules:**
  - Native chart.
  - Value axis hidden when values are labelled; no gridlines.
  - Grey context, accent focus.
  - Source line required.
- **Refs:** MCK p9/p20 (commentary + exhibit grid, two-tier header), SFDC p8/p22 (hero number beside chart), ADBE p53 (side callouts).
- **Build:** `deck.chartPanel({chart:{type, title, unit, key, labels, series, highlight, colors}, panel})`.

### B2 Single-series highlight bar
- **Use when:** ranking or comparison where one bar matters.
- **Anatomy:** the B1 frame; `highlight: i` colours one bar with the accent and the rest grey.
- **Rules:**
  - Sort descending unless the order is meaningful (time, process).
  - Horizontal bars when labels are long.
- **Refs:** BCG p8 (sorted bars, labels in bars), ACN p5 (protagonist darkest).
- **Build:** `chartPanel` with `series.length === 1` and `highlight`.

### B3 Stacked composition over time
- **Use when:** totals plus mix shift.
- **Anatomy:** stacked columns, totals labelled above, segments labelled only if large. Forecast columns marked "E" (and dashed if you post-process the XML).
- **Rules:** ≤5 segments; legend order = stack order.
- **Refs:** ADBE p17, MCK p10/p17.
- **Build:** `chart.type: "stacked"`.

### B4 Trend with target or forecast
- **Use when:** history and a path to a goal.
- **Anatomy:** line chart with direct endpoint labels; target as a separate callout; headwinds isolated in their own callout.
- **Rules:**
  - History in grey or solid, forecast distinguished.
  - Label the base year.
- **Refs:** SFDC p19, MCK p25/p29.
- **Build:** `chart.type: "line"` + `deck.takeaways` callout.

### B5 Waterfall / bridge
- **Use when:** decomposing the change between two totals (P&L, cost, value bridge).
- **Anatomy:** start and end totals in neutral grey; increases positive, decreases negative; sorted by sign then size; optional net-change row.
- **Rules:**
  - ≤9 steps.
  - Positive and negative colours used only here.
  - A table bridge is acceptable for financial audiences.
- **Refs:** MCK p26/p30, ACN p11 (table bridge).
- **Build:** stacked column with an invisible base series (`colors` with the bg colour for the base) or a native table.

### B6 Big-number KPI row / tiles
- **Use when:** 3–5 headline metrics, success measures or a recap of commitments.
- **Anatomy:** equal tiles with an accent top rule, value 28 pt bold, 1–2-line label, optional muted note.
- **Rules:**
  - ≤5 tiles.
  - Units and qualifiers consistent across tiles.
  - Footnote definitions.
- **Refs:** SFDC p34, ACN p14–16, ADBE p7, BCG p4.
- **Build:** `deck.kpiTiles()`.

### B7 Data table with highlighted column
- **Use when:** precise values, financials, before/after or original/revised.
- **Anatomy:**
  - Native table; header tint.
  - Numbers right-aligned (financial) or centred (ratings).
  - One shaded column or one highlighted cell carries the message.
- **Rules:**
  - ≤7 rows per slide.
  - Rule weight shows hierarchy (heavier rule above totals).
- **Refs:** ACN p2/p11/p17, SFDC p36, ADBE p8.
- **Build:** `deck.comparisonTable()` or `slide.addTable` directly.

### B8 Concentration / 80-20 highlight
- **Use when:** a small share drives most of the outcome.
- **Anatomy:** paired or mirrored bars with a tinted zone behind the focus categories, plus the insight sentence in a banner overlapping the chart.
- **Refs:** SFDC p13.
- **Build:** compose with `addChart` + a rectangle behind the chart (add the rectangle first) + a pill text box.

## C. Frameworks and comparisons

### C1 Prioritisation 2×2
- **Use when:** choosing among options on two criteria (value × feasibility, impact × effort).
- **Anatomy:**
  - 7.4 × ~4.4 in matrix with quadrant labels (the target quadrant tinted with the accent).
  - Dots: focus = accent and larger, others grey.
  - Axis labels with arrows; reasoning panel at right.
- **Rules:**
  - ≤8 items.
  - Labels stay within their quadrant.
  - State the scoring basis in the source line.
- **Refs:** ADBE p24 (two-vector framing), BCG p5 (horizons).
- **Build:** `deck.matrix2x2()`.

### C2 Options comparison matrix
- **Use when:** 2–4 options against 4–6 criteria, ending in a verdict.
- **Anatomy:**
  - Criteria column of 3.0 in; option columns equal.
  - Recommended column header in the accent with ★ and its column tinted.
  - Ratings as ●●●○ plus a 2–4-word qualifier.
  - Verdict line beneath.
- **Rules:** add a final "implications / imperatives" row if leaders must act (BCG p7).
- **Refs:** BCG p7, SFDC p23.
- **Build:** `deck.comparisonTable()`.

### C3 Process / workflow chevrons with pain points
- **Use when:** current-state or future-state workflow; the user problem in product/AI proposals.
- **Anatomy:** 3–6 chevrons; 1–2-line description under each; a "Where time is lost" row of warning-tinted boxes under the steps that hurt.
- **Rules:**
  - Verb-noun step names.
  - Mark the focus step with `focus: true` (accent).
- **Refs:** BCG p12 (Vision → Execution → Value), ADBE p13/p28 (stage → proof).
- **Build:** `deck.processFlow()`.

### C4 Layered architecture / stack
- **Use when:** solution architecture, operating model, platform layers.
- **Anatomy:** 3–4 horizontal bands, each with a label at left (2.4 in) and 3–5 chips; optional enabler band beneath.
- **Rules:** ≤4 layers; aligned text; one colour ramp from foundation (dark) to experience (light) or the reverse.
- **Refs:** ADBE p10, BCG p19 (simplify).
- **Build:** compose with rectangles + text boxes, or `twoColumns` for a simple version.

### C5 Three pillars / levers → outcome
- **Use when:** a thesis, strategy pillars, or levers that produce an outcome.
- **Anatomy:** 3 equal columns, each with header, accent rule, definition and 3–4 proof points; an optional full-width band beneath carrying the unifying outcome.
- **Refs:** ACN p4, BCG p6, SFDC p26 (levers → outcome rows).
- **Build:** compose; or `twoColumns` / repeated `takeaways` panels.

### C6 Templated deep-dive
- **Use when:** each element of a framework gets its own slide.
- **Anatomy:** left sidebar (~33% W, tint) holding "What it is", one big stat and a short list; right side holding the evidence (chart, table or examples).
- **Rules:** the same order on every deep-dive slide.
- **Refs:** BCG p8–10, ADBE modules p22–50.
- **Build:** `deck.takeaways` (sidebar) + chart or table at right.

## D. Plans, risks, and closing

### D1 Implementation roadmap (Gantt)
- **Use when:** phased plan, pilot → scale, project update.
- **Anatomy:**
  - Lane labels 2.6 in; period columns equal.
  - Focus bars in the accent, others in a dark neutral.
  - Milestones as dashed lines + diamonds + labels beneath.
- **Rules:**
  - ≤6 lanes and ≤8 periods.
  - Bar labels verb-led.
  - Gates state their exit criteria.
- **Refs:** ADBE p37 (roadmap), BCG p19–20.
- **Build:** `deck.roadmap()`.

### D2 Project status / RAG update
- **Use when:** project update to a steering group.
- **Anatomy:** a table of workstream | status | progress | next milestone | issue/ask. The status cell is coloured text (positive / warning / negative); colour is never the only signal, so the word goes in too.
- **Rules:** lead with overall status and decisions needed (A2).
- **Build:** `deck.riskTable` pattern, or `addTable` with status colours.

### D3 Risk register
- **Use when:** risks and mitigations.
- **Anatomy:** risk (bold) | exposure (High/Med/Low coloured text) | mitigation.
- **Rules:**
  - 3–5 risks; mitigations concrete and owned.
  - Isolate bad news rather than hide it (SFDC p19).
- **Refs:** BCG p17.
- **Build:** `deck.riskTable()`.

### D4 Success measures + risks
- **Use when:** product or AI proposals, business cases.
- **Anatomy:** B6 tiles on top (≤4) + D3 below.
- **Refs:** sample slide 7.
- **Build:** `kpiTiles` + `riskTable`.

### D5 Decision required / next steps
- **Use when:** the closing slide of executive-decision, board, proposal and case decks.
- **Anatomy:**
  - Decision statement band (dark), then 3–6 numbered verb-led next steps with owner and date.
  - Or: a two-column "Decision required" | "What happens next".
- **Refs:** BCG p20, ACN p17 (revised outlook), SFDC p34.
- **Build:** `deck.execSummary` (recommendation band + rows) or `twoColumns`.

### D6 Appendix: methodology, assumptions, sources
- **Use when:** whenever estimates, synthetic or illustrative data, or external claims appear.
- **Anatomy:** two columns (Assumptions | Sources / Definitions), or a scoring-detail table.
- **Refs:** SFDC p36, ADBE p56–61.
- **Build:** `deck.twoColumns()` or `comparisonTable`.

## E. Personal / interview specific

### E1 Career narrative timeline
- **Use when:** personal interview: relevant experience.
- **Anatomy:** horizontal timeline (roles as roadmap bars) or 3–4 role cards, each with role | scope | one quantified result.
- **Rules:** **only user-provided facts**; no invented metrics. If impact is unquantified, state the qualitative outcome.
- **Build:** `deck.roadmap` with years as periods, or `kpiTiles`.

### E2 Evidence of impact (STAR cards)
- **Use when:** 2–3 achievements.
- **Anatomy:** cards with Situation/Task → Action → Result; the result is a big number when one is supplied.
- **Build:** `kpiTiles` + `twoColumns`, or a `comparisonTable` without ratings.

### E3 Role fit matrix
- **Use when:** to map the role's requirements to the candidate's evidence.
- **Anatomy:** table of requirement | evidence | proof point; the strongest-fit rows highlighted.
- **Build:** `comparisonTable` (2 data columns).

### E4 First 30/60/90 days (contribution plan)
- **Use when:** to show what the candidate would do in the role.
- **Anatomy:** D1 with three periods, or three columns of verb-led actions plus a success measure each.
- **Build:** `roadmap` or C5.
