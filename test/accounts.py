"""Parcurge versiunea cu conturi cu mai multi utilizatori, pe o baza locala construita la fel ca cea din Supabase.

   Porneste singur baza (test/db/start.sh) si serverul de test (test/server.py).
   Rulare: python3 test/accounts.py
"""
import datetime
import json
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
SHOTS = ROOT / "test" / "shots"
SHOTS.mkdir(parents=True, exist_ok=True)
problems = []
MINUS = "−"


def check(cond, msg):
    print(("ok    " if cond else "FAIL  ") + msg, flush=True)
    if not cond:
        problems.append(msg)


def soft(fn, msg):
    """Verificare care asteapta: trece cand conditia devine adevarata, pica daca nu devine la timp."""
    try:
        fn()
        check(True, msg)
    except Exception as e:  # noqa: BLE001
        check(False, msg + " [" + str(e).splitlines()[0][:140] + "]")


def text(page, sel):
    return page.locator(sel).first.inner_text().strip()


def until(page, cond, what, timeout):
    end = time.time() + timeout / 1000
    while True:
        try:
            if cond():
                return
        except Exception:  # noqa: BLE001
            pass
        if time.time() > end:
            raise TimeoutError("timp expirat: " + what)
        page.wait_for_timeout(80)


def wait_text(page, sel, sub, timeout=8000):
    loc = page.locator(sel)
    until(page, lambda: loc.count() > 0 and sub in loc.first.inner_text(), f"{sel} nu a ajuns sa contina {sub!r}", timeout)


def wait_count(page, sel, n, timeout=8000):
    loc = page.locator(sel)
    until(page, lambda: loc.count() == n, f"{sel} nu a ajuns la {n} elemente", timeout)


def shot(page, name, full=False):
    page.wait_for_timeout(200)
    page.screenshot(path=str(SHOTS / name), full_page=full)


def no_overflow(page, label):
    wide = page.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check(wide <= 0, f"no sideways scroll: {label} (extra {wide}px)")


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


def sign_in(page, email, password):
    page.goto(BASE)
    page.wait_for_selector("#auth-btn")
    page.fill("#auth-email", email)
    page.fill("#auth-pass", password)
    page.click("#auth-btn")


def saved(page):
    """Asteapta pana cand totul a ajuns in cont, privind din Profil."""
    page.click('#nav a[data-route="profil"]')
    wait_text(page, "#sync-status", "Totul e salvat in cont", 10000)


def add(page, kind, fav=None, name=None, public=None, keep=False):
    page.click('#nav a[data-route="azi"]')
    page.click("a.btn-plus" if kind == "plus" else "a.btn-minus")
    page.wait_for_selector("#save-btn")
    if fav:
        page.click(f'.chip:has-text("{fav}")')
    if name:
        page.fill("#act-name", name)
    if public is not None:
        page.click(f'[data-act="pub"][data-v="{1 if public else 0}"]')
    if keep:
        page.check("#keep-fav")
    page.click("#save-btn")
    page.wait_for_selector("#score")


