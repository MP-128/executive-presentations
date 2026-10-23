# Design system (original; brand-neutral)

This system is derived from principles common to the five reference decks, not copied from any one of them. Brand adaptation swaps the colours and fonts only; the grid, hierarchy and rules stay fixed. The constants live in `scripts/deck_kit.js` (`G`, `T`).

## Canvas and grid
- **16:9 by default**, 13.333 × 7.5 in (`LAYOUT_WIDE`). Use 4:3 or A4 only when asked; then rescale `G` proportionally.
- Side margins: 0.6 in. Content width: 12.13 in. Gutter: 0.3 in.
- Vertical zones (in):

| Zone | y | Notes |
|---|---|---|
| Kicker (section tracker) | 0.34–0.60 | 10 pt bold caps, accent, letter-spaced |
| Headline | 0.62–1.52 | 24 pt bold (auto-shrinks to 18), ≤2 lines, left-aligned, max width 10.1 in |
| Subtitle / unit line | 1.50–1.82 | 13 pt muted (optional) |
| Content | 1.72 (or 1.95) → 6.72 | Nothing may cross 6.72 |
| Footer rule | 6.90 | hairline |
| Source (left) · footer label · page no. (right) | 6.98–7.32 | 8.5 pt muted |
| Evidence tag | top-right, aligned with kicker | VERIFIED / USER-PROVIDED / ESTIMATE / ILLUSTRATIVE DATA / SYNTHETIC CONTENT |

- Standard splits:
  - **Evidence:** 7.9 in exhibit + 3.9 in "so what" panel.
  - **Sidebar:** 4.0 in sidebar + 7.8 in body.
  - **Thirds:** 3 × 3.84 in.
  - **Halves:** 2 × 5.9 in.

## Type scale (pt)
| Role | Size | Weight |
|---|---|---|
| Cover headline | 38 (fit 26–38) | Bold |
| Section divider title | 32 | Bold |
| Slide headline | 24 (fit 18–24) | Bold |
| Sub-head / panel heading | 15 | Bold |
| Body | 13 (fit 10–13) | Regular |
| Chart labels, table text | 11 | Regular |
| Kicker, tags, panel labels | 9.5–10 | Bold caps, +1.5 spacing |
| Source / footnotes | 8.5 | Regular, muted |

- **Minimums:** body ≥ 10 pt, chart labels ≥ 10 pt, footnotes ≥ 8 pt. When text needs to go smaller than that, cut words or split the slide instead.
- Sentence case everywhere except kickers and tags.
- ≤ 2 type families: heading and body, often the same family.

## Headlines
- **Evidence slides:** a full-sentence action title stating the insight and its driver, quantified where possible, ≤ 2 lines (≈ 15–22 words). Example shapes:
  - "X drives ~60% of Y: the largest opportunity"
  - "A grows while B holds steady, so we should C"
- **Navigation slides** (agenda, divider, appendix) may use topic titles.
- **Kicker + title** (`Section | sub-topic` above the title) shows where the slide sits in the story.
- Read the titles alone in order. They must tell the whole story; if they don't, rewrite them.
- Never repeat an identical title on consecutive slides.

## Colour roles
Supplied by the brand spec (`brand-adaptation.md`). The roles never change:

| Role | Use | Never |
|---|---|---|
| `dark` | cover/divider ground, recommendation band, neutral bars | body text on light |
| `ink` / `body` | headlines / body text | n/a |
| `muted` | sources, axis labels, secondary text | key numbers |
| `rule`, `tint` | hairlines, panels, table headers | data series |
| `accent` | the **one** focus series, kicker, highlight column, active state | decoration |
| `context` (derived grey) | non-focus data | n/a |
| `series[]` | multi-series charts, in a fixed order across the deck | re-ordering between slides |
| `positive` / `warning` / `negative` | status, risk exposure, direction of change, pain points | branding or decoration |

- One accent focus per slide. Everything else is neutral.
- A data category keeps the same colour on every slide.
- Status colours always carry a word too ("High", "On track"), never colour alone.

## Charts
- Native PowerPoint charts (`addChart`) for anything chartable. Diagrams are native shapes. Images only for logos, user-supplied screenshots or photos.
- **Exhibit header:** chart title (what) + unit line (how measured), with an inline colour key instead of a legend where possible.
- Hide the value axis when values are labelled. No gridlines. Thin category axis line.
- Direct data labels at 11 pt. Format numbers sensibly: no "3.0" when the data is "3".
- Bars: sort by value unless the order is intrinsic. Horizontal bars when labels exceed ~12 characters.
- Line: ≤ 4 series; label endpoints; mark forecast with a dashed style or "E" suffix.
- No 3-D, no pies with more than 4 slices, no dual axes unless both are labelled and essential.
- **Choosing the form:**
  - Comparison → bar.
  - Change over time → line/column.
  - Composition → stacked bar or 100% bar.
  - Bridge → waterfall.
  - Relationship → scatter.
  - Process or structure → diagram, not chart.

## Tables
- Header row tinted, bold. Body 11 pt. Numbers right-aligned (financial) or centred (ratings).
- ≤ 7 rows and ≤ 5 columns on a content slide; anything more goes to the appendix.
- Highlight **one** column or cell with an accent tint.
- Harvey-style ratings (●●●○) need a scale explanation in the subtitle.

## Sources, evidence labels, footnotes
- Every slide with an external figure carries `Source: Organisation, Title, Month Year` (with a URL in the speaker notes when useful).
- Evidence tag top-right for any content that is not verified fact:
  - `estimate`: the presenter's own calculation.
  - `illustrative`: example values.
  - `synthetic`: fabricated for demonstration.
  - `user`: user-supplied, not independently checked.
- Use superscript-numbered footnotes for definitions (e.g. "adjusted", "run-rate"), in the source line.

## Spacing and alignment
- Align every object to the margins or the gutter. Left edges of the kicker, title, content and source must match.
- Leave ≥ 0.2 in between unrelated objects and ≥ 0.1 in padding inside panels.
- Prefer whitespace over filling space. Leaving ~20% of the content area empty is fine.
- One idea per slide. If a slide needs more than ~70 words of body text, split it or move detail to the notes.

## Speaker notes
Add notes for presented decks: the talk track, the source URLs, and the caveats that don't fit on the slide.
