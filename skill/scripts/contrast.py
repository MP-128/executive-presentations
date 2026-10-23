#!/usr/bin/env python3
"""WCAG 2.x contrast helper.

Usage:
  contrast.py 091439 FFFFFF            -> ratio + AA/AAA verdicts
  contrast.py --brand brand.json        -> checks every text/background pairing the deck kit uses
Library: from contrast import ratio
"""
import json
import sys


def _lin(v):
    v /= 255
    return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4


def luminance(hexstr):
    h = hexstr.lstrip("#")[:6]
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def ratio(a, b):
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def verdict(r, large=False):
    need = 3.0 if large else 4.5
    return "PASS" if r >= need else "FAIL"


def brand_pairs(path):
    b = json.load(open(path))
    c = {k: (v["hex"] if isinstance(v, dict) else v) for k, v in b.get("colors", {}).items()}
    g = lambda k, d: c.get(k, d)
    pairs = [
        ("ink on background", g("ink", "1F2937"), g("background", "FFFFFF"), False),
        ("body on background", g("body", g("ink", "1F2937")), g("background", "FFFFFF"), False),
        ("muted on background (sources)", g("muted", "6B7280"), g("background", "FFFFFF"), False),
        ("body on tint (panels)", g("body", g("ink", "1F2937")), g("tint", "F3F4F6"), False),
        ("accent on background (kickers)", g("accent", "2563EB"), g("background", "FFFFFF"), True),
        ("onDark on dark (cover)", g("onDark", "FFFFFF"), g("dark", "1F2937"), False),
        ("onDarkMuted on dark", g("onDarkMuted", "B8C0D9"), g("dark", "1F2937"), False),
        ("white on accent (bars, headers)", "FFFFFF", g("accent", "2563EB"), True),
        ("warning on background", g("warning", "B26B00"), g("background", "FFFFFF"), True),
        ("negative on background", g("negative", "B42318"), g("background", "FFFFFF"), True),
        ("positive on background", g("positive", "2E7D5B"), g("background", "FFFFFF"), True),
    ]
    bad = 0
    for name, fg, bg, large in pairs:
        r = ratio(fg, bg)
        v = verdict(r, large)
        bad += v == "FAIL"
        print(f"{v}  {r:5.2f}  {name:34s} {fg} on {bg}{'  (large/bold text, 3:1)' if large else ''}")
    return bad


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--brand":
        sys.exit(1 if brand_pairs(sys.argv[2]) else 0)
    if len(sys.argv) == 3:
        r = ratio(sys.argv[1], sys.argv[2])
        print(f"{r:.2f}:1  normal {verdict(r)}  large {verdict(r, True)}")
        sys.exit(0)
    sys.exit(__doc__)