subprocess.run([str(ROOT / "test" / "db" / "start.sh")], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
server = subprocess.Popen([sys.executable, str(ROOT / "test" / "server.py")], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
for _ in range(50):
    try:
        urllib.request.urlopen(BASE + "/__test/set?confirm=0", timeout=1).read()
        break
    except Exception:  # noqa: BLE001
        time.sleep(0.2)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--no-sandbox"])
        opts = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="ro-RO", timezone_id="Europe/Bucharest")
        errs = []

        def new_page(extra=None):
            ctx = browser.new_context(**dict(opts, **(extra or {})))
            pg = ctx.new_page()
            pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
            pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
            return ctx, pg

        # ------------------------------------------------------------ Ana isi face cont
        ctx_a, a = new_page()
        a.goto(BASE)
        soft(lambda: a.wait_for_selector("#auth-btn", timeout=8000), "fara cont, aplicatia arata ecranul de intrare")
        check(text(a, "h1") == "Scorul zilei", "titlul ecranului de intrare")
        check(a.locator("#nav").is_hidden(), "fara bara de taburi inainte de intrare")
        shot(a, "c01-intra.png")
        no_overflow(a, "intrare 390")

        a.fill("#auth-email", "ana@example.test")
        a.fill("#auth-pass", "parola-ana-1")
        a.click("#auth-btn")
        soft(lambda: wait_text(a, "#auth-err", "Email sau parola gresita"), "cont inexistent: mesaj clar")
        check(a.input_value("#auth-pass") == "parola-ana-1" and a.input_value("#auth-email") == "ana@example.test", "dupa eroare, ce a scris omul ramane in campuri")

        a.click('[data-mode="up"]')
        check(a.input_value("#auth-email") == "ana@example.test", "emailul ramane la trecerea pe Cont nou")
        check(text(a, "#auth-btn") == "Creeaza contul", "butonul devine Creeaza contul")
        a.fill("#auth-email", "ana@")
        a.fill("#auth-pass", "parola-ana-1")
        a.click("#auth-btn")
        soft(lambda: wait_text(a, "#auth-err", "adresa de email corecta"), "email gresit: mesaj clar")
        a.fill("#auth-email", "ana@example.test")
        a.fill("#auth-pass", "scurt")
        a.click("#auth-btn")
        soft(lambda: wait_text(a, "#auth-err", "cel putin 8 caractere"), "parola scurta: mesaj clar")
        shot(a, "c02-cont-nou-eroare.png")
        a.fill("#auth-pass", "parola-ana-1")
        a.click("#auth-btn")
        soft(lambda: a.wait_for_selector("#name-input", timeout=8000), "dupa crearea contului se cere un nume")
        check(text(a, "h1") == "Alege un nume", "ecranul de nume")
        a.fill("#name-input", "ab")
        a.click("#name-btn")
        soft(lambda: wait_text(a, "#pname-err", "intre 3 si 20"), "nume prea scurt: mesaj clar")
        shot(a, "c03-nume.png")
        a.fill("#name-input", "Ana")
        a.click("#name-btn")
        soft(lambda: a.wait_for_selector("#score", timeout=8000), "cu nume ales, Ana intra in aplicatie")
        check(text(a, "h1") == "Azi", "ecranul Azi")
        check(a.locator("#nav a").count() == 4, "patru taburi: Azi, Jurnal, Flux, Profil")
        check(text(a, "#cheers") == "0", "incurajari primite: 0")
        check("parola-ana-1" not in a.evaluate("() => JSON.stringify(localStorage)"), "parola nu este pastrata pe dispozitiv")

        # ------------------------------------------------------------ activitati cu vizibilitate
        a.click("a.btn-plus")
        check(a.locator('[data-act="pub"][data-v="0"]').get_attribute("aria-pressed") == "true", "o fapta buna porneste privata")
        a.click('.chip:has-text("Sala")')
        a.click('[data-act="pub"][data-v="1"]')
        check(text(a, "#who-s") == "apare in flux, cu numele tau", "explicatia de sub Cine vede se schimba")
        check(a.input_value("#act-name") == "Sala", "numele ales ramane dupa schimbarea vizibilitatii")
        shot(a, "c04-adauga-public.png")
        a.click("#save-btn")
        soft(lambda: wait_text(a, "#score", "+10"), "Sala +10 notata")
        check("public" in text(a, "#today-list .row-s"), "randul arata ca activitatea e publica")

        a.click("a.btn-minus")
        check(a.locator('[data-act="pub"][data-v="0"]').get_attribute("aria-pressed") == "true", "o activitate pe minus porneste privata chiar dupa una publica")
        a.click('.chip:has-text("Tigara")')
        a.click("#save-btn")
        soft(lambda: wait_text(a, "#score", "0"), "Tigara minus 10 notata")
        check("privat" in text(a, "#today-list .row-s"), "randul arata ca activitatea e privata")

        a.click("a.btn-plus")
        check(a.locator('[data-act="pub"][data-v="1"]').get_attribute("aria-pressed") == "true", "la urmatoarea fapta buna se tine minte alegerea Public")
        a.fill("#act-name", "Citit seara")
        a.click('[data-act="pub"][data-v="0"]')
        a.check("#keep-fav")
        a.click("#save-btn")
        soft(lambda: wait_text(a, "#score", "+10"), "Citit seara +10 notata, privat")
        shot(a, "c05-azi-cont.png")
        soft(lambda: saved(a), "cele trei activitati ajung in cont")
        check(db("select count(*) || '/' || count(*) filter (where is_public) from public.entries e join public.profiles p on p.id = e.user_id where p.name = 'Ana'") == "3/1", "in baza: 3 activitati ale Anei, una publica")
        check(text(a, "#my-name") == "Ana" and text(a, "#my-email") == "ana@example.test", "profilul arata numele si emailul")
        shot(a, "c06-profil-cont.png", full=True)
        no_overflow(a, "profil cu cont 390")

        # ------------------------------------------------------------ Bogdan
        ctx_b, b = new_page()
        b.goto(BASE)
        b.wait_for_selector("#auth-btn")
        b.click('[data-mode="up"]')
        b.fill("#auth-email", "ana@example.test")
        b.fill("#auth-pass", "alta-parola-9")
        b.click("#auth-btn")
        soft(lambda: wait_text(b, "#auth-err", "Exista deja un cont cu acest email"), "email deja folosit: mesaj clar")
        b.fill("#auth-email", "bogdan@example.test")
        b.click("#auth-btn")
        b.wait_for_selector("#name-input")
        b.fill("#name-input", "ana")
        b.click("#name-btn")
        soft(lambda: wait_text(b, "#pname-err", "Numele e deja luat"), "nume deja luat: mesaj clar")
        b.fill("#name-input", "Bogdan")
        b.click("#name-btn")
        b.wait_for_selector("#score")

        b.click('#nav a[data-route="flux"]')
        soft(lambda: wait_count(b, "#feed-list .post", 1), "fluxul lui Bogdan are o singura activitate")
        feed_b = text(b, "#feed-list")
        check("Ana" in feed_b and "Sala" in feed_b and "+10" in feed_b, "este Sala +10 a Anei")
        check("Tigara" not in feed_b and "Citit seara" not in feed_b, "activitatile private ale Anei nu apar")
        check("example.test" not in b.content(), "nicio adresa de email a altcuiva in pagina")
        check("Fii primul care incurajeaza" in feed_b, "invitatie la prima incurajare")
        b.click("#feed-list .cheer")
        soft(lambda: wait_text(b, "#feed-list .cheer", "Incurajat"), "butonul devine Incurajat")
        soft(lambda: wait_text(b, "#feed-list .post-n", "o incurajare, de la tine"), "textul arata incurajarea data")
        b.wait_for_timeout(500)
        check(db("select cheers_count from public.entries where is_public") == "1", "in baza: o incurajare pe Sala")
        shot(b, "c07-flux-bogdan.png")
        no_overflow(b, "flux 390")

        add(b, "plus", name="Alergare 5 km", public=True)
        b.click('#nav a[data-route="flux"]')
        soft(lambda: wait_count(b, "#feed-list .post", 2), "activitatea publica a lui Bogdan apare si in fluxul lui")
        check("activitatea ta" in text(b, '#feed-list .post:has-text("Alergare")'), "este marcata ca activitatea lui")
        check(b.locator('#feed-list .post:has-text("Alergare") .cheer').count() == 0, "nu isi poate incuraja propria activitate")

        # ------------------------------------------------------------ Ana vede incurajarea
        a.click('#nav a[data-route="flux"]')
        soft(lambda: wait_count(a, "#feed-list .post", 2), "fluxul Anei are doua activitati")
        a.click('[data-act="feed-refresh"]')
        soft(lambda: wait_text(a, "#cheers-got", "1"), "Ana vede ca a primit o incurajare")
        check("1 incurajare" in text(a, '#feed-list .post:has-text("Sala")'), "activitatea ei arata 1 incurajare")
        a.click('#feed-list .post:has-text("Alergare") .cheer')
        soft(lambda: wait_text(a, '#feed-list .cheer[aria-pressed="true"]', "Incurajat"), "Ana il incurajeaza pe Bogdan")
        shot(a, "c08-flux-ana.png")
        a.click('#nav a[data-route="azi"]')
        check(text(a, "#cheers") == "1", "pe Azi: 1 incurajare primita, separat de scor")
        check(text(a, "#score") == "+10", "scorul a ramas +10: incurajarile nu se aduna la scor")
        check("public · 1 incurajare" in text(a, '#today-list .row:has-text("Sala")'), "randul Sala arata incurajarea")

        a.click('#today-list .row:has-text("Sala")')
        check(text(a, "#dlg-extra") == "Scoate din flux", "dialogul ofera scoaterea din flux")
        shot(a, "c09-dialog.png")
        a.click("#dlg-extra")
        soft(lambda: wait_text(a, '#today-list .row:has-text("Sala") .row-s', "privat"), "Sala devine privata")
        soft(lambda: saved(a), "schimbarea de vizibilitate ajunge in cont")
        b.click('[data-act="feed-refresh"]')
        soft(lambda: wait_count(b, '#feed-list .post:has-text("Sala")', 0), "Sala dispare din fluxul lui Bogdan")
        a.click('#nav a[data-route="azi"]')
        a.click('#today-list .row:has-text("Sala")')
        check(text(a, "#dlg-extra") == "Arata in flux", "dialogul ofera acum aratarea in flux")
        a.click("#dlg-extra")
        soft(lambda: saved(a), "Sala este din nou publica")

        # ------------------------------------------------------------ fara internet
        a.route("**/rest/v1/rpc/sync", lambda r: r.abort())
        add(a, "plus", fav="Mers pe jos", public=False)
        soft(lambda: wait_text(a, "#score", "+20"), "fara internet, activitatea apare imediat pe dispozitiv")
        a.click('#today-list .row:has-text("Citit seara")')
        a.click("#dlg-ok")
        soft(lambda: wait_text(a, "#score", "+10"), "fara internet, stergerea se vede imediat")
        soft(lambda: wait_text(a, "#pending", "In asteptare: 2 modificari"), "apare anuntul cu modificarile in asteptare")
        shot(a, "c10-fara-internet.png")
        a.click('#nav a[data-route="profil"]')
        check("Fara internet" in text(a, "#sync-status"), "profilul explica de ce asteapta")
        check(db("select count(*) from public.entries e join public.profiles p on p.id = e.user_id where p.name = 'Ana'") == "3", "in baza inca sunt cele 3 activitati vechi")
        a.unroute("**/rest/v1/rpc/sync")
        a.click('[data-act="sync-now"]')
        soft(lambda: wait_text(a, "#sync-status", "Totul e salvat in cont", 10000), "cand revine internetul, modificarile pleaca")
        check(db("select string_agg(coalesce(e.key, e.name), ',' order by e.ts) from public.entries e join public.profiles p on p.id = e.user_id where p.name = 'Ana'") == "gym,smoke,walk", "in baza: Sala, Tigara, Mers pe jos")

        # ------------------------------------------------------------ al doilea dispozitiv al Anei
        ctx_c, c = new_page()
        sign_in(c, "ana@example.test", "parola-ana-1")
        soft(lambda: wait_count(c, "#today-list .row", 3), "pe al doilea dispozitiv apar cele 3 activitati")
        check(text(c, "#score") == "+10" and text(c, "h1") == "Azi", "acelasi scor pe al doilea dispozitiv, fara sa mai ceara numele")
        c.click("a.btn-plus")
        check(c.locator('.chip:has-text("Citit seara")').count() == 1, "favorita adaugata pe primul dispozitiv exista si aici")
        c.click("a.icon-btn")
        c.click('#today-list .row:has-text("Tigara")')
        c.click("#dlg-ok")
        soft(lambda: saved(c), "stergerea de pe al doilea dispozitiv ajunge in cont")
        a.click('[data-act="sync-now"]')
        a.click('#nav a[data-route="azi"]')
        soft(lambda: wait_text(a, "#score", "+20"), "primul dispozitiv primeste stergerea: scor +20")
        check(a.locator("#today-list .row").count() == 2, "doua activitati ramase pe primul dispozitiv")

        c.click('#nav a[data-route="profil"]')
        c.click('[data-act="signout"]')
        soft(lambda: c.wait_for_selector("#auth-btn", timeout=8000), "iesirea din cont duce la ecranul de intrare")
        left = c.evaluate("() => { const d = JSON.parse(localStorage.getItem('scor.v1')); return [d.entries.length, d.uid, d.name]; }")
        check(left == [0, None, ""], "dupa iesire nu raman date personale pe dispozitiv")
        sign_in(c, "ana@example.test", "parola-gresita")
        soft(lambda: wait_text(c, "#auth-err", "Email sau parola gresita"), "parola gresita: mesaj clar")
        c.fill("#auth-pass", "parola-ana-1")
        c.click("#auth-btn")
        soft(lambda: wait_count(c, "#today-list .row", 2), "la reintrare datele revin din cont")
        ctx_c.close()

        # ------------------------------------------------------------ date din versiunea 0.1
        ctx_d, d = new_page()
        today = datetime.date.today().isoformat()
        now_ms = int(time.time() * 1000)
        old = {"v": 1, "lang": "ro", "demo": False,
               "favs": [{"id": "d-gym", "key": "gym", "type": "plus", "pts": 10}, {"id": "abc12", "type": "minus", "name": "Chipsuri", "pts": 5}],
               "entries": [{"id": "lq1abc", "ts": now_ms - 3600000, "day": today, "type": "plus", "pts": 10, "key": "gym"},
                           {"id": "lq2def", "ts": now_ms - 1800000, "day": today, "type": "minus", "pts": 5, "name": "Chipsuri"}]}
        ctx_d.add_init_script("if (!localStorage.getItem('seeded')) { localStorage.setItem('seeded', '1'); localStorage.setItem('scor.v1', %s); }" % json.dumps(json.dumps(old)))
        sign_up(d, "dan@example.test", "parola-dan-22", "Dan")
        soft(lambda: wait_count(d, "#today-list .row", 2), "activitatile notate in versiunea 0.1 raman dupa crearea contului")
        check(text(d, "#score") == "+5", "scorul vechi este pastrat")
        soft(lambda: saved(d), "activitatile vechi urca in cont")
        check(db("select count(*) || '/' || count(*) filter (where is_public) from public.entries e join public.profiles p on p.id = e.user_id where p.name = 'Dan'") == "2/0", "in baza: 2 activitati ale lui Dan, toate private")
        d.click('#nav a[data-route="azi"]')
        d.click("a.btn-minus")
        check(d.locator('.chip:has-text("Chipsuri")').count() == 1, "favoritele din versiunea 0.1 raman")
        ctx_d.close()

        # ------------------------------------------------------------ engleza
        a.click('#nav a[data-route="profil"]')
        a.click('[data-lang="en"]')
        a.click('#nav a[data-route="flux"]')
        soft(lambda: wait_text(a, "#feed-empty", "Nothing here yet"), "in engleza, filtrul pe limba mea ascunde activitatile romanesti")
        check(text(a, "h1") == "Feed", "fluxul in engleza")
        a.click('[data-act="feed-lang"][data-all="1"]')
        soft(lambda: wait_count(a, "#feed-list .post", 2), "Toate limbile le arata din nou")
        check("Gym" in text(a, "#feed-list") and "Cheered" in text(a, "#feed-list"), "numele favoritelor si butoanele sunt traduse")
        shot(a, "c11-feed-en.png")
        a.set_viewport_size({"width": 320, "height": 700})
        no_overflow(a, "feed 320")
        a.click('#nav a[data-route="profil"]')
        no_overflow(a, "profile 320")
        shot(a, "c12-profile-320.png", full=True)
        a.click('#nav a[data-route="azi"]')
        a.click("a.btn-plus")
        no_overflow(a, "add 320")
        shot(a, "c13-add-320.png", full=True)
        a.click("a.icon-btn")
        a.set_viewport_size({"width": 390, "height": 844})
        a.click('#nav a[data-route="profil"]')
        a.click('[data-lang="ro"]')

        # ------------------------------------------------------------ schimbarea numelui
        a.click('a[data-route="nume"]')
        check(text(a, "h1") == "Schimba numele" and a.input_value("#name-input") == "Ana", "ecranul de schimbare a numelui porneste cu numele actual")
        a.fill("#name-input", "Bogdan")
        a.click("#name-btn")
        soft(lambda: wait_text(a, "#pname-err", "Numele e deja luat"), "nu poate lua numele altcuiva")
        a.fill("#name-input", "Ana Maria")
        a.click("#name-btn")
        soft(lambda: wait_text(a, "#my-name", "Ana Maria"), "numele nou apare in profil")
        b.click('[data-act="feed-refresh"]')
        soft(lambda: wait_text(b, "#feed-list", "Ana Maria"), "numele nou apare si in fluxul celorlalti")

        # ------------------------------------------------------------ confirmare prin email pornita
        urllib.request.urlopen(BASE + "/__test/set?confirm=1").read()
        ctx_e, e = new_page()
        e.goto(BASE)
        e.wait_for_selector("#auth-btn")
        e.click('[data-mode="up"]')
        e.fill("#auth-email", "elena@example.test")
        e.fill("#auth-pass", "parola-elena-3")
        e.click("#auth-btn")
        soft(lambda: wait_text(e, "#auth-info", "Am trimis un email de confirmare"), "cu confirmarea pornita, omul afla ca trebuie sa verifice emailul")
        check(text(e, "#auth-btn") == "Intra in cont", "formularul trece pe Intra in cont")
        urllib.request.urlopen(BASE + "/__test/set?confirm=0").read()
        e.set_viewport_size({"width": 320, "height": 700})
        no_overflow(e, "intrare 320")
        ctx_e.close()

        # ------------------------------------------------------------ stergerea contului
        b.click('#nav a[data-route="profil"]')
        b.click('[data-act="delete-account"]')
        check(text(b, "#dlg-t") == "Stergi contul?", "stergerea contului cere confirmare")
        shot(b, "c14-sterge-cont.png")
        b.click("#dlg-ok")
        soft(lambda: b.wait_for_selector("#auth-btn", timeout=8000), "dupa stergere apare ecranul de intrare")
        check(db("select count(*) from auth.users where email = 'bogdan@example.test'") == "0", "in baza: contul lui Bogdan nu mai exista")
        check(db("select count(*) from public.entries e join public.profiles p on p.id = e.user_id where p.name = 'Bogdan'") == "0", "in baza: activitatile lui au disparut")
        b.fill("#auth-email", "bogdan@example.test")
        b.fill("#auth-pass", "alta-parola-9")
        b.click("#auth-btn")
        soft(lambda: wait_text(b, "#auth-err", "Email sau parola gresita"), "contul sters nu mai poate fi folosit")
        a.click('#nav a[data-route="flux"]')
        a.click('[data-act="feed-refresh"]')
        soft(lambda: wait_count(a, '#feed-list .post:has-text("Alergare")', 0), "activitatea lui Bogdan dispare din fluxul Anei")

        # ------------------------------------------------------------ repornire cu sesiunea pastrata
        a.reload()
        soft(lambda: a.wait_for_selector("#feed-list, #feed-empty, #feed-loading", timeout=8000), "la redeschidere Ana ramane in cont, direct pe ecranul unde era")
        check(a.locator("#auth-btn").count() == 0, "nu i se cere din nou parola")

        check(not errs, "fara erori in consola: " + "; ".join(errs[:3]))
        browser.close()
finally:
    server.terminate()
    subprocess.run([str(ROOT / "test" / "db" / "start.sh"), "stop"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

print()
print("PROBLEMS: %d" % len(problems))
for m in problems:
    print(" - " + m)
sys.exit(1 if problems else 0)
