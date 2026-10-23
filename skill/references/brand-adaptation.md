# Brand adaptation

The goal is to change the visual identity to match the target company while keeping the analytical structure unchanged. The output is a brand spec JSON (schema: `assets/brand-template.json`; worked example: `examples/senpilot-brand.json`) that `deck_kit.loadBrand()` consumes.

## 1. Source hierarchy (use the first available)
1. **User-supplied brand guidelines, template, logo or reference deck.** Take colours, fonts and logo rules from these. Mark them `provenance: "official"`.
2. **Official brand or press resources** on the company's own domain: `/brand`, `/press`, `/media`, `/newsroom`, a press kit PDF, or an investor-relations deck. Mark them `official`.
3. **The official website itself:**
   - CSS custom properties: `--brand`, `--primary`, `--navy`, etc.
   - `<meta name="theme-color">`, which counts as `site-declared`.
   - Primary button colours and the open-graph share image.
   - Mark these `inferred-site-css` (or `inferred-site-asset` for colours sampled from images).
4. **Nothing verifiable**: no site, blocked, or ambiguous. Use `assets/provisional-palette.json`. Mark it `provisional` and **tell the user** that the palette is a placeholder.

Never take colours from third-party "brand colour" aggregator sites as if they were official. They can be used to cross-check, but they must be labelled as such.

## 2. Research procedure (website)
```bash
curl -sL https://<domain>/ -o home.html
grep -oE '/_next/static/[^"]+\.css|/[^"]+\.css' home.html | sort -u   # list stylesheets
# fetch each, then rank colour tokens and frequent hex values:
grep -oE -- '--[a-zA-Z0-9-]+:\s*#[0-9a-fA-F]{3,8}' all.css | sort | uniq -c | sort -rn | head -60
grep -oE '#[0-9a-fA-F]{6}\b' all.css | tr A-F a-f | sort | uniq -c | sort -rn | head -40
grep -io '<meta name="theme-color"[^>]*>' home.html
```
- If a scraping tool with a "branding" extraction format is available (e.g. Firecrawl `formats: ["branding"]`), use it as a first pass. Then confirm against the CSS.
- Look at the OG image or homepage hero (download it and view it) to see how the colours are actually combined: what the ground is, what the text colour is, and which accent is used.
- Note the font stack (`font-family`). If the brand font isn't installed locally (check `system_profiler SPFontsDataType` on macOS or `fc-list` elsewhere), choose a substitute.
- Record every source URL and the date in the brand JSON.

## 3. Map colours to roles
Fill these roles, which `design-system.md` defines:

`dark, ink, body, muted, rule, background, tint, accent, accent2, onDark, onDarkMuted, positive, warning, negative, dataSeries[]`

Rules:
- **`dark`** is the brand's deepest primary, typically navy or black. Use it for the cover, dividers and the recommendation band.
- **`accent`** is the brand's most distinctive mid-tone. It must reach ≥ 3:1 contrast against white (large text and bars) and is darkened automatically for small text (`P.accentText`).
- **`ink`/`body`** should be the brand's text colours when defined, otherwise a near-black tinted toward `dark`.
- **Neutrals** (`muted`, `rule`, `tint`) come from the brand's greys when available, so the deck doesn't mix warm and cool greys.
- **`dataSeries`** has 3–5 colours, distinguishable in greyscale, starting with `accent` and then `dark`. Keep this order constant across the deck so each category keeps its colour.
- **`positive`/`warning`/`negative`** are reserved for status and risk signals. If the brand has its own status colours, use them. Otherwise use a desaturated green, amber and red that harmonise with the palette. **Never use them for decoration**, and never make the brand accent red if red also signals risk. In that case, pick a different negative colour or rely on labels.
- If the brand is mostly monochrome (e.g. navy + white), derive the series by tinting: `mix(accent, white, 0.5)`, `muted`.

## 4. Check contrast
Run `scripts/contrast.py --brand brand.json`. Thresholds:
- Body text needs ≥ 4.5:1 against its background.
- Large or bold text (≥ 14 pt bold or ≥ 18 pt) and bars against the background need ≥ 3:1.
- Fix any failures by darkening or lightening the colour. Note the adjustment in the JSON (`"adjusted": "darkened from #… for AA"`).

`deck_kit` applies `ensureContrast()` automatically for small accent and warning labels on tints, and `qa_check.py` re-checks the rendered colours.

## 5. Fonts
- Use the brand font only when it is installed on the machine **and** likely to be installed for the audience. Otherwise PowerPoint substitutes it silently.
- Default substitutes:

| Brand font style | Substitute |
|---|---|
| Geometric / grotesque sans (Geist, Inter, Graphik, Circular, Helvetica-based) | Arial |
| Humanist sans | Calibri (Windows audience) or Arial |
| Serif display | Georgia |

- Set `fonts.heading.use` and `fonts.body.use`, and record the `brand` name for transparency. The kit writes these into the theme so new text in PowerPoint matches.

## 6. Logos
- Use a logo only if it was **supplied** or **downloaded from the company's own domain**, and only when that is appropriate: presenting *to* or *for* that company (interview, proposal), or presenting its own material.
- Never use a logo on a deck that could be mistaken for official company material when it isn't. In that case add "Prepared by [name] for [company]" and label the content.
- Placement:
  - Cover only by default.
  - Use the white or reversed variant on dark grounds.
  - Keep the original aspect ratio (`logo.aspect`) and clear space ≥ the logo's height.
- Never recolour, stretch, crop or add effects. Never use logos of other companies (customers, partners) unless the user supplies them for that purpose.
- Record the logo source URL in the brand JSON.

## 7. What stays constant across brands
The grid, type scale, headline rules, one-accent-per-slide rule, evidence tags, sources, chart minimalism and status-colour discipline all stay the same. Brand adaptation changes **only** the colours, the fonts, the logo, and optionally light vs dark cover treatment.

## 8. Report to the user
State the following briefly in the final message:
- Which sources were used.
- Which colours are official and which are inferred.
- Any substitutions (fonts) or adjustments made for contrast.
- Whether a logo was used, and where it came from.
