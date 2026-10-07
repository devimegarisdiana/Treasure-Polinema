"""Render selected PDF pages for visual source verification."""

import argparse
from pathlib import Path

import pymupdf

parser = argparse.ArgumentParser()
parser.add_argument("pdf")
parser.add_argument("--pages", nargs="+", type=int, default=[1])
parser.add_argument("--output", default=".agents/outputs/pdf-preview")
args = parser.parse_args()

output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
with pymupdf.open(args.pdf) as document:
    print(f"Pages: {document.page_count}")
    for number in args.pages:
        if not 1 <= number <= document.page_count:
            raise ValueError(f"Page {number} is outside this PDF.")
        path = output / f"page-{number}.png"
        document[number - 1].get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5)).save(path)
        print(path)
