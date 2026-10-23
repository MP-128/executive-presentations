# QA checklist

Run all three steps before declaring a deck done. Fix problems in the generator script, then rebuild; never hand-patch the .pptx.

## 1. Automated
```bash
SK=~/.claude/skills/executive-presentations
$SK/.venv/bin/python $SK/scripts/qa_check.py deck.pptx      # layout, fit, contrast, sources
$SK/.venv/bin/python $SK/scripts/render.py deck.pptx        # PDF + slide PNGs + contact sheet
```
`qa_check.py` reports ERROR and WARN lines.
- **All ERRORs must be fixed.** Resolve or consciously accept each WARN, and say which ones you accepted.
- The text-fit check uses real Arial metrics. Other fonts are approximated.

## 2. Visual (view every slide PNG, not only the contact sheet)
For each slide, check:
- [ ] **Overflow / clipping:** no text cut off, nothing past the footer rule or slide edge, no auto-shrunk text below 10 pt.
- [ ] **Overlaps:** labels don't collide with each other, with dots or bars, or with milestone lines. 2×2 labels stay inside their quadrant.
- [ ] **Spacing:** left edges align (kicker, title, content, source). Gaps are consistent, and there are no large accidental voids or cramped clusters.
- [ ] **Contrast:** all text is readable, including white on accent bars and muted text on tints.
- [ ] **Labels:** chart values are readable (≥ 10 pt) with sensible number formats; axis labels don't wrap awkwardly; the legend or key order matches the visual order.
- [ ] **Hierarchy:** the headline is the most prominent element; one accent focus per slide.
- [ ] **Titles:** read the titles alone in sequence. They should tell the whole story with no repeats.
- [ ] **Evidence:** the evidence tag is present where needed; a source line is on every data slide; estimates and synthetic data are labelled.
- [ ] **Brand:** colours are used in their roles; status colours are used only for status; the logo is undistorted, cover only.

## 3. Integrity
- [ ] Every number traces to the user's material, a cited source, or a stated calculation or assumption.
- [ ] No invented facts, citations, quotes, customers, experience or results. Placeholders are bracketed: `[add metric]`.
- [ ] Dated figures carry their date. Nothing from the reference decks has been reused as content.
- [ ] Objects are editable: text boxes, native charts and tables (`qa_check.py` prints the counts; pictures should be logos or supplied images only).
- [ ] The file opens: the python-pptx reload succeeds (the QA script does this). If Microsoft PowerPoint is available, open the file with `open -a "Microsoft PowerPoint" deck.pptx` (macOS) and confirm there's no repair prompt.

## Common fixes
| Symptom | Fix |
|---|---|
| Headline wraps to 3 lines | Shorten it (≤ 22 words) or accept the auto-shrink to ≥ 18 pt |
| Panel text overflows | Cut bullets to ≤ 4 × ≤ 20 words; fitPt shrinks to 10 pt minimum, so beyond that, split the slide |
| Legend order reversed on horizontal bars | Use `chart.key` (inline key in the unit line) instead of a legend |
| Label collides in the 2×2 | Nudge `x`/`y`, or set `side: "left"/"right"` on the item |
| Milestone line cuts through bar text | Already drawn behind the bars; shorten the bar label or move the milestone |
| Table runs into the footer | Fewer rows, smaller `rowH`, move detail to the appendix |
| White text on light accent fails contrast | Darken the accent in the brand JSON (note `adjusted`) |
