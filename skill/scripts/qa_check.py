#!/usr/bin/env python3
"""Automated layout QA for a generated .pptx (complements visual review of rendered PNGs).

Usage:
  qa_check.py deck.pptx [--min-font 8] [--strict]

Checks per slide:
  - shapes outside the slide canvas
  - text that will not fit its box (measured with real font metrics when available)
  - text boxes overlapping other text boxes
  - font sizes below the minimum
  - text/background contrast below WCAG AA (4.5:1 normal, 3:1 for >=14pt bold / >=18pt)
  - chart or table slides without a "Source" line
  - tables whose wrapped height runs past the footer
  - pictures (reported so flattened content is noticed; logos are expected)
Exit code 1 when any ERROR is found (WARN never fails unless --strict).
"""
import argparse
import pathlib
import sys

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE_TYPE
from pptx.util import Emu

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from contrast import ratio  # noqa: E402

try:
    from PIL import ImageFont
except ImportError:  # metrics fall back to an average-width estimate
    ImageFont = None

FONT_FILES = {
    "regular": ["/System/Library/Fonts/Supplemental/Arial.ttf", "/Library/Fonts/Arial.ttf",
                "/usr/share/fonts/truetype/msttcorefonts/Arial.ttf",
                "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"],
    "bold": ["/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/Library/Fonts/Arial Bold.ttf",
             "/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf",
             "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"],
}
_font_cache = {}
FOOTER_TOP_IN = 6.86  # design-system.md: content must end above the footer rule


def font(size, bold):
    key = (round(size * 4), bold)
    if key in _font_cache:
        return _font_cache[key]
    f = None
    if ImageFont:
        for p in FONT_FILES["bold" if bold else "regular"]:
            if pathlib.Path(p).exists():
                f = ImageFont.truetype(p, max(1, int(round(size * 10))))  # 10x for sub-pt precision
                break
    _font_cache[key] = f
    return f


def text_width_pt(text, size, bold):
    f = font(size, bold)
    if f is None:
        return len(text) * size * (0.56 if bold else 0.5)
    return f.getlength(text) / 10.0


def wrap_lines(text, width_pt, size, bold):
    lines = 0
    for para in text.split("\n"):
        words = para.split(" ")
        cur = ""
        n = 1
        for w in words:
            trial = (cur + " " + w).strip()
            if text_width_pt(trial, size, bold) <= width_pt or not cur:
                cur = trial
            else:
                n += 1
                cur = w
        lines += n
    return lines


def para_runs(tf):
    """Yield (text, size_pt, bold, color_hex) per paragraph, using the largest run size."""
    for p in tf.paragraphs:
        txt = "".join(r.text for r in p.runs)
        sizes = [r.font.size.pt for r in p.runs if r.font.size]
        bold = any(r.font.bold for r in p.runs)
        color = None
        for r in p.runs:
            try:
                if r.font.color and r.font.color.type is not None and r.font.color.rgb is not None:
                    color = str(r.font.color.rgb)
                    break
            except AttributeError:
                pass
        yield txt, (max(sizes) if sizes else None), bold, color


def fill_hex(shape):
    try:
        if shape.fill.type == 1:  # solid
            return str(shape.fill.fore_color.rgb)
    except (AttributeError, TypeError, ValueError):
        pass
    return None


def slide_bg(slide):
    for src in (slide, slide.slide_layout, slide.slide_layout.slide_master):
        try:
            f = src.background.fill
            if f.type == 1:
                return str(f.fore_color.rgb)
        except (AttributeError, TypeError, ValueError):
            continue
    return "FFFFFF"


def box(shape):
    """Visual bounding box in inches (rotation of ~90/270 degrees swaps width and height about the centre)."""
    x, y = Emu(shape.left).inches, Emu(shape.top).inches
    w, h = Emu(shape.width).inches, Emu(shape.height).inches
    rot = (getattr(shape, "rotation", 0) or 0) % 180
    if 45 < rot < 135:
        cx, cy = x + w / 2, y + h / 2
        x, y, w, h = cx - h / 2, cy - w / 2, h, w
    return (x, y, w, h)


def inter(a, b):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    w = min(ax + aw, bx + bw) - max(ax, bx)
    h = min(ay + ah, by + bh) - max(ay, by)
    return w * h if w > 0 and h > 0 else 0.0


def contains(outer, pt):
    x, y, w, h = outer
    return x <= pt[0] <= x + w and y <= pt[1] <= y + h


