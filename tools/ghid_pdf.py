#!/usr/bin/env python3
"""Face ghid-educatori.pdf din ghid.html (dupa build), cu Chromium, pe A4.
   Fonturile Google nu se incarca in mediul de lucru; pagina cade pe Inter, care este instalat. Rulare: python3 tools/ghid_pdf.py
"""
import pathlib

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
src = ROOT / "ghid.html"
out = ROOT / "ghid-educatori.pdf"

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--no-sandbox"])
    page = browser.new_page()
    page.goto(src.as_uri())
    page.wait_for_load_state("load")
    page.emulate_media(media="print")
    page.pdf(path=str(out), format="A4", print_background=True, margin={"top": "16mm", "bottom": "16mm", "left": "14mm", "right": "14mm"},
             display_header_footer=True, header_template="<span></span>",
             footer_template='<div style="width:100%;font-size:9px;color:#777;font-family:Inter,sans-serif;text-align:center">'
                             'Scorul zilei · Ghid pentru educatori · pagina <span class="pageNumber"></span> din <span class="totalPages"></span></div>')
    browser.close()
print(out.name, out.stat().st_size, "B")
