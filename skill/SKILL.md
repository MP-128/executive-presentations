---
name: executive-presentations
description: Create polished, editable PowerPoint (.pptx) decks for executives and interviews, combining consulting-grade storylines with a target company's branding. Use when the user asks for an executive or board presentation, strategy recommendation or business case, interview case presentation, personal interview presentation, product demo or AI deployment proposal, project update or implementation roadmap, or any deck "in <company>'s branding/colours", or invokes /executive-presentations.
---

# Executive presentations

Builds 16:9, fully editable `.pptx` decks: native text, shapes, tables and charts. The storyline is adapted to the presentation type and the visual identity to the target company. The pattern library and design system come from an analysis of five professional reference decks (`references/reference-deck-analysis.md`).

Skill directory (`$SK`): `~/.claude/skills/executive-presentations`. All paths below are relative to it.

## 1. Intake
Extract whatever the request already gives:
- **Type:** exec decision/board · strategy/business case · interview case · personal interview · product/AI proposal · project update/roadmap · custom.
- **Company** name or website, plus any supplied brand guidelines, logo or template.
- **Topic and objective**; **audience** and the decision or outcome sought.
- **Length:** slide count, or duration at ~2 min per slide.
- **Source material** and required content.
- **Tone and detail level.**
- **Output location:** default `~/Documents/Presentations/<slug>/<slug>.pptx`.

Ask **one grouped round** of questions (AskUserQuestion, ≤4) only when a missing item would materially change the deck. That usually means the objective, the audience, or (for personal-interview decks) the candidate's real experience and results. Otherwise infer defaults and list the material assumptions in your reply. Never re-ask something already supplied.

## 2. Plan the storyline
- Pick the skeleton from `references/storylines.md`. **The user's own structure always wins.**
- Write the action titles first, as a list. Read them in order: they must tell the whole story, answer first.
- Assign each slide a pattern from `references/slide-patterns.md` according to its job:
  - chart for quantities;
  - diagram for processes and structures;
  - table for precise comparisons.
- Tag each fact: **verified** (with source), **user-provided**, **estimate** (show the basis), **illustrative/synthetic**.

## 3. Brand
Follow `references/brand-adaptation.md`:
1. Use supplied guidelines first.
2. Otherwise use official brand/press pages.
3. Otherwise infer from the official site's CSS, theme-color and OG image.
4. If none of these can be verified, use `assets/provisional-palette.json` and say so.

Then:
- Write `brand.json` next to the deck (schema: `assets/brand-template.json`), recording the provenance of every colour.
- Run `scripts/contrast.py --brand brand.json`.
- Use a logo only if it was supplied or comes from the company's own domain, and only where that is appropriate (cover only).

## 4. Build
- Check the toolchain: `scripts/setup.sh --check`. If anything is missing, see `references/dependencies.md`.
- Write a generator script in the output folder. Copy the shape of `examples/build_sample.js`:
```js
const kit = require(process.env.HOME + "/.claude/skills/executive-presentations/scripts/deck_kit.js");
const deck = kit.createDeck(kit.loadBrand("brand.json"), { title, author, footer });
const s = deck.content({ kicker, title, subtitle, source, evidence: "estimate" });
deck.chartPanel(s, { chart: {...}, panel: {...} });   // or execSummary, processFlow, matrix2x2,
await deck.save("deck.pptx");                          // comparisonTable, roadmap, kpiTiles, riskTable, …
```
- Compose custom slides with raw pptxgenjs on `deck.pres`, keeping to the grid `kit.G` and palette `deck.P`. Add speaker notes for presented decks.

## 5. QA, then fix and repeat (mandatory)
```bash
$SK/.venv/bin/python $SK/scripts/qa_check.py deck.pptx   # fit, overlap, off-slide, contrast, sources
$SK/.venv/bin/python $SK/scripts/render.py deck.pptx     # PDF + PNG per slide + contact sheet
```
- **View every slide PNG** and work through `references/qa-checklist.md`.
- Fix issues in the generator and rebuild until the QA script reports 0 errors and the visual check is clean.
- If rendering is unavailable, say so plainly; don't claim visual QA happened.

## Non-negotiables
- Never invent facts, figures, citations, quotes, customers, experience or results. Use bracketed placeholders (`[add metric]`) and ask.
- Every external claim gets a source line. Estimates and synthetic or illustrative data get an evidence tag.
- Never reuse reference-deck logos, typefaces, art, framework names or figures as content.
- Every slide is editable: native charts and tables, no screenshots of slides.
- 16:9 unless told otherwise. One message per slide. One accent focus per slide. Status colours only for status.

## Deliver
Reply with:
- The .pptx path and the contact-sheet preview path.
- A short slide-by-slide outline.
- Branding sources: which colours are official and which inferred, plus any font substitutions.
- Assumptions made and placeholders the user must fill.
- QA results.

## Resources
| Path | Contents |
|---|---|
| `references/storylines.md` | Default structures and density per presentation type |
| `references/slide-patterns.md` | ~28 patterns with geometry, rules, reference pages, builder |
| `references/design-system.md` | Grid, type scale, colour roles, chart/table/source rules |
| `references/brand-adaptation.md` | Brand research, role mapping, contrast, fonts, logos |
| `references/qa-checklist.md` | Automated + visual + integrity checks, common fixes |
| `references/reference-deck-analysis.md` | Notes on the 5 reference decks with page refs + do-not-copy lists |
| `references/dependencies.md` | Install/fallbacks, pptxgenjs gotchas |
| `scripts/deck_kit.js` | Slide builders + brand theme writer |
| `scripts/qa_check.py`, `render.py`, `contrast.py` | QA, rendering, WCAG contrast |
| `scripts/pdf_to_pages.py`, `contact_sheet.py` | Study a reference PDF / tile previews |
| `assets/brand-template.json`, `provisional-palette.json` | Brand spec schema; fallback palette |
| `examples/build_sample.js`, `senpilot-brand.json` | Worked example (synthetic interview case) |