def check(path, min_font, strict):
    prs = Presentation(path)
    SW, SH = Emu(prs.slide_width).inches, Emu(prs.slide_height).inches
    errors = warns = 0
    summary = {"text": 0, "chart": 0, "table": 0, "picture": 0, "shape": 0}

    def report(level, sn, msg):
        nonlocal errors, warns
        if level == "ERROR":
            errors += 1
        else:
            warns += 1
        print(f"{level:5s} slide {sn:2d}: {msg}")

    for sn, slide in enumerate(prs.slides, 1):
        bg = slide_bg(slide)
        shapes = list(slide.shapes)
        filled = [(box(s), fill_hex(s)) for s in shapes if fill_hex(s) and not s.has_text_frame or (s.has_text_frame and fill_hex(s))]
        text_boxes = []
        has_data = has_source = False
        for s in shapes:
            name = s.name or ""
            b = box(s)
            if s.shape_type == MSO_SHAPE_TYPE.PICTURE:
                summary["picture"] += 1
                if "logo" not in name.lower():
                    report("WARN", sn, f"picture '{name}' — confirm it is not flattened slide content")
            if getattr(s, "has_chart", False) and s.has_chart:
                summary["chart"] += 1
                has_data = True
            if getattr(s, "has_table", False) and s.has_table:
                summary["table"] += 1
                has_data = True
                # wrapped table height vs footer
                tbl = s.table
                total = 0.0
                for r_i, row in enumerate(tbl.rows):
                    row_h = Emu(row.height).inches
                    need = 0.0
                    for c_i, cell in enumerate(row.cells):
                        cw = Emu(tbl.columns[c_i].width).inches
                        inner = cw * 72 - 16
                        lines_h = 0.0
                        for txt, size, bold, _ in para_runs(cell.text_frame):
                            size = size or 11
                            lines_h += wrap_lines(txt, inner, size, bold) * size * 1.2
                        need = max(need, (lines_h + 10) / 72)
                    total += max(row_h, need)
                if b[1] + total > FOOTER_TOP_IN + 0.02:
                    report("ERROR", sn, f"table '{name}' wraps to ~{total:.2f}in tall and runs into the footer (ends {b[1] + total:.2f}in)")
            if "source" in name.lower():
                has_source = True
            # off-canvas
            if b[0] < -0.01 or b[1] < -0.01 or b[0] + b[2] > SW + 0.01 or b[1] + b[3] > SH + 0.01:
                report("ERROR", sn, f"'{name}' extends off the slide ({b[0]:.2f},{b[1]:.2f},{b[2]:.2f}x{b[3]:.2f})")
            if s.has_text_frame and s.text_frame.text.strip():
                summary["text"] += 1
                tf = s.text_frame
                rot = (getattr(s, "rotation", 0) or 0) % 180
                w_in, h_in = (b[3], b[2]) if 45 < rot < 135 else (b[2], b[3])
                ins_lr = (Emu(tf.margin_left or 0).inches + Emu(tf.margin_right or 0).inches) if tf.margin_left is not None else 0.2
                ins_tb = (Emu(tf.margin_top or 0).inches + Emu(tf.margin_bottom or 0).inches) if tf.margin_top is not None else 0.1
                width_pt = max(1.0, (w_in - ins_lr) * 72)
                need_pt = 0.0
                own_fill = fill_hex(s)
                for txt, size, bold, color in para_runs(tf):
                    if not txt:
                        continue
                    size = size or 18
                    if size < min_font:
                        report("ERROR", sn, f"'{name}' uses {size}pt (< {min_font}pt): \"{txt[:40]}\"")
                    lines = wrap_lines(txt, width_pt, size, bold)
                    need_pt += lines * size * 1.17 + (6 if len(tf.paragraphs) > 1 else 0)
                    # contrast against own fill, else top-most filled shape under centre, else bg
                    back = own_fill
                    if not back:
                        centre = (b[0] + b[2] / 2, b[1] + b[3] / 2)
                        for fb, fh in filled:
                            if fb != b and contains(fb, centre):
                                back = fh
                        back = back or bg
                    if color and back:
                        r = ratio(color, back)
                        large = size >= 18 or (bold and size >= 14)
                        if r < (3.0 if large else 4.5):
                            report("ERROR" if r < 3.0 else "WARN", sn, f"'{name}' contrast {r:.2f}:1 ({color} on {back}) \"{txt[:30]}\"")
                avail = (h_in - ins_tb) * 72
                if need_pt > avail * 1.04 + 2:
                    level = "ERROR" if need_pt > avail * 1.15 else "WARN"
                    report(level, sn, f"'{name}' text needs ~{need_pt / 72:.2f}in but box is {avail / 72:.2f}in: \"{tf.text[:50]}\"")
                text_boxes.append((name, b, own_fill is not None))
            elif not getattr(s, "has_chart", False) and not getattr(s, "has_table", False) and s.shape_type != MSO_SHAPE_TYPE.PICTURE:
                summary["shape"] += 1
        # text-on-text overlaps (ignore a filled label sitting on its own panel)
        for i in range(len(text_boxes)):
            for j in range(i + 1, len(text_boxes)):
                (n1, b1, _), (n2, b2, _) = text_boxes[i], text_boxes[j]
                a = inter(b1, b2)
                small = min(b1[2] * b1[3], b2[2] * b2[3])
                if small and a / small > 0.08:
                    report("WARN", sn, f"text boxes overlap: '{n1}' and '{n2}' ({a / small:.0%} of smaller)")
        if has_data and not has_source:
            report("WARN", sn, "chart/table slide has no shape named 'Source' — add a source line")

    print(f"\nNative objects: {summary['text']} text boxes, {summary['shape']} shapes, "
          f"{summary['chart']} charts, {summary['table']} tables, {summary['picture']} pictures")
    print(f"QA result: {errors} error(s), {warns} warning(s) across {len(prs.slides)} slides")
    return 1 if errors or (strict and warns) else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("pptx")
    ap.add_argument("--min-font", type=float, default=8)
    ap.add_argument("--strict", action="store_true")
    a = ap.parse_args()
    sys.exit(check(a.pptx, a.min_font, a.strict))
