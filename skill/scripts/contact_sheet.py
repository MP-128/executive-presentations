#!/usr/bin/env python3
"""Tile page/slide PNGs into labelled contact sheets for whole-deck review.

Usage:
  contact_sheet.py <png_dir> <out_prefix> [--cols 4] [--per-sheet 16] [--width 480]

Reads <png_dir>/*.png in name order, writes <out_prefix>-1.png, <out_prefix>-2.png, ...
Each tile is labelled with its file stem (p007 -> "7", slide-03 -> "3").
"""
import argparse
import math
import pathlib
import re

from PIL import Image, ImageDraw, ImageFont


def label_for(stem):
    m = re.search(r"(\d+)$", stem)
    return str(int(m.group(1))) if m else stem


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("png_dir")
    ap.add_argument("out_prefix")
    ap.add_argument("--cols", type=int, default=4)
    ap.add_argument("--per-sheet", type=int, default=16)
    ap.add_argument("--width", type=int, default=480)
    args = ap.parse_args()

    files = sorted(pathlib.Path(args.png_dir).glob("*.png"))
    if not files:
        raise SystemExit(f"no PNGs in {args.png_dir}")
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 20)
    except OSError:
        font = ImageFont.load_default()

    written = []
    for sheet_i in range(math.ceil(len(files) / args.per_sheet)):
        chunk = files[sheet_i * args.per_sheet:(sheet_i + 1) * args.per_sheet]
        thumbs = []
        for f in chunk:
            im = Image.open(f).convert("RGB")
            h = round(im.height * args.width / im.width)
            thumbs.append((label_for(f.stem), im.resize((args.width, h))))
        tile_h = max(t.height for _, t in thumbs) + 30
        cols = min(args.cols, len(thumbs))
        rows = math.ceil(len(thumbs) / cols)
        sheet = Image.new("RGB", (cols * (args.width + 12) + 12, rows * tile_h + 12), "white")
        draw = ImageDraw.Draw(sheet)
        for i, (lab, t) in enumerate(thumbs):
            x = 12 + (i % cols) * (args.width + 12)
            y = 12 + (i // cols) * tile_h
            sheet.paste(t, (x, y + 26))
            draw.rectangle([x, y + 26, x + t.width - 1, y + 26 + t.height - 1], outline="#999999")
            draw.text((x, y + 2), lab, fill="black", font=font)
        path = f"{args.out_prefix}-{sheet_i + 1}.png"
        sheet.save(path)
        written.append(path)
    print("\n".join(written))


if __name__ == "__main__":
    main()
