# Dependencies and setup

Don't assume tools are installed. Run `scripts/setup.sh --check` first; it reports what is present and changes nothing.

| Need | Tool | Install | Fallback if missing |
|---|---|---|---|
| Build .pptx | Node ≥ 18 + `pptxgenjs` (in `scripts/node_modules`) | `cd scripts && npm install` | `python-pptx` in the venv (fewer chart-styling options; the same design rules apply) |
| QA + text fit | Python 3.9+ venv with `python-pptx`, `Pillow` | `python3 -m venv .venv && .venv/bin/pip install python-pptx pillow pymupdf` | Skip automated QA; say so to the user |
| Render slides | LibreOffice `soffice` | macOS `brew install --cask libreoffice`; Debian/Ubuntu `sudo apt install libreoffice-impress` | Export a PDF from PowerPoint/Keynote by hand, then `scripts/pdf_to_pages.py deck.pdf outdir`; otherwise report that visual QA was not possible |
| PDF → PNG / text | `PyMuPDF` (venv) | included above | macOS `qlmanage -t` (first page only); poppler `pdftoppm` |
| Final open check | Microsoft PowerPoint (optional) | n/a | The python-pptx reload + LibreOffice conversion are the minimum |

`scripts/setup.sh` (without `--check`) creates the venv and runs `npm install`. It does **not** install LibreOffice; ask the user first, because it is ~700 MB.

Paths in this skill are relative to the skill directory (`~/.claude/skills/executive-presentations`). Generator scripts should `require(path.join(SKILL, "scripts/deck_kit.js"))`.

## pptxgenjs gotchas (v4)
- `pres.layout = "LAYOUT_WIDE"` (13.333 × 7.5) is set by `createDeck`. Coordinates past the edge are written but invisible.
- Hex colours carry **no `#`** and are 6 digits. Use `transparency` for alpha.
- Option objects are mutated in place. Build a fresh object per call (never share a `shadow` object).
- **Text-box `margin` array order is `[left, right, bottom, top]` in points.** Table-cell `margin` is `[top, right, bottom, left]`.
- `rectRadius` only works with `ROUNDED_RECTANGLE`.
- Stacked bar charts: use `dataLabelPosition` `ctr`/`inEnd`/`inBase` only. `outEnd` corrupts the file.
- A combo chart with a secondary axis needs both `valAxes` and `catAxes` arrays.
- Multiple `chartColors` on a single-series bar colour each point. That is how `highlight` works.
- Horizontal bar charts with `catAxisOrientation: "maxMin"` list the legend in reverse in some renderers. Prefer `chart.key`.
- `&` in `pres.company` or layout titles must be written as `&amp;`.
- Placeholder titles keep their layout styling. Pass `align: "left"` explicitly, because LibreOffice centres otherwise.
- Speaker notes: `slide.addNotes()`.
- `deck.save()` writes the brand colours and fonts into `ppt/theme/theme1.xml`, so PowerPoint's colour picker and new text match the brand.
