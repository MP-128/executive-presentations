#!/usr/bin/env python3
"""Render PDF pages to PNG and extract per-page text (read-only on the source PDF).

Usage:
  pdf_to_pages.py <pdf> <outdir> [--dpi 110] [--pages 1,3,5-9] [--text-only]

Writes <outdir>/p<NNN>.png and <outdir>/text.md (one "## Page N" block per page).
Use it to study reference decks or to rasterise a rendered .pptx PDF for QA.
"""
import argparse
import pathlib

import pymupdf


def parse_pages(spec, count):
    if not spec:
        return list(range(1, count + 1))
    pages = []
    for part in spec.split(","):
        part = part.strip()
        if "-" in part:
            a, b = part.split("-")
            pages.extend(range(int(a), int(b) + 1))
        elif part:
            pages.append(int(part))
    return [p for p in pages if 1 <= p <= count]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("outdir")
    ap.add_argument("--dpi", type=int, default=110)
    ap.add_argument("--pages", default="")
    ap.add_argument("--text-only", action="store_true")
    args = ap.parse_args()

    out = pathlib.Path(args.outdir)
    out.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open(args.pdf)
    pages = parse_pages(args.pages, doc.page_count)
    text_blocks = []
    for n in pages:
        page = doc[n - 1]
        text_blocks.append(f"## Page {n}\n\n{page.get_text().strip()}\n")
        if not args.text_only:
            page.get_pixmap(dpi=args.dpi).save(out / f"p{n:03d}.png")
    (out / "text.md").write_text("\n".join(text_blocks))
    print(f"{args.pdf}: {doc.page_count} pages; wrote {len(pages)} to {out}")


if __name__ == "__main__":
    main()
