/**
 * deck_kit.js — executive-presentations slide library (pptxgenjs).
 *
 * Builds editable 16:9 decks (13.333" x 7.5") from a brand spec (see assets/brand-template.json).
 * Every builder emits native text boxes, shapes, tables and charts — nothing is flattened to an image
 * except supplied logos.
 *
 *   const kit = require("<skill>/scripts/deck_kit.js");
 *   const deck = kit.createDeck(require("./brand.json"), { title: "…", author: "…" });
 *   const s = deck.content({ kicker, title, subtitle, source, evidence: "illustrative" });
 *   deck.chartPanel(s, { … });
 *   await deck.save("out.pptx");          // writes file + brand theme colours/fonts
 *
 * Geometry is in inches. Layout constants live in G; see references/design-system.md.
 */
const path = require("path");
const fs = require("fs");
const PptxGenJS = require("pptxgenjs");
const JSZip = require("jszip");

// ---------- geometry (design-system.md §Grid) ----------
const G = {
  W: 13.333, H: 7.5,
  mx: 0.6,                 // left/right margin
  kickerY: 0.34, kickerH: 0.26,
  titleY: 0.62, titleH: 0.9,
  subY: 1.5, subH: 0.32,
  bodyTop: 1.95,           // content top when a subtitle is present
  bodyTopNoSub: 1.72,
  bodyBottom: 6.72,        // content must end above this
  ruleY: 6.9,
  footY: 6.98, footH: 0.34,
  gutter: 0.3,
};
G.cw = G.W - 2 * G.mx;     // content width

// ---------- type scale (pt) ----------
const T = {
  cover: 38, section: 32, headline: 24, sub: 13, h3: 15, body: 13, small: 11, label: 10, source: 8.5, kicker: 10,
};

const EVIDENCE = {
  verified: "VERIFIED",
  user: "USER-PROVIDED",
  estimate: "ESTIMATE",
  illustrative: "ILLUSTRATIVE DATA",
  synthetic: "SYNTHETIC CONTENT",
};

