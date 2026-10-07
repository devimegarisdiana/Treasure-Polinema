"""Render the uploaded form reference to inspect required markers and choices."""
from pathlib import Path
import pymupdf as fitz

source = Path("attached_assets/Registration_Form_of_3rd_Treasure_2025_-_Google_Formulir_1791342786871.pdf")
output = Path(".agents/outputs/registration-reference")
output.mkdir(parents=True, exist_ok=True)
with fitz.open(source) as document:
    print(f"Pages: {document.page_count}")
    for index in (0, 2, 3):
        target = output / f"page-{index + 1}.png"
        document[index].get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(target)
        print(target)
