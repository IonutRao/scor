#!/usr/bin/env python3
"""Asambleaza aplicatia din src/ in doua forme:
   radacina repo   fisierele servite de GitHub Pages: index.html, manifest, service worker, iconite
   artifact/       aceeasi aplicatie ca pagina de previzualizare, cu date de exemplu (nu se urca in repo)

   Rulare: python3 build.py
"""
import json
import pathlib
import shutil

from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"
SITE = ROOT
ART = ROOT / "artifact"
TEST = ROOT / "test"
VERSION = "0.8"
TITLE = "Scorul zilei"
DESCRIPTION = "Ține scorul zilei tale: faptele bune pe plus, cele mai puțin bune pe minus."
INK = (30, 27, 75)
MINT = (61, 220, 151)


def read(name):
    return (SRC / name).read_text(encoding="utf-8")


css = read("app.css") + "\n" + read("social.css")
js = "\n".join(read(n) for n in ("logic.js", "i18n.js", "api.js", "photo.js", "camera.js", "app.js"))
body = read("body.html")
config = json.loads(read("config.json"))

FONT = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap">'
# Aceleasi reguli de baza pe care le pune si pagina de previzualizare, ca aplicatia sa arate identic in ambele locuri.
RESET = (":root{color-scheme:light;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}"
         "body{margin:0}img{max-width:100%}[hidden]{display:none!important}")


def script(cfg):
    return "<script>\nwindow.SCOR_BUILD = " + json.dumps(cfg) + ";\n" + js + "</script>\n"


def site_config():
    """Cu adresa si cheia publica Supabase completate in src/config.json, aplicatia porneste cu conturi.
       Fara ele ramane in modul local, ca in versiunea 0.1."""
    cfg = {"pwa": True}
    if config.get("supabaseUrl") and config.get("supabaseKey"):
        cfg["backend"] = {"url": config["supabaseUrl"].rstrip("/"), "key": config["supabaseKey"], "lib": config["supabaseLib"]}
    return cfg


def icon(size, scale=1.0):
    s = size * 4
    im = Image.new("RGB", (s, s), INK)
    d = ImageDraw.Draw(im)
    length, thick, c = s * 0.46 * scale, s * 0.13 * scale, s / 2
    d.rounded_rectangle([c - length / 2, c - thick / 2, c + length / 2, c + thick / 2], radius=thick / 2, fill=MINT)
    d.rounded_rectangle([c - thick / 2, c - length / 2, c + thick / 2, c + length / 2], radius=thick / 2, fill=MINT)
    return im.resize((size, size), Image.LANCZOS)


SW = """/* Scorul zilei: face aplicatia sa porneasca si fara internet. */
const CACHE = 'scor-__VERSION__';
const SHELL = ['./', './index.html', './manifest.webmanifest', './favicon.svg', './icon-192.png', './icon-512.png'];
/* Fonturile si biblioteca de cont vin din afara si se pastreaza dupa prima incarcare. */
const KEEP = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* Ghidul si PDF-ul lui sunt pagini obisnuite, nu fac parte din aplicatie. */
  if (/[/]ghid[^/]*$/.test(url.pathname)) return;

  /* Pagina: intai de pe internet, ca actualizarile sa ajunga imediat; fara internet, din copia salvata. */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && res.type === 'basic' && !res.redirected) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  /* Fisierele aplicatiei, fonturile si biblioteca: din copia salvata, altfel de pe internet si se pastreaza.
     Cererile catre server (conturi, date) nu trec pe aici niciodata. */
  if (url.origin === self.location.origin || KEEP.includes(url.hostname)) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }))
    );
  }
});
"""


def page(cfg):
    return "\n".join([
        "<!doctype html>",
        '<html lang="ro">',
        "<head>",
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
        f"<title>{TITLE}</title>",
        f'<meta name="description" content="{DESCRIPTION}">',
        '<meta name="theme-color" content="#F5F5FA">',
        '<meta name="mobile-web-app-capable" content="yes">',
        '<meta name="apple-mobile-web-app-capable" content="yes">',
        '<meta name="apple-mobile-web-app-title" content="Scor">',
        '<link rel="manifest" href="manifest.webmanifest">',
        '<link rel="icon" href="favicon.svg" type="image/svg+xml">',
        '<link rel="apple-touch-icon" href="apple-touch-icon.png">',
        '<link rel="preconnect" href="https://fonts.googleapis.com">',
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
        FONT,
        "<style>",
        RESET,
        css + "</style>",
        "</head>",
        "<body>",
        body + script(cfg) + "</body>",
        "</html>",
        "",
    ])


def main():
    local = TEST / "local"
    for d in (ART, TEST, local):
        d.mkdir(parents=True, exist_ok=True)

    (SITE / "index.html").write_text(page(site_config()), encoding="utf-8")

    manifest = {
        "name": TITLE, "short_name": "Scor",
        "description": DESCRIPTION,
        "lang": "ro", "dir": "ltr", "id": "./", "start_url": "./", "scope": "./",
        "display": "standalone", "orientation": "portrait",
        "background_color": "#F5F5FA", "theme_color": "#F5F5FA",
        "icons": [
            {"src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
            {"src": "icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ],
    }
    (SITE / "manifest.webmanifest").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (SITE / "sw.js").write_text(SW.replace("__VERSION__", VERSION), encoding="utf-8")
    (SITE / "favicon.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1E1B4B"/>'
        '<path d="M32 18v28M18 32h28" stroke="#3DDC97" stroke-width="8" stroke-linecap="round"/></svg>\n', encoding="utf-8")
    icon(192).save(SITE / "icon-192.png")
    icon(512).save(SITE / "icon-512.png")
    icon(512, 0.78).save(SITE / "icon-maskable-512.png")
    icon(180).save(SITE / "apple-touch-icon.png")
    # Ghidul pentru educatori: o pagina de sine statatoare; PDF-ul ei se face separat, cu tools/ghid_pdf.py.
    shutil.copyfile(SRC / "ghid.html", SITE / "ghid.html")

    # Aceeasi aplicatie in modul local, fara server, pentru test/flow.py. Nu se urca in repo.
    (local / "index.html").write_text(page({"pwa": True}), encoding="utf-8")
    for n in ("manifest.webmanifest", "sw.js", "favicon.svg", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"):
        shutil.copyfile(SITE / n, local / n)

    # Pagina de previzualizare: fara doctype, head sau body, cu titlul si stilul la inceput. Ramane in modul local.
    art_html = f"<title>{TITLE}</title>\n{FONT}\n<style>\n{css}</style>\n{body}{script({'demo': True, 'lang': 'ro'})}"
    (ART / "scorul-zilei.html").write_text(art_html, encoding="utf-8")

    # Aceeasi pagina invelita ca la publicare, doar pentru testele locale.
    shell = ('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
             "<style>" + RESET + "body{font:14px system-ui,sans-serif}</style></head><body>")
    (TEST / "artifact-preview.html").write_text(shell + art_html + "</body></html>", encoding="utf-8")

    for n in ("index.html", "manifest.webmanifest", "sw.js", "ghid.html"):
        print(f"{n:28s} {(SITE / n).stat().st_size:>8d} B")
    print(f"{'artifact/scorul-zilei.html':28s} {(ART / 'scorul-zilei.html').stat().st_size:>8d} B")
    print("mod:", "cu conturi" if "backend" in site_config() else "local (src/config.json nu are inca adresa si cheia)")


if __name__ == "__main__":
    main()