// ---------- colour helpers ----------
const hex = (c) => String(c).replace(/^#/, "").toUpperCase().slice(0, 6);
function lum(c) {
  const h = hex(c);
  const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function contrast(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
function mix(a, b, t) { // t=0 → a, t=1 → b
  const A = hex(a), B = hex(b);
  return [0, 2, 4].map((i) => {
    const v = Math.round(parseInt(A.slice(i, i + 2), 16) * (1 - t) + parseInt(B.slice(i, i + 2), 16) * t);
    return v.toString(16).padStart(2, "0");
  }).join("").toUpperCase();
}

// ---------- text fitting (approximate; Arial-like metrics) ----------
function estLines(text, wIn, pt, bold) {
  const cpl = Math.max(1, Math.floor((wIn * 72) / (pt * (bold ? 0.56 : 0.5))));
  return String(text).split("\n").reduce((n, para) => n + Math.max(1, Math.ceil(para.length / cpl)), 0);
}
/** Largest font size in [min,max] whose estimated wrapped height fits the box. */
function fitPt(text, wIn, hIn, max, min = 9, bold = false, lineSpacing = 1.2) {
  for (let pt = max; pt >= min; pt -= 0.5) {
    if (estLines(text, wIn - 0.1, pt, bold) * pt * lineSpacing / 72 <= hIn - 0.08) return pt;
  }
  return min;
}

// ---------- palette resolution ----------
function resolvePalette(brand) {
  const c = brand.colors || {};
  const v = (k, d) => hex((c[k] && (c[k].hex || c[k])) || d);
  const P = {
    dark: v("dark", "1F2937"),        // cover / divider background
    ink: v("ink", "1F2937"),          // headline + body text on light
    body: v("body", v("ink", "1F2937")),
    muted: v("muted", "6B7280"),      // secondary text, axis labels
    rule: v("rule", "D1D5DB"),        // hairlines, gridlines
    bg: v("background", "FFFFFF"),
    tint: v("tint", "F3F4F6"),        // panels, table header
    accent: v("accent", "2563EB"),    // primary highlight / focus series
    accent2: v("accent2", "64748B"),
    onDark: v("onDark", "FFFFFF"),
    onDarkMuted: v("onDarkMuted", "B8C0D9"),
    positive: v("positive", "2E7D5B"),
    warning: v("warning", "B26B00"),
    negative: v("negative", "B42318"),
  };
  P.series = (brand.dataSeries || [P.accent, P.accent2, mix(P.accent, "FFFFFF", 0.5), P.muted]).map(hex);
  P.context = mix(P.muted, "FFFFFF", 0.45); // de-emphasised bars
  // small-text-safe variants (WCAG AA 4.5:1) for accent/warning labels on panels and white
  P.accentText = ensureContrast(P.accent, P.tint);
  P.accentTextOnFocus = ensureContrast(P.accent, mix(P.accent, "FFFFFF", 0.88));
  P.warningText = ensureContrast(P.warning, mix(P.warning, "FFFFFF", 0.9));
  P.mutedOnTint = ensureContrast(P.muted, P.tint);
  return P;
}
/** Darken (or lighten) fg toward ink/white until it reaches `min` contrast on bg. */
function ensureContrast(fg, bg, min = 4.5) {
  let c = hex(fg);
  const toward = lum(bg) > 0.4 ? "000000" : "FFFFFF";
  for (let t = 0.04; contrast(c, bg) < min && t <= 1; t += 0.04) c = mix(fg, toward, t);
  return c;
}
const textOn = (fill, P) => (contrast(fill, P.onDark) >= contrast(fill, P.ink) ? P.onDark : P.ink);

// ---------- deck factory ----------
function createDeck(brand, meta = {}) {
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE";
  pres.title = meta.title || "Presentation";
  pres.author = meta.author || "";
  pres.subject = meta.subject || "";
  const P = resolvePalette(brand);
  const F = {
    head: (brand.fonts && brand.fonts.heading && (brand.fonts.heading.use || brand.fonts.heading)) || "Arial",
    body: (brand.fonts && brand.fonts.body && (brand.fonts.body.use || brand.fonts.body)) || "Arial",
  };
  pres.theme = { headFontFace: F.head, bodyFontFace: F.body };
  const footerLabel = meta.footer || "";
  const logos = resolveLogos(brand);
  // Discreet footer logo (placement "footer"): presenting company's if supplied, else the subject's.
  const footLogo = logos.placement === "footer" ? logos.presenting || logos.subject : null;
  const footLogoBox = footLogo && fitLogo(footLogo, 0.22, 1.3);
  const footLabelRight = G.W - G.mx - 0.6 - (footLogoBox ? footLogoBox.w + 0.25 : 0);

  // Layouts (pptxgenjs "masters" = slide layouts)
  pres.defineSlideMaster({
    title: "EP_CONTENT",
    background: { color: P.bg },
    objects: [
      // brand strip: dark band across the top with an accent segment at the left
      { rect: { x: 0, y: 0, w: G.W, h: 0.09, fill: { color: P.dark }, line: { type: "none" } } },
      { rect: { x: 0, y: 0, w: G.mx + 1.0, h: 0.09, fill: { color: P.accent }, line: { type: "none" } } },
      { line: { x: G.mx, y: G.ruleY, w: G.cw, h: 0, line: { color: P.rule, width: 0.75 } } },
      ...(footerLabel ? [{ text: { text: footerLabel, options: { x: footLabelRight - 4.0, y: G.footY, w: 4.0, h: G.footH, fontFace: F.body, fontSize: T.source, color: P.muted, align: "right", valign: "top", margin: 0 } } }] : []),
      ...(footLogoBox ? [{ image: { path: footLogo.path, x: G.W - G.mx - 0.6 - footLogoBox.w, y: G.footY - 0.02, w: footLogoBox.w, h: footLogoBox.h } }] : []),
      { placeholder: { options: { name: "title", type: "title", x: G.mx, y: G.titleY, w: G.cw - 2.2, h: G.titleH, fontFace: F.head, fontSize: T.headline, bold: true, color: P.ink, align: "left", valign: "top", margin: 0, lineSpacingMultiple: 0.95 }, text: "" } },
    ],
    slideNumber: { x: G.W - G.mx - 0.5, y: G.footY, w: 0.5, h: G.footH, fontFace: F.body, fontSize: T.source, color: P.muted, align: "right", valign: "top", margin: 0 },
  });
  pres.defineSlideMaster({
    title: "EP_DARK",
    background: { color: P.dark },
    objects: [],
  });

  const deck = { pres, P, F, G, T, brand };
  let n = 0;

  // ----- frame helpers -----
  function evidenceTag(slide, kind, dark) {
    if (!kind) return;
    const label = EVIDENCE[kind] || String(kind).toUpperCase();
    const w = 0.24 + label.length * 0.075;
    slide.addText(label, {
      x: G.W - G.mx - w, y: G.kickerY - 0.03, w, h: 0.28, shape: pres.shapes.ROUNDED_RECTANGLE, rectRadius: 0.06,
      fill: { color: dark ? P.dark : P.tint }, line: { color: dark ? P.onDarkMuted : (kind === "verified" ? P.positive : P.muted), width: 0.75 },
      fontFace: F.body, fontSize: 8, bold: true, charSpacing: 1, color: dark ? P.onDark : (kind === "verified" ? P.positive : P.body),
      align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: "Evidence tag",
    });
  }
  function source(slide, text) {
    if (!text) return;
    const right = footerLabel ? footLabelRight - 4.0 - 0.2 : footLogoBox ? G.W - G.mx - 0.6 - footLogoBox.w - 0.25 : G.W - G.mx - 1.0;
    slide.addText(text, {
      x: G.mx, y: G.footY, w: right - G.mx, h: G.footH, fontFace: F.body, fontSize: T.source, color: P.muted,
      valign: "top", margin: 0, isTextBox: true, objectName: "Source",
    });
  }

  /**
   * Place a logo inside an outer box, keeping its aspect ratio. On dark grounds it sits on a white chip
   * (brand-adaptation.md: never recolour, stretch, crop or add effects to a logo).
   */
  function addLogo(slide, L, { x, y, h, maxW, align = "left", chip = false, name = "Logo" }) {
    const pad = chip ? 0.12 : 0;
    const b = fitLogo(L, h - 2 * pad, maxW - 2 * pad);
    const ox = align === "right" ? x + maxW - b.w - 2 * pad : x;
    if (chip) slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: ox, y, w: b.w + 2 * pad, h: b.h + 2 * pad, rectRadius: 0.06, fill: { color: "FFFFFF" }, line: { type: "none" }, objectName: `${name} chip` });
    slide.addImage({ path: L.path, x: ox + pad, y: y + pad, w: b.w, h: b.h, objectName: name });
  }

  /** Brand motif for dark slides: slanted bands in accent tones along the right edge. */
  function darkMotif(slide) {
    const bands = [[9.7, 0.18], [10.75, 0.38], [11.8, 0.7]]; // [x, accent strength]
    bands.forEach(([x, t]) => slide.addShape(pres.shapes.PARALLELOGRAM, { x, y: 0, w: G.W - x, h: G.H, fill: { color: mix(P.dark, P.accent, t) }, line: { type: "none" }, objectName: "Motif" }));
    slide.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.14, h: G.H, fill: { color: P.accent }, line: { type: "none" }, objectName: "Accent edge" });
  }

  /** Dark title-style slide shared by the cover and the closing slide. */
  function titleSlide({ label, title, subtitle, presenter, date, evidence, notes }, withLogos) {
    const s = pres.addSlide({ masterName: "EP_DARK" }); n++;
    darkMotif(s);
    const subj = withLogos && logos.subject, pres_ = withLogos && logos.presenting;
    if (subj) addLogo(s, subj, { x: G.mx, y: 0.55, h: 0.78, maxW: 3.4, chip: true, name: "Logo (subject)" });
    evidenceTag(s, evidence, true);
    s.addShape(pres.shapes.RECTANGLE, { x: G.mx, y: 2.05, w: 0.9, h: 0.07, fill: { color: P.accent === P.dark ? P.onDark : P.accent }, line: { type: "none" }, objectName: "Accent rule" });
    if (label) s.addText(label.toUpperCase(), { x: G.mx, y: 2.35, w: 8.6, h: 0.3, fontFace: F.body, fontSize: 11, bold: true, charSpacing: 2, color: P.onDarkMuted, margin: 0, isTextBox: true });
    s.addText(title, { x: G.mx, y: 2.75, w: 8.6, h: 2.0, fontFace: F.head, fontSize: fitPt(title, 8.6, 2.0, T.cover, 24, true, 1.17), bold: true, color: P.onDark, valign: "top", margin: 0, lineSpacingMultiple: 0.95, isTextBox: true, objectName: "Title" });
    if (subtitle) s.addText(subtitle, { x: G.mx, y: 4.85, w: 8.6, h: 0.8, fontFace: F.body, fontSize: fitPt(subtitle, 8.6, 0.8, 16, 12), color: P.onDarkMuted, valign: "top", margin: 0, isTextBox: true, objectName: "Subtitle" });
    s.addShape(pres.shapes.LINE, { x: G.mx, y: 6.55, w: 8.6, h: 0, line: { color: mix(P.dark, P.onDark, 0.3), width: 0.75 } });
    s.addText([presenter, date].filter(Boolean).join("   |   "), { x: G.mx, y: 6.7, w: 8.6, h: 0.35, fontFace: F.body, fontSize: 11, color: P.onDarkMuted, margin: 0, isTextBox: true, objectName: "Presenter" });
    if (pres_) addLogo(s, pres_, { x: G.W - G.mx - 3.0, y: 6.35, h: 0.72, maxW: 3.0, align: "right", chip: true, name: "Logo (presenting)" });
    if (notes) s.addNotes(notes);
    return s;
  }

  /** Title-slide (dark). Logos appear here for every placement. */
  deck.cover = (o) => titleSlide(o, true);

  /** Closing slide (dark): next step or thanks. Logos appear when placement is "titleAndClosing". */
  deck.closing = (o) => titleSlide(o, logos.placement === "titleAndClosing");

  /** Section divider (dark): number + title + one-line summary. */
  deck.section = ({ number, title, summary, notes }) => {
    const s = pres.addSlide({ masterName: "EP_DARK" }); n++;
    darkMotif(s);
    if (number != null) s.addText(String(number).padStart(2, "0"), { x: G.mx, y: 2.3, w: 2, h: 0.7, fontFace: F.head, fontSize: 28, bold: true, color: P.accent === P.dark ? P.onDarkMuted : mix(P.accent, "FFFFFF", 0.35), margin: 0, isTextBox: true });
    s.addText(title, { x: G.mx, y: 3.05, w: 8.6, h: 1.2, fontFace: F.head, fontSize: fitPt(title, 8.6, 1.2, T.section, 24, true, 1.17), bold: true, color: P.onDark, valign: "top", margin: 0, isTextBox: true });
    if (summary) s.addText(summary, { x: G.mx, y: 4.3, w: 8.6, h: 0.9, fontFace: F.body, fontSize: 15, color: P.onDarkMuted, valign: "top", margin: 0, isTextBox: true });
    if (notes) s.addNotes(notes);
    return s;
  };

  /**
   * Standard content frame: kicker (section tracker), takeaway headline, optional unit/subtitle line,
   * source footer, evidence tag, speaker notes. Returns the slide; s._top is the content start y.
   */
  deck.content = ({ kicker, title, subtitle, source: src, evidence, notes }) => {
    const s = pres.addSlide({ masterName: "EP_CONTENT" }); n++;
    if (kicker) s.addText(kicker.toUpperCase(), { x: G.mx, y: G.kickerY, w: 8, h: G.kickerH, fontFace: F.body, fontSize: T.kicker, bold: true, charSpacing: 1.5, color: ensureContrast(P.accent, P.bg), margin: 0, isTextBox: true, objectName: "Kicker" });
    // pptxgenjs ignores fontSize on placeholder options, so the fitted size goes on the run
    s.addText([{ text: title, options: { fontSize: fitPt(title, G.cw - 2.2, G.titleH, T.headline, 18, true, 1.17) } }], { placeholder: "title", align: "left" });
    if (subtitle) s.addText(subtitle, { x: G.mx, y: G.subY, w: G.cw, h: G.subH, fontFace: F.body, fontSize: T.sub, color: P.muted, margin: 0, valign: "top", isTextBox: true, objectName: "Subtitle" });
    evidenceTag(s, evidence, false);
    source(s, src);
    if (notes) s.addNotes(notes);
    s._top = subtitle ? G.bodyTop : G.bodyTopNoSub;
    return s;
  };

  // ----- pattern builders (slide-patterns.md) -----

  /** Executive summary: recommendation banner + numbered key messages (pyramid). */
  deck.execSummary = (s, { recommendation, messages, y = s._top, h = G.bodyBottom - s._top }) => {
    let top = y;
    if (recommendation) {
      const rh = 1.0;
      s.addShape(pres.shapes.RECTANGLE, { x: G.mx, y: top, w: G.cw, h: rh, fill: { color: P.dark }, line: { type: "none" }, objectName: "Recommendation band" });
      s.addShape(pres.shapes.RECTANGLE, { x: G.mx, y: top, w: 0.08, h: rh, fill: { color: P.accent }, line: { type: "none" } });
      s.addText("RECOMMENDATION", { x: G.mx + 0.3, y: top + 0.14, w: 3, h: 0.24, fontFace: F.body, fontSize: 9, bold: true, charSpacing: 1.5, color: P.onDarkMuted, margin: 0, isTextBox: true });
      s.addText(recommendation, { x: G.mx + 0.3, y: top + 0.38, w: G.cw - 0.6, h: rh - 0.46, fontFace: F.head, fontSize: fitPt(recommendation, G.cw - 0.6, rh - 0.46, 16, 12, true), bold: true, color: P.onDark, valign: "top", margin: 0, isTextBox: true });
      top += rh + 0.3;
    }
    const rows = messages.length, gap = 0.18;
    const rowH = (y + h - top - gap * (rows - 1)) / rows;
    messages.forEach((m, i) => {
      const ry = top + i * (rowH + gap);
      s.addText(String(i + 1), { x: G.mx, y: ry, w: 0.46, h: 0.46, shape: pres.shapes.OVAL, fill: { color: P.accent }, line: { type: "none" }, fontFace: F.head, fontSize: 13, bold: true, color: textOn(P.accent, P), align: "center", valign: "middle", margin: 0 });
      s.addText(m.head, { x: G.mx + 0.7, y: ry, w: 3.9, h: rowH, fontFace: F.head, fontSize: fitPt(m.head, 3.9, rowH, 15, 11, true), bold: true, color: P.ink, valign: "top", margin: 0, isTextBox: true });
      s.addText(m.body, { x: G.mx + 4.9, y: ry, w: G.cw - 4.9, h: rowH, fontFace: F.body, fontSize: fitPt(m.body, G.cw - 4.9, rowH, T.body, 10), color: P.body, valign: "top", margin: 0, isTextBox: true });
      if (i < rows - 1) s.addShape(pres.shapes.LINE, { x: G.mx + 0.7, y: ry + rowH + gap / 2, w: G.cw - 0.7, h: 0, line: { color: P.rule, width: 0.5 } });
    });
  };

  /**
   * Native chart + takeaway panel. chart: { type: "bar"|"col"|"line"|"stacked", labels, series:[{name, values}],
   * highlight: index (single-series: colour one point), unit: "%", valueFormat: "0" }.
   * panel: { title, points: [..], callout: {value, label} }
   */
  deck.chartPanel = (s, { chart, panel, y = s._top, h = G.bodyBottom - s._top, chartW = 7.9 }) => {
    const panelY = y, panelH = h;
    if (chart.title) {
      s.addText(chart.title, { x: G.mx, y, w: chartW, h: 0.28, fontFace: F.head, fontSize: 12, bold: true, color: P.ink, margin: 0, isTextBox: true, objectName: "Chart title" });
      if (chart.unit || chart.key) {
        const runs = [{ text: chart.unit || "", options: { color: P.muted } }];
        (chart.key || []).forEach((k) => {
          runs.push({ text: "    ■ ", options: { color: hex(k.color), bold: true } });
          runs.push({ text: k.label, options: { color: P.body } });
        });
        s.addText(runs, { x: G.mx, y: y + 0.28, w: chartW, h: 0.24, fontFace: F.body, fontSize: 10.5, margin: 0, isTextBox: true, objectName: "Chart unit" });
      }
      const used = chart.unit || chart.key ? 0.6 : 0.36; y += used; h -= used;
    }
    const single = chart.series.length === 1;
    const kind = chart.type === "line" ? pres.charts.LINE : pres.charts.BAR;
    const colors = chart.colors ? chart.colors.map(hex) : single && chart.highlight != null
      ? chart.labels.map((_, i) => (i === chart.highlight ? P.accent : P.context))
      : P.series.slice(0, chart.series.length);
    const opts = {
      x: G.mx, y, w: chartW, h,
      barDir: chart.type === "bar" ? "bar" : "col",
      barGrouping: chart.type === "stacked" ? "stacked" : "clustered",
      barGapWidthPct: 60,
      chartColors: colors,
      showLegend: !single && !chart.key, legendPos: "t", legendFontFace: F.body, legendFontSize: 11, legendColor: P.body,
      showValue: true, dataLabelFontFace: F.body, dataLabelFontSize: 11, dataLabelColor: chart.type === "stacked" ? P.onDark : P.body,
      dataLabelPosition: chart.type === "stacked" ? "ctr" : (chart.type === "line" ? "t" : "outEnd"),
      dataLabelFormatCode: chart.valueFormat || "General",
      catAxisLabelFontFace: F.body, catAxisLabelFontSize: 11, catAxisLabelColor: P.body,
      catAxisLineShow: true, catAxisLineColor: P.rule,
      valAxisHidden: true, valGridLine: { style: "none" }, catGridLine: { style: "none" },
      valAxisLabelFontSize: 10, valAxisMinVal: chart.min != null ? chart.min : 0,
      lineSize: 2.5, lineDataSymbol: "circle", lineDataSymbolSize: 7,
      objectName: chart.name || "Chart",
    };
    if (chart.type === "bar") opts.catAxisOrientation = "maxMin"; // first category at top
    if (chart.max != null) opts.valAxisMaxVal = chart.max;
    s.addChart(kind, chart.series.map((sr) => ({ name: sr.name, labels: chart.labels, values: sr.values })), opts);
    if (panel) deck.takeaways(s, { ...panel, x: G.mx + chartW + G.gutter, y: panelY, w: G.cw - chartW - G.gutter, h: panelH });
  };

  /** Right-hand "so what" panel: optional big-number callout + bullet takeaways. */
  deck.takeaways = (s, { title = "What this means", points = [], callout, x, y, w, h }) => {
    s.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: P.tint }, line: { type: "none" }, objectName: "Takeaway panel" });
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 0.06, h, fill: { color: P.accent }, line: { type: "none" } });
    let ty = y + 0.25;
    s.addText(title.toUpperCase(), { x: x + 0.3, y: ty, w: w - 0.5, h: 0.26, fontFace: F.body, fontSize: 9.5, bold: true, charSpacing: 1.5, color: P.accentText, margin: 0, isTextBox: true });
    ty += 0.42;
    if (callout) {
      s.addText(callout.value, { x: x + 0.3, y: ty, w: w - 0.5, h: 0.7, fontFace: F.head, fontSize: 34, bold: true, color: P.ink, margin: 0, valign: "top", isTextBox: true });
      s.addText(callout.label, { x: x + 0.3, y: ty + 0.72, w: w - 0.5, h: 0.5, fontFace: F.body, fontSize: 11, color: P.mutedOnTint, margin: 0, valign: "top", isTextBox: true });
      ty += 1.4;
    }
    const bh = y + h - ty - 0.2;
    const joined = points.join("\n");
    const pt = fitPt(joined + "\n".repeat(points.length), w - 0.75, bh, T.body, 10);
    s.addText(points.map((p, i) => ({ text: p, options: { bullet: { indent: 14 }, paraSpaceAfter: 8, breakLine: i < points.length - 1 } })),
      { x: x + 0.3, y: ty, w: w - 0.5, h: bh, fontFace: F.body, fontSize: pt, color: P.body, valign: "top", margin: 0, isTextBox: true });
  };

  /**
   * Comparison table (native). columns: [first header, ...option names]; rows: [[criterion, ...cells]].
   * Cell may be string or {text, rating: 0-4} (rating drawn as filled/empty dots). recommended: column index.
   */
  deck.comparisonTable = (s, { columns, rows, recommended, y = s._top, h, colW, verdict }) => {
    const firstW = 3.0;
    const restW = (G.cw - firstW) / (columns.length - 1);
    const widths = colW || [firstW, ...columns.slice(1).map(() => restW)];
    const dots = (r) => "●".repeat(r) + "○".repeat(4 - r);
    const hdr = columns.map((c, i) => {
      const fill = i === recommended ? P.accent : P.dark;
      return { text: i === recommended ? `${c}  ★` : c, options: { bold: true, color: textOn(fill, P), fill: { color: fill }, fontSize: 12, valign: "middle", align: i === 0 ? "left" : "center" } };
    });
    const zebra = mix(P.tint, "FFFFFF", 0.4);
    const body = rows.map((r, ri) => r.map((cell, i) => {
      const isObj = typeof cell === "object" && cell !== null;
      const text = isObj ? (cell.rating != null ? `${dots(cell.rating)}${cell.text ? "\n" + cell.text : ""}` : cell.text) : cell;
      return { text, options: {
        bold: i === 0, color: i === 0 ? P.ink : P.body, align: i === 0 ? "left" : "center", valign: "middle",
        fill: { color: i === recommended ? mix(P.accent, "FFFFFF", 0.9) : ri % 2 ? zebra : P.bg }, fontSize: 11,
      } };
    }));
    // fit the rows (and the verdict line) above the footer
    const room = (h || G.bodyBottom - y) - 0.5 - (verdict && !h ? 0.6 : 0);
    const rowH = h ? (h - 0.5) / rows.length : Math.min(0.62, room / rows.length);
    s.addTable([hdr, ...body], {
      x: G.mx, y, w: G.cw, colW: widths, rowH: [0.5, ...rows.map(() => rowH)],
      fontFace: F.body, border: { type: "solid", pt: 0.75, color: P.rule }, margin: [4, 8, 4, 8], objectName: "Comparison table",
    });
    if (verdict) {
      const vy = y + 0.5 + rowH * rows.length + 0.2;
      s.addText([{ text: "Verdict  ", options: { bold: true, color: P.accent } }, { text: verdict, options: { color: P.ink } }],
        { x: G.mx, y: vy, w: G.cw, h: 0.4, fontFace: F.body, fontSize: 12, margin: 0, valign: "top", isTextBox: true });
    }
  };

  /** Prioritisation 2x2: items {label, x:0-1, y:0-1, focus?:bool}. Quadrant names TL,TR,BL,BR. */
  deck.matrix2x2 = (s, { xLabel, yLabel, quadrants = [], items = [], x = G.mx + 0.4, y = s._top, w = 7.4, h = G.bodyBottom - s._top - 0.35, panel }) => {
    const qw = w / 2, qh = h / 2;
    [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([cx, cy], i) => {
      const fill = i === 1 ? mix(P.accent, "FFFFFF", 0.88) : P.tint;
      s.addShape(pres.shapes.RECTANGLE, { x: x + cx * qw, y: y + cy * qh, w: qw - 0.04, h: qh - 0.04, fill: { color: fill }, line: { type: "none" } });
      if (quadrants[i]) s.addText(quadrants[i].toUpperCase(), { x: x + cx * qw + 0.15, y: y + cy * qh + 0.1, w: qw - 0.3, h: 0.26, fontFace: F.body, fontSize: 9, bold: true, charSpacing: 1, color: i === 1 ? P.accentTextOnFocus : P.mutedOnTint, margin: 0, isTextBox: true });
    });
    s.addText(yLabel + "  →", { x: x - 0.27 - h / 2, y: y + h / 2 - 0.175, w: h, h: 0.35, fontFace: F.body, fontSize: 11, bold: true, color: P.body, rotate: 270, align: "center", valign: "middle", margin: 0, isTextBox: true });
    s.addText(xLabel + "  →", { x, y: y + h + 0.05, w, h: 0.3, fontFace: F.body, fontSize: 11, bold: true, color: P.body, align: "center", margin: 0, isTextBox: true });
    items.forEach((it) => {
      const d = it.focus ? 0.34 : 0.26;
      const cx = x + it.x * w, cy = y + (1 - it.y) * h;
      s.addShape(pres.shapes.OVAL, { x: cx - d / 2, y: cy - d / 2, w: d, h: d, fill: { color: it.focus ? P.accent : P.context }, line: { color: P.bg, width: 1.5 }, objectName: `Item ${it.label}` });
      // keep each label inside its own quadrant where possible
      const lw = Math.min(2.6, 0.15 + it.label.length * (it.focus ? 0.078 : 0.072));
      const qRight = it.x < 0.5 ? x + w / 2 - 0.05 : x + w - 0.05, qLeft = it.x < 0.5 ? x + 0.05 : x + w / 2 + 0.05;
      const fitsR = cx + d / 2 + 0.08 + lw <= qRight, fitsL = cx - d / 2 - 0.08 - lw >= qLeft;
      const right = it.side ? it.side === "right" : (fitsR || !fitsL);
      s.addText(it.label, { x: right ? cx + d / 2 + 0.08 : cx - d / 2 - 0.08 - lw, y: cy - 0.2, w: lw, h: 0.4, fontFace: F.body, fontSize: 11, bold: !!it.focus, color: it.focus ? P.ink : P.body, align: right ? "left" : "right", valign: "middle", margin: 0, isTextBox: true });
    });
    if (panel) deck.takeaways(s, { ...panel, x: x + w + 0.4, y, w: G.W - G.mx - (x + w + 0.4), h: h + 0.35 });
  };

  /** Process / workflow chevrons with optional pain-point row. steps: [{title, body, pain?}] */
  deck.processFlow = (s, { steps, y = s._top, h = 2.4, painLabel = "Where time is lost", painY, painH = 1.6 }) => {
    const gap = 0.08, n = steps.length, w = (G.cw - gap * (n - 1)) / n;
    steps.forEach((st, i) => {
      const x = G.mx + i * (w + gap);
      const fill = st.focus ? P.accent : (i % 2 ? mix(P.dark, "FFFFFF", 0.12) : P.dark);
      s.addText(st.title, { x, y, w, h: 0.75, shape: i === 0 ? pres.shapes.PENTAGON : pres.shapes.CHEVRON, fill: { color: fill }, line: { type: "none" }, fontFace: F.head, fontSize: fitPt(st.title, w - 0.5, 0.7, 13, 10, true), bold: true, color: textOn(fill, P), align: "center", valign: "middle", margin: [i === 0 ? 8 : 20, 14, 0, 0], objectName: `Step ${i + 1}` });
      s.addText(st.body, { x: x + 0.05, y: y + 0.9, w: w - 0.15, h: h - 0.9, fontFace: F.body, fontSize: fitPt(st.body, w - 0.15, h - 0.9, 13, 9.5), color: P.body, valign: "top", margin: 0, isTextBox: true });
    });
    const withPain = steps.filter((st) => st.pain);
    if (withPain.length) {
      const py = painY || y + h + 0.25;
      s.addText(painLabel.toUpperCase(), { x: G.mx, y: py, w: 6, h: 0.26, fontFace: F.body, fontSize: 9.5, bold: true, charSpacing: 1.5, color: ensureContrast(P.warning, P.bg), margin: 0, isTextBox: true });
      steps.forEach((st, i) => {
        if (!st.pain) return;
        const x = G.mx + i * (w + gap);
        const ph = Math.min(painH, G.bodyBottom - (py + 0.35));
        s.addShape(pres.shapes.RECTANGLE, { x, y: py + 0.35, w: w - 0.05, h: ph, fill: { color: mix(P.warning, "FFFFFF", 0.9) }, line: { color: mix(P.warning, "FFFFFF", 0.55), width: 0.75 } });
        s.addText(st.pain, { x: x + 0.12, y: py + 0.45, w: w - 0.3, h: ph - 0.2, fontFace: F.body, fontSize: fitPt(st.pain, w - 0.3, ph - 0.2, 12.5, 9), color: P.ink, valign: "top", margin: 0, isTextBox: true });
      });
    }
  };

  /**
   * Gantt roadmap. periods: ["M1",…]; lanes: [{name, bars:[{start, end, label, focus?}]}] (period indices, end exclusive);
   * milestones: [{at, label}] (fractional period index allowed).
   */
  deck.roadmap = (s, { periods, lanes, milestones = [], y = s._top, h = G.bodyBottom - s._top, laneW = 2.6 }) => {
    const gx = G.mx + laneW, gw = G.cw - laneW, pw = gw / periods.length;
    const headH = 0.4, msH = milestones.length ? 0.55 : 0;
    const laneH = (h - headH - msH) / lanes.length;
    periods.forEach((p, i) => {
      s.addText(p, { x: gx + i * pw, y, w: pw, h: headH, fontFace: F.body, fontSize: 11, bold: true, color: P.muted, align: "center", valign: "middle", margin: 0, isTextBox: true });
      if (i > 0) s.addShape(pres.shapes.LINE, { x: gx + i * pw, y: y + headH, w: 0, h: h - headH, line: { color: P.rule, width: 0.5, dashType: "dash" } });
    });
    s.addShape(pres.shapes.LINE, { x: G.mx, y: y + headH, w: G.cw, h: 0, line: { color: P.rule, width: 0.75 } });
    const my = y + h - msH;
    lanes.forEach((ln, li) => {
      const ly = y + headH + li * laneH;
      if (li % 2 === 0) s.addShape(pres.shapes.RECTANGLE, { x: G.mx, y: ly, w: G.cw, h: laneH, fill: { color: mix(P.tint, "FFFFFF", 0.4) }, line: { type: "none" } });
    });
    milestones.forEach((m) => { // behind the bars
      const mx = gx + m.at * pw;
      s.addShape(pres.shapes.LINE, { x: mx, y: y + headH, w: 0, h: my - y - headH + 0.05, line: { color: P.ink, width: 1.25, dashType: "dash" } });
    });
    lanes.forEach((ln, li) => {
      const ly = y + headH + li * laneH;
      s.addText(ln.name, { x: G.mx + 0.1, y: ly, w: laneW - 0.2, h: laneH, fontFace: F.head, fontSize: 12, bold: true, color: P.ink, valign: "middle", margin: 0, isTextBox: true });
      ln.bars.forEach((b) => {
        const bh = Math.min(0.46, laneH * 0.62);
        const fill = b.focus ? P.accent : mix(P.dark, "FFFFFF", 0.2);
        const bw = (b.end - b.start) * pw - 0.08;
        s.addText(b.label, { x: gx + b.start * pw + 0.04, y: ly + (laneH - bh) / 2, w: bw, h: bh, shape: pres.shapes.ROUNDED_RECTANGLE, rectRadius: 0.05, fill: { color: fill }, line: { type: "none" }, fontFace: F.body, fontSize: fitPt(b.label, bw - 0.1, bh, 11, 8.5, true), bold: true, color: textOn(fill, P), align: "left", valign: "middle", margin: [7, 5, 0, 0], objectName: `Bar ${b.label}` });
      });
    });
    milestones.forEach((m) => {
      const mx = gx + m.at * pw;
      s.addShape(pres.shapes.DIAMOND, { x: mx - 0.1, y: my + 0.02, w: 0.2, h: 0.2, fill: { color: P.ink }, line: { type: "none" } });
      s.addText(m.label, { x: mx - 1.0, y: my + 0.24, w: 2.0, h: 0.3, fontFace: F.body, fontSize: 10, bold: true, color: P.ink, align: "center", valign: "top", margin: 0, isTextBox: true });
    });
  };

  /** KPI / success-measure tiles. tiles: [{value, label, note}] */
  deck.kpiTiles = (s, { tiles, x = G.mx, y = s._top, w = G.cw, h = 1.6 }) => {
    const gap = 0.2, tw = (w - gap * (tiles.length - 1)) / tiles.length;
    tiles.forEach((t, i) => {
      const tx = x + i * (tw + gap);
      s.addShape(pres.shapes.RECTANGLE, { x: tx, y, w: tw, h, fill: { color: P.bg }, line: { color: P.rule, width: 0.75 } });
      s.addShape(pres.shapes.RECTANGLE, { x: tx, y, w: tw, h: 0.06, fill: { color: P.accent }, line: { type: "none" } });
      s.addText(t.value, { x: tx + 0.2, y: y + 0.2, w: tw - 0.4, h: 0.6, fontFace: F.head, fontSize: fitPt(t.value, tw - 0.4, 0.6, 28, 16, true), bold: true, color: P.ink, margin: 0, valign: "top", isTextBox: true });
      s.addText(t.label, { x: tx + 0.2, y: y + 0.82, w: tw - 0.4, h: h - 0.95, fontFace: F.body, fontSize: fitPt(t.label + (t.note ? "\n" + t.note : ""), tw - 0.4, h - 0.95, 11.5, 9), color: P.body, margin: 0, valign: "top", isTextBox: true });
      if (t.note) s.addText(t.note, { x: tx + 0.2, y: y + h - 0.36, w: tw - 0.4, h: 0.28, fontFace: F.body, fontSize: 9, color: P.muted, margin: 0, valign: "top", isTextBox: true });
    });
  };

  /** Risk register: rows [{risk, level:"High|Med|Low", mitigation}] as a native table. */
  deck.riskTable = (s, { rows, x = G.mx, y = s._top, w = G.cw, colW, fontSize = 11, rowH }) => {
    const lvl = { High: P.negative, Med: P.warning, Medium: P.warning, Low: P.positive };
    const widths = colW || [w * 0.38, w * 0.12, w * 0.5];
    const hdr = ["Risk", "Exposure", "Mitigation"].map((t, i) => ({ text: t, options: { bold: true, color: textOn(P.dark, P), fill: { color: P.dark }, align: i === 1 ? "center" : "left" } }));
    const zebra = mix(P.tint, "FFFFFF", 0.4);
    const body = rows.map((r, ri) => [
      { text: r.risk, options: { bold: true, color: P.ink } },
      { text: r.level, options: { bold: true, color: ensureContrast(lvl[r.level] || P.body, ri % 2 ? zebra : P.bg), align: "center" } },
      { text: r.mitigation, options: { color: P.body } },
    ].map((c) => ({ ...c, options: { ...c.options, fill: { color: ri % 2 ? zebra : P.bg } } })));
    s.addTable([hdr, ...body], { x, y, w, colW: widths, ...(rowH ? { rowH: [0.4, ...rows.map(() => rowH)] } : {}), fontFace: F.body, fontSize, valign: "middle", border: { type: "solid", pt: 0.75, color: P.rule }, margin: [5, 8, 5, 8], objectName: "Risk table" });
  };

  /** Two-column labelled lists (e.g. "Assumptions | Open questions"). */
  deck.twoColumns = (s, { left, right, y = s._top, h = G.bodyBottom - s._top }) => {
    const w = (G.cw - G.gutter) / 2, hh = 0.46, bw = w - 0.5;
    const joined = (col) => col.items.join("\n") + "\n".repeat(col.items.length);
    const fits = [left, right].filter(Boolean).map((col) => fitPt(joined(col), bw - 0.25, h - hh - 0.4, T.body, 9.5));
    // panels hug the longer column's text instead of always filling the content area
    const need = Math.max(...[left, right].filter(Boolean).map((col, k) => estLines(joined(col), bw - 0.25, fits[k]) * fits[k] * 1.2 / 72));
    const ph = Math.min(h, hh + need + 0.6);
    [left, right].forEach((col, i) => {
      if (!col) return;
      const x = G.mx + i * (w + G.gutter);
      const fill = i === 0 ? P.dark : mix(P.dark, "FFFFFF", 0.18);
      s.addShape(pres.shapes.RECTANGLE, { x, y, w, h: ph, fill: { color: P.tint }, line: { type: "none" }, objectName: "Column panel" });
      s.addText(col.title.toUpperCase(), { x, y, w, h: hh, shape: pres.shapes.RECTANGLE, fill: { color: fill }, line: { type: "none" }, fontFace: F.body, fontSize: 10.5, bold: true, charSpacing: 1.5, color: textOn(fill, P), valign: "middle", margin: [16, 16, 0, 0], objectName: "Column header" });
      const txt = col.items.map((it, k) => ({ text: it, options: { bullet: { indent: 14 }, paraSpaceAfter: 8, breakLine: k < col.items.length - 1 } }));
      s.addText(txt, { x: x + 0.25, y: y + hh + 0.22, w: bw, h: ph - hh - 0.4, fontFace: F.body, fontSize: Math.min(...fits), color: P.body, valign: "top", margin: 0, isTextBox: true });
    });
  };

  /**
   * Numbered card grid for 2–6 parallel points (replaces a bullet list). A point written "Head: detail"
   * gets a bold head line. Rows: ≤3 points → one row, 4 → 2×2, 5–6 → 3×2.
   */
  deck.cards = (s, { points, y = s._top, h = G.bodyBottom - s._top }) => {
    const n = points.length, cols = n === 4 ? 2 : Math.min(3, n), rows = Math.ceil(n / cols), gap = 0.25;
    const cw = (G.cw - gap * (cols - 1)) / cols;
    const ch = rows === 1 ? Math.min(h, 3.4) : (h - gap) / 2;
    points.forEach((p, i) => {
      const cx = G.mx + (i % cols) * (cw + gap), cy = y + Math.floor(i / cols) * (ch + gap);
      const m = /^([^:]{2,40}):\s+(.+)$/s.exec(p);
      const head = m ? m[1] : null, body = m ? m[2] : p;
      s.addShape(pres.shapes.RECTANGLE, { x: cx, y: cy, w: cw, h: ch, fill: { color: P.bg }, line: { color: P.rule, width: 0.75 }, objectName: `Card ${i + 1}` });
      s.addShape(pres.shapes.RECTANGLE, { x: cx, y: cy, w: cw, h: 0.07, fill: { color: P.accent }, line: { type: "none" } });
      s.addText(String(i + 1).padStart(2, "0"), { x: cx + 0.25, y: cy + 0.25, w: 1.0, h: 0.45, fontFace: F.head, fontSize: 22, bold: true, color: ensureContrast(P.accent, P.bg), margin: 0, valign: "top", isTextBox: true });
      let ty = cy + 0.8;
      if (head) {
        const pt = fitPt(head, cw - 0.5, 0.7, T.h3, 11, true, 1.17);
        const hh = estLines(head, cw - 0.6, pt, true) * pt * 1.17 / 72 + 0.12;
        s.addText(head, { x: cx + 0.25, y: ty, w: cw - 0.5, h: hh, fontFace: F.head, fontSize: pt, bold: true, color: P.ink, margin: 0, valign: "top", isTextBox: true });
        ty += hh + 0.05;
      }
      const bh = cy + ch - ty - 0.2;
      s.addText(body, { x: cx + 0.25, y: ty, w: cw - 0.5, h: bh, fontFace: F.body, fontSize: fitPt(body, cw - 0.5, bh, T.body, 10, false, 1.17), color: P.body, margin: 0, valign: "top", isTextBox: true });
    });
  };

  /** Agenda list with optional active item. */
  deck.agenda = (s, { items, active, y = s._top }) => {
    items.forEach((it, i) => {
      const iy = y + i * 0.72;
      const on = i === active;
      s.addText(String(i + 1).padStart(2, "0"), { x: G.mx, y: iy, w: 0.8, h: 0.5, fontFace: F.head, fontSize: 20, bold: true, color: on ? P.accent : P.muted, margin: 0, valign: "middle", isTextBox: true });
      s.addText(it, { x: G.mx + 0.9, y: iy, w: 9, h: 0.5, fontFace: F.head, fontSize: 18, bold: on, color: on ? P.ink : P.body, margin: 0, valign: "middle", isTextBox: true });
    });
  };

  /** Free text body (use sparingly). */
  deck.text = (s, text, o = {}) => s.addText(text, { x: G.mx, y: s._top, w: G.cw, h: 1, fontFace: F.body, fontSize: T.body, color: P.body, valign: "top", margin: 0, isTextBox: true, ...o });

  /** Write the file, then stamp brand colours/fonts into the theme so PowerPoint's pickers match. */
  deck.save = async (file) => {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    await pres.writeFile({ fileName: file });
    await applyBrandTheme(file, P, F, brand.company || "Brand");
    return file;
  };

  deck.count = () => n;
  return deck;
}

