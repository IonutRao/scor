"""Aplicatia de acum pe o baza de date ramasa la scriptul versiunii 0.2.

   Este starea reala dintre publicarea unei versiuni noi si momentul in care scriptul actualizat este rulat in Supabase:
   totul trebuie sa mearga ca inainte, iar ce depinde de scriptul nou sa stea ascuns, fara erori.

   Porneste singur baza (test/db/start.sh, cu scriptul vechi) si serverul de test. Rulare: python3 test/old_server.py
"""
import os
import pathlib
import subprocess
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = int(os.environ.get("SCOR_PORT", "8766"))
BASE = f"http://127.0.0.1:{PORT}"
problems = []


def check(cond, msg):
    print(("ok    " if cond else "FAIL  ") + msg, flush=True)
    if not cond:
        problems.append(msg)


def text(page, sel):
    return page.locator(sel).first.inner_text().strip()


def wait_text(page, sel, sub, timeout=10000):
    end = time.time() + timeout / 1000
    while time.time() < end:
        loc = page.locator(sel)
        if loc.count() > 0 and sub in loc.first.inner_text():
            return True
        page.wait_for_timeout(80)
    return False


def db(query):
    out = subprocess.run(["psql", "-X", "-q", "-t", "-A", "-h", "127.0.0.1", "-p", os.environ.get("SCOR_PG_PORT", "54329"),
                          "-U", "postgres", "-d", "postgres", "-c", query], capture_output=True, text=True)
    return out.stdout.strip()


def sign_up(page, email, password, name):
    page.goto(BASE)
    page.wait_for_selector("#auth-btn")
    page.click('[data-mode="up"]')
    page.fill("#auth-email", email)
    page.fill("#auth-pass", password)
    page.click("#auth-btn")
    page.wait_for_selector("#name-input")
    page.fill("#name-input", name)
    page.click("#name-btn")
    page.wait_for_selector("#score")


env = dict(os.environ, SCOR_SCHEMA_FILE=str(ROOT / "test" / "db" / "schema-0.2.sql"))
subprocess.run([str(ROOT / "test" / "db" / "start.sh")], check=True, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
server = subprocess.Popen([sys.executable, str(ROOT / "test" / "server.py")], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
for _ in range(50):
    try:
        urllib.request.urlopen(BASE + "/__test/set?feed=1000", timeout=1).read()
        break
    except Exception:  # noqa: BLE001
        time.sleep(0.2)

try:
    check(db("select count(*) from information_schema.columns where table_name = 'entries' and column_name = 'note'") == "0", "baza de test este cea veche, fara coloana de detalii")
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--no-sandbox"])
        opts = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="ro-RO", timezone_id="Europe/Bucharest")
        errs, bad = [], []

        def new_page():
            ctx = browser.new_context(**opts)
            pg = ctx.new_page()
            # Fonturile Google nu se pot incarca din mediul de test; raspunsurile de eroare ale serverului sunt prinse separat.
            pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
            pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
            pg.on("response", lambda r: bad.append("%d %s" % (r.status, r.url.rsplit("/", 1)[-1])) if r.status >= 400 else None)
            return ctx, pg

        ctx_a, a = new_page()
        sign_up(a, "ana@example.test", "parola-ana-1", "Ana")
        check(text(a, "h1") == "Azi", "contul nou intra in aplicatie")

        a.click("a.btn-plus")
        a.wait_for_timeout(1200)
        check(a.locator("#note-row").count() == 0 and a.locator("#act-note").count() == 0, "formularul nu ofera detalii pe o baza care nu le poate pastra")
        a.click('.chip:has-text("Sală")')
        a.click('[data-act="pub"][data-v="1"]')
        a.click("#save-btn")
        a.wait_for_selector("#score")
        a.click("a.btn-minus")
        a.fill("#act-name", "Prea mult pe telefon")
        a.click("#save-btn")
        a.wait_for_selector("#score")
        a.click('#nav a[data-route="profil"]')
        check(wait_text(a, "#sync-status", "Totul e salvat în cont"), "activitatile se salveaza in cont ca inainte")
        check(db("select string_agg(coalesce(key, name), ',' order by ts) from public.entries") == "gym,Prea mult pe telefon", "in baza: cele doua activitati")
        check(a.evaluate("() => JSON.parse(localStorage.getItem('scor.v1')).sv") == 0, "aplicatia a retinut ca serverul este la versiunea veche")

        a.click('#nav a[data-route="azi"]')
        a.click('#today-list .row:has-text("Sală")')
        check(a.locator("#dlg-link").is_hidden() and a.locator("#dlg-n").is_hidden(), "dialogul unei activitati nu ofera detalii")
        check(text(a, "#dlg-extra") == "Scoate din flux", "dar ofera in continuare schimbarea vizibilitatii")
        a.click("#dlg-extra")
        a.click('#nav a[data-route="profil"]')
        check(wait_text(a, "#sync-status", "Totul e salvat în cont"), "schimbarea de vizibilitate se salveaza")
        check(db("select bool_or(is_public) from public.entries") == "f", "in baza: activitatea a devenit privata")
        a.click('#nav a[data-route="azi"]')
        a.click('#today-list .row:has-text("Sală")')
        a.click("#dlg-extra")
        a.click('#today-list .row:has-text("Prea mult pe telefon")')
        a.click("#dlg-ok")
        a.click('#nav a[data-route="profil"]')
        check(wait_text(a, "#sync-status", "Totul e salvat în cont"), "stergerea se salveaza")
        check(db("select count(*) || '/' || count(*) filter (where is_public) from public.entries") == "1/1", "in baza: a ramas o activitate, publica")

        ctx_b, b = new_page()
        sign_up(b, "bogdan@example.test", "alta-parola-9", "Bogdan")
        b.click('#nav a[data-route="flux"]')
        post = '#feed-list .post:has-text("Sală")'
        check(wait_text(b, post, "Ana"), "fluxul arata activitatea Anei")
        check(b.locator(post + " .post-more").count() == 0 and b.locator(post + " .post-t").count() == 1, "titlul din flux este cel simplu, fara detalii")
        b.click(post + " .cheer")
        check(wait_text(b, post + " .cheer", "Încurajat"), "incurajarea merge")
        a.click('#nav a[data-route="flux"]')
        check(wait_text(a, "#cheers-got", "1"), "iar Ana o primeste singura, prin improspatarea fluxului")
        a.wait_for_timeout(2500)

        a.reload()
        a.wait_for_selector("#feed-list, #feed-empty")
        check(a.locator("#auth-btn").count() == 0, "dupa reincarcare Ana ramane in cont")
        check(not bad, "niciun raspuns de eroare de la server: " + "; ".join(bad[:4]))
        check(not errs, "fara erori in consola: " + "; ".join(errs[:3]))
        browser.close()
finally:
    try:
        urllib.request.urlopen(BASE + "/__test/set?feed=0", timeout=1).read()
    except Exception:  # noqa: BLE001
        pass
    server.terminate()
    subprocess.run([str(ROOT / "test" / "db" / "start.sh"), "stop"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

print()
print("PROBLEMS: %d" % len(problems))
for m in problems:
    print(" - " + m)
sys.exit(1 if problems else 0)
