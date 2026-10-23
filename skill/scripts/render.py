#!/usr/bin/env python3
"""Render a .pptx to PDF + per-slide PNGs + contact sheet for visual QA.

Usage:
  render.py deck.pptx [--outdir DIR] [--dpi 110]

Writes DIR/<stem>.pdf, DIR/slides/slide-NN.png and DIR/<stem>-contact-1.png (DIR defaults to
<deck dir>/preview). Needs LibreOffice (soffice) and PyMuPDF; see references/dependencies.md.
"""
import argparse
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile

import pymupdf

HERE = pathlib.Path(__file__).resolve().parent
SOFFICE_CANDIDATES = [
    shutil.which("soffice"),
    shutil.which("libreoffice"),
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    "/usr/bin/soffice",
    "/usr/lib/libreoffice/program/soffice",
]


def find_soffice():
    for c in SOFFICE_CANDIDATES:
        if c and os.path.exists(c):
            return c
    return None


def to_pdf(pptx, outdir):
    soffice = find_soffice()
    if not soffice:
        sys.exit("LibreOffice (soffice) not found. Install it (see references/dependencies.md) "
                 "or export to PDF from PowerPoint, then run: pdf_to_pages.py deck.pdf DIR")
    with tempfile.TemporaryDirectory() as profile:
        cmd = [soffice, f"-env:UserInstallation=file://{profile}", "--headless", "--norestore",
               "--convert-to", "pdf", "--outdir", str(outdir), str(pptx)]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=240)
    pdf = outdir / (pptx.stem + ".pdf")
    if not pdf.exists():
        sys.exit(f"PDF conversion failed:\n{r.stdout}\n{r.stderr}")
    return pdf


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pptx")
    ap.add_argument("--outdir")
    ap.add_argument("--dpi", type=int, default=110)
    a = ap.parse_args()
    pptx = pathlib.Path(a.pptx).resolve()
    outdir = pathlib.Path(a.outdir).resolve() if a.outdir else pptx.parent / "preview"
    slides = outdir / "slides"
    slides.mkdir(parents=True, exist_ok=True)
    for old in slides.glob("slide-*.png"):
        old.unlink()

    pdf = to_pdf(pptx, outdir)
    doc = pymupdf.open(pdf)
    for i, page in enumerate(doc, 1):
        page.get_pixmap(dpi=a.dpi).save(slides / f"slide-{i:02d}.png")
    print(f"PDF: {pdf} ({doc.page_count} pages)")
    print(f"PNGs: {slides}")
    sheet = subprocess.run([sys.executable, str(HERE / "contact_sheet.py"), str(slides),
                            str(outdir / f"{pptx.stem}-contact"), "--cols", "3", "--per-sheet", "12",
                            "--width", "560"], capture_output=True, text=True)
    print(sheet.stdout.strip() or sheet.stderr.strip())


if __name__ == "__main__":
    main()