/**
 * Logos from the brand spec: brand.logos = { subject, presenting, placement: "title"|"titleAndClosing"|"footer" },
 * each { path, aspect }. A legacy single brand.logo is treated as the subject logo.
 */
function resolveLogos(brand) {
  const L = brand.logos || {};
  const asset = (l) => (l && l.path ? { path: resolveAsset(l.path, brand.__dir), aspect: l.aspect || 3.3 } : null);
  return { subject: asset(L.subject) || asset(brand.logo), presenting: asset(L.presenting), placement: L.placement || "title" };
}

/** Largest {w, h} with the logo's aspect ratio inside maxH × maxW. */
function fitLogo(L, maxH, maxW) {
  let h = maxH, w = h * L.aspect;
  if (w > maxW) { w = maxW; h = w / L.aspect; }
  return { w, h };
}

function resolveAsset(p, baseDir) {
  if (path.isAbsolute(p)) return p;
  const cands = [baseDir && path.join(baseDir, p), path.resolve(p)].filter(Boolean);
  return cands.find((c) => fs.existsSync(c)) || p;
}

const xmlEsc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function applyBrandTheme(file, P, F, name) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const themes = Object.keys(zip.files).filter((f) => /^ppt\/theme\/theme\d+\.xml$/.test(f));
  const scheme = `<a:clrScheme name="${xmlEsc(name)}">` +
    `<a:dk1><a:srgbClr val="${P.ink}"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>` +
    `<a:dk2><a:srgbClr val="${P.dark}"/></a:dk2><a:lt2><a:srgbClr val="${P.tint}"/></a:lt2>` +
    P.series.concat([P.accent2, P.muted, P.positive, P.warning, P.negative]).slice(0, 6)
      .map((c, i) => `<a:accent${i + 1}><a:srgbClr val="${c}"/></a:accent${i + 1}>`).join("") +
    `<a:hlink><a:srgbClr val="${P.accent}"/></a:hlink><a:folHlink><a:srgbClr val="${P.accent2}"/></a:folHlink></a:clrScheme>`;
  for (const t of themes) {
    let xml = await zip.file(t).async("string");
    xml = xml.replace(/<a:clrScheme[\s\S]*?<\/a:clrScheme>/, scheme)
      .replace(/(<a:majorFont>\s*<a:latin typeface=")[^"]*/, `$1${xmlEsc(F.head)}`)
      .replace(/(<a:minorFont>\s*<a:latin typeface=")[^"]*/, `$1${xmlEsc(F.body)}`);
    zip.file(t, xml);
  }
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}

/** Load a brand JSON and remember its directory so relative logo paths resolve. */
function loadBrand(file) {
  const b = JSON.parse(fs.readFileSync(file, "utf8"));
  b.__dir = path.dirname(path.resolve(file));
  return b;
}

module.exports = { createDeck, loadBrand, resolvePalette, contrast, mix, fitPt, estLines, G, T, EVIDENCE };
