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
    wait_text(page, "#sync-status", "Totul e salvat în cont", 10000)


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
        soft(lambda: wait_text(a, "#auth-err", "Email sau parolă greșită"), "cont inexistent: mesaj clar")
        check(a.input_value("#auth-pass") == "parola-ana-1" and a.input_value("#auth-email") == "ana@example.test", "dupa eroare, ce a scris omul ramane in campuri")

        a.click('[data-mode="up"]')
        check(a.input_value("#auth-email") == "ana@example.test", "emailul ramane la trecerea pe Cont nou")
        check(text(a, "#auth-btn") == "Creează contul", "butonul devine Creeaza contul")
        a.fill("#auth-email", "ana@")
        a.fill("#auth-pass", "parola-ana-1")
        a.click("#auth-btn")
        soft(lambda: wait_text(a, "#auth-err", "adresă de email corectă"), "email gresit: mesaj clar")
        a.fill("#auth-email", "ana@example.test")
        a.fill("#auth-pass", "scurt")
        a.click("#auth-btn")
        soft(lambda: wait_text(a, "#auth-err", "cel puțin 8 caractere"), "parola scurta: mesaj clar")
        shot(a, "c02-cont-nou-eroare.png")
        a.fill("#auth-pass", "parola-ana-1")
        a.click("#auth-btn")
        soft(lambda: a.wait_for_selector("#name-input", timeout=8000), "dupa crearea contului se cere un nume")
        check(text(a, "h1") == "Alege un nume", "ecranul de nume")
        a.fill("#name-input", "ab")
        a.click("#name-btn")
        soft(lambda: wait_text(a, "#pname-err", "între 3 și 20"), "nume prea scurt: mesaj clar")
        shot(a, "c03-nume.png")
        a.fill("#name-input", "Ana")
        a.click("#name-btn")
        soft(lambda: a.wait_for_selector("#score", timeout=8000), "cu nume ales, Ana intra in aplicatie")
        check(text(a, "h1") == "Azi", "ecranul Azi")
        check(a.locator("#nav a").count() == 4, "patru taburi: Azi, Jurnal, Flux, Profil")
        check(text(a, "#cheers") == "0", "incurajari primite: 0")
        check(text(a, ".stat:has(#cheers) .stat-label") == "încurajări", "sub 0 scrie incurajari, la plural")
        check("parola-ana-1" not in a.evaluate("() => JSON.stringify(localStorage)"), "parola nu este pastrata pe dispozitiv")

        # ------------------------------------------------------------ activitati cu vizibilitate
        a.click("a.btn-plus")
        check(a.locator('[data-act="pub"][data-v="0"]').get_attribute("aria-pressed") == "true", "o fapta buna porneste privata")
        a.click('.chip:has-text("Sală")')
        a.click('[data-act="pub"][data-v="1"]')
        check(text(a, "#who-s") == "apare în flux, cu numele tău", "explicatia de sub Cine vede se schimba")
        check(a.input_value("#act-name") == "Sală", "numele ales ramane dupa schimbarea vizibilitatii")
        shot(a, "c04-adauga-public.png")
        a.click("#save-btn")
        soft(lambda: wait_text(a, "#score", "+10"), "Sala +10 notata")
        check("public" in text(a, "#today-list .row-s"), "randul arata ca activitatea e publica")

        a.click("a.btn-minus")
        check(a.locator('[data-act="pub"][data-v="0"]').get_attribute("aria-pressed") == "true", "o activitate pe minus porneste privata chiar dupa una publica")
        a.click('.chip:has-text("Țigară")')
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
        soft(lambda: wait_text(b, "#auth-err", "Există deja un cont cu acest email"), "email deja folosit: mesaj clar")
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
        check("Ana" in feed_b and "Sală" in feed_b and "+10" in feed_b, "este Sala +10 a Anei")
        check("Țigară" not in feed_b and "Citit seara" not in feed_b, "activitatile private ale Anei nu apar")
        check("example.test" not in b.content(), "nicio adresa de email a altcuiva in pagina")
        check("Fii primul care încurajează" in feed_b, "invitatie la prima incurajare")
        b.click("#feed-list .cheer")
        soft(lambda: wait_text(b, "#feed-list .cheer", "Încurajat"), "butonul devine Incurajat")
        soft(lambda: wait_text(b, "#feed-list .post-n", "o încurajare, de la tine"), "textul arata incurajarea data")
        b.wait_for_timeout(500)
        check(db("select cheers_count from public.entries where is_public") == "1", "in baza: o incurajare pe Sala")
        shot(b, "c07-flux-bogdan.png")
        no_overflow(b, "flux 390")

        add(b, "plus", name="Alergare în pădure, 5 km", public=True)
        b.click('#nav a[data-route="flux"]')
        soft(lambda: wait_count(b, "#feed-list .post", 2), "activitatea publica a lui Bogdan apare si in fluxul lui")
        check("activitatea ta" in text(b, '#feed-list .post:has-text("Alergare")'), "este marcata ca activitatea lui")
        check(b.locator('#feed-list .post:has-text("Alergare") .cheer').count() == 0, "nu isi poate incuraja propria activitate")

        # ------------------------------------------------------------ Ana vede incurajarea
        a.click('#nav a[data-route="flux"]')
        soft(lambda: wait_count(a, "#feed-list .post", 2), "fluxul Anei are doua activitati")
        a.click('[data-act="feed-refresh"]')
        soft(lambda: wait_text(a, "#cheers-got", "1"), "Ana vede ca a primit o incurajare")
        check("Alergare în pădure, 5 km" in text(a, "#feed-list"), "numele scris cu diacritice ajunge intreg in fluxul altui om")
        check(db("select name from public.entries where name like 'Alergare%'") == "Alergare în pădure, 5 km", "in baza: numele este pastrat cu diacritice")
        check("1 încurajare" in text(a, '#feed-list .post:has-text("Sală")'), "activitatea ei arata 1 incurajare")
        a.click('#feed-list .post:has-text("Alergare") .cheer')
        soft(lambda: wait_text(a, '#feed-list .cheer[aria-pressed="true"]', "Încurajat"), "Ana il incurajeaza pe Bogdan")
        shot(a, "c08-flux-ana.png")
        a.click('#nav a[data-route="azi"]')
        check(text(a, "#cheers") == "1", "pe Azi: 1 incurajare primita, separat de scor")
        check(text(a, ".stat:has(#cheers) .stat-label") == "încurajare", "sub 1 scrie incurajare, la singular")
        check(text(a, "#score") == "+10", "scorul a ramas +10: incurajarile nu se aduna la scor")
        check("public · 1 încurajare" in text(a, '#today-list .row:has-text("Sală")'), "randul Sala arata incurajarea")

        a.click('#today-list .row:has-text("Sală")')
        check(text(a, "#dlg-extra") == "Scoate din flux", "dialogul ofera scoaterea din flux")
        shot(a, "c09-dialog.png")
        a.click("#dlg-extra")
        soft(lambda: wait_text(a, '#today-list .row:has-text("Sală") .row-s', "privat"), "Sala devine privata")
        soft(lambda: saved(a), "schimbarea de vizibilitate ajunge in cont")
        b.click('[data-act="feed-refresh"]')
        soft(lambda: wait_count(b, '#feed-list .post:has-text("Sală")', 0), "Sala dispare din fluxul lui Bogdan")
        a.click('#nav a[data-route="azi"]')
        a.click('#today-list .row:has-text("Sală")')
        check(text(a, "#dlg-extra") == "Arată în flux", "dialogul ofera acum aratarea in flux")
        a.click("#dlg-extra")
        soft(lambda: saved(a), "Sala este din nou publica")

        # ------------------------------------------------------------ fara internet
        a.route("**/rest/v1/rpc/sync", lambda r: r.abort())
        add(a, "plus", fav="Mers pe jos", public=False)
        soft(lambda: wait_text(a, "#score", "+20"), "fara internet, activitatea apare imediat pe dispozitiv")
        a.click('#today-list .row:has-text("Citit seara")')
        a.click("#dlg-ok")
        soft(lambda: wait_text(a, "#score", "+10"), "fara internet, stergerea se vede imediat")
        soft(lambda: wait_text(a, "#pending", "În așteptare: 2 modificări. Se salvează în cont când revine internetul."), "apare anuntul cu modificarile in asteptare")
        shot(a, "c10-fara-internet.png")
        a.click('#nav a[data-route="profil"]')
        check("Fără internet" in text(a, "#sync-status"), "profilul explica de ce asteapta")
        check(db("select count(*) from public.entries e join public.profiles p on p.id = e.user_id where p.name = 'Ana'") == "3", "in baza inca sunt cele 3 activitati vechi")
        a.unroute("**/rest/v1/rpc/sync")
        a.click('[data-act="sync-now"]')
        soft(lambda: wait_text(a, "#sync-status", "Totul e salvat în cont", 10000), "cand revine internetul, modificarile pleaca")
        check(db("select string_agg(coalesce(e.key, e.name), ',' order by e.ts) from public.entries e join public.profiles p on p.id = e.user_id where p.name = 'Ana'") == "gym,smoke,walk", "in baza: Sala, Tigara, Mers pe jos")

        # ------------------------------------------------------------ al doilea dispozitiv al Anei
        ctx_c, c = new_page()
        sign_in(c, "ana@example.test", "parola-ana-1")
        soft(lambda: wait_count(c, "#today-list .row", 3), "pe al doilea dispozitiv apar cele 3 activitati")
        check(text(c, "#score") == "+10" and text(c, "h1") == "Azi", "acelasi scor pe al doilea dispozitiv, fara sa mai ceara numele")
        c.click("a.btn-plus")
        check(c.locator('.chip:has-text("Citit seara")').count() == 1, "favorita adaugata pe primul dispozitiv exista si aici")
        c.click("a.icon-btn")
        c.click('#today-list .row:has-text("Țigară")')
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
        soft(lambda: wait_text(c, "#auth-err", "Email sau parolă greșită"), "parola gresita: mesaj clar")
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
        check(a.locator('[data-act="feed-lang"]').count() == 0, "nu mai exista un buton pentru toate limbile: fluxul urmeaza limba aplicatiei")
        add(a, "plus", fav="Gym", public=True)
        a.click('#nav a[data-route="flux"]')
        soft(lambda: wait_count(a, "#feed-list .post", 1), "o activitate notata in engleza apare in fluxul englezesc")
        check("Gym" in text(a, "#feed-list") and "your activity" in text(a, "#feed-list"), "numele favoritelor si textele sunt traduse")
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
        check(text(a, "h1") == "Schimbă numele" and a.input_value("#name-input") == "Ana", "ecranul de schimbare a numelui porneste cu numele actual")
        a.fill("#name-input", "Bogdan")
        a.click("#name-btn")
        soft(lambda: wait_text(a, "#pname-err", "Numele e deja luat"), "nu poate lua numele altcuiva")
        a.fill("#name-input", "Ana Ștefănuț")
        a.click("#name-btn")
        soft(lambda: wait_text(a, "#my-name", "Ana Ștefănuț"), "numele nou, cu diacritice, apare in profil")
        b.click('[data-act="feed-refresh"]')
        soft(lambda: wait_text(b, "#feed-list", "Ana Ștefănuț"), "numele nou apare si in fluxul celorlalti")
        b.click('#nav a[data-route="profil"]')
        b.click('a[data-route="nume"]')
        b.fill("#name-input", "ANA ȘTEFĂNUȚ")
        b.click("#name-btn")
        soft(lambda: wait_text(b, "#pname-err", "Numele e deja luat"), "acelasi nume cu majuscule si diacritice este tot luat")
        b.click("a.icon-btn")
        b.click('#nav a[data-route="flux"]')

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
        check(text(e, "#auth-btn") == "Intră în cont", "formularul trece pe Intra in cont")
        urllib.request.urlopen(BASE + "/__test/set?confirm=0").read()
        e.set_viewport_size({"width": 320, "height": 700})
        no_overflow(e, "intrare 320")
        ctx_e.close()

        # ------------------------------------------------------------ stergerea contului
        b.click('#nav a[data-route="profil"]')
        b.click('[data-act="delete-account"]')
        check(text(b, "#dlg-t") == "Ștergi contul?", "stergerea contului cere confirmare")
        shot(b, "c14-sterge-cont.png")
        b.click("#dlg-ok")
        soft(lambda: b.wait_for_selector("#auth-btn", timeout=8000), "dupa stergere apare ecranul de intrare")
        check(db("select count(*) from auth.users where email = 'bogdan@example.test'") == "0", "in baza: contul lui Bogdan nu mai exista")
        check(db("select count(*) from public.entries e join public.profiles p on p.id = e.user_id where p.name = 'Bogdan'") == "0", "in baza: activitatile lui au disparut")
        b.fill("#auth-email", "bogdan@example.test")
        b.fill("#auth-pass", "alta-parola-9")
        b.click("#auth-btn")
        soft(lambda: wait_text(b, "#auth-err", "Email sau parolă greșită"), "contul sters nu mai poate fi folosit")
        a.click('#nav a[data-route="flux"]')
        a.click('[data-act="feed-refresh"]')
        soft(lambda: wait_count(a, '#feed-list .post:has-text("Alergare")', 0), "activitatea lui Bogdan dispare din fluxul Anei")

        # ------------------------------------------------------------ repornire cu sesiunea pastrata
        a.reload()
        soft(lambda: a.wait_for_selector("#feed-list, #feed-empty, #feed-loading", timeout=8000), "la redeschidere Ana ramane in cont, direct pe ecranul unde era")
        check(a.locator("#auth-btn").count() == 0, "nu i se cere din nou parola")

        # ------------------------------------------------------------ fluxul se improspateaza singur
        # Paginile deschise de aici incolo isi improspateaza fluxul la o secunda, ca verificarile sa nu astepte cate 15.
        urllib.request.urlopen(BASE + "/__test/set?feed=1000").read()
        ctx_a.close()
        old = "date_trunc('milliseconds', now() - interval '3 days')"
        # Activitatile publice de pana acum devin vechi de cateva zile: timpul afisat langa ele nu se mai schimba in timpul testului.
        db("update public.entries e set ts = %s + interval '1 hour', day = ((%s + interval '1 hour') at time zone 'UTC')::date "
           "from public.profiles p where p.id = e.user_id and p.name like 'Ana%%' and e.is_public" % (old, old))
        ctx_g, g = new_page()
        sign_up(g, "gina@example.test", "parola-gina-4", "Gina")
        g.wait_for_selector("#score")
        db("insert into public.entries (id, user_id, day, ts, type, pts, name, is_public, lang) "
           "select gen_random_uuid(), p.id, ((%s - make_interval(mins => n)) at time zone 'UTC')::date, %s - make_interval(mins => n), "
           "'plus', 5, 'Veche ' || lpad(n::text, 2, '0'), true, 'ro' from public.profiles p, generate_series(1, 60) n where p.name = 'Gina'" % (old, old))
        db("insert into public.entries (id, user_id, day, ts, type, pts, name, is_public, lang) "
           "select gen_random_uuid(), p.id, ((now() - interval '2 days') at time zone 'UTC')::date, date_trunc('milliseconds', now() - interval '2 days'), "
           "'plus', 5, 'Morning walk', true, 'en' from public.profiles p where p.name = 'Gina'")
        check(db("select count(*) || '/' || count(*) filter (where lang = 'en') from public.entries where is_public") == "63/2", "in baza: 63 de activitati publice, doua in engleza")

        ctx_f, f = new_page()
        feed_calls = []
        f.on("request", lambda r: feed_calls.append(time.time()) if r.url.endswith("/rest/v1/rpc/feed") else None)
        sign_in(f, "ana@example.test", "parola-ana-1")
        soft(lambda: f.wait_for_selector("#score", timeout=8000), "Ana intra de pe un alt dispozitiv")
        f.wait_for_timeout(2500)
        check(len(feed_calls) == 0, "cat timp e pe ecranul Azi, aplicatia nu cere fluxul")

        f.click('#nav a[data-route="flux"]')
        soft(lambda: wait_count(f, "#feed-list .post", 30), "fluxul se deschide cu prima pagina, 30 de activitati")
        check("Sală" in text(f, "#feed-list .post"), "cea mai noua este prima")
        f.evaluate("""() => {
          window.__draws = 0; window.__loading = 0;
          new MutationObserver(() => {
            window.__draws++;
            const b = document.querySelector('[data-act="feed-refresh"]');
            if (b && b.textContent.indexOf('Se încarcă') >= 0) window.__loading++;
          }).observe(document.getElementById('view'), { childList: true });
        }""")
        n0 = len(feed_calls)
        f.wait_for_timeout(4500)
        check(len(feed_calls) - n0 >= 2, "pe ecranul Flux, fluxul este cerut din nou, singur (%d cereri in 4,5 secunde)" % (len(feed_calls) - n0))
        check(f.evaluate("() => window.__draws") == 0, "cat timp nu s-a schimbat nimic, ecranul nu este redesenat")

        add(g, "plus", name="Înot dimineața", public=True)
        soft(lambda: wait_text(f, "#feed-list .post", "Înot dimineața"), "o activitate publica noua a altcuiva apare singura, prima in lista")
        check(f.evaluate("() => window.scrollY") == 0, "cu inceputul listei la vedere, pagina ramane sus")
        check(f.evaluate("() => window.__loading") == 0, "improspatarea singura nu arata Se incarca")
        check(f.locator("#feed-list .post").count() == 31, "celelalte activitati raman in lista")
        check(text(f, '[data-act="feed-refresh"]') == "Actualizează", "butonul Actualizeaza ramane la locul lui")

        g.click('#nav a[data-route="flux"]')
        g.click('#feed-list .post:has-text("Sală") .cheer')
        soft(lambda: wait_text(f, '#feed-list .post:has-text("Sală") .post-n', "1 încurajare"), "o incurajare primita apare singura la activitate")
        soft(lambda: wait_text(f, "#cheers-got", "1"), "si in totalul de incurajari primite, in acelasi timp")
        f.click('#nav a[data-route="azi"]')
        check(text(f, "#cheers") == "1", "pe Azi se vede aceeasi incurajare, fara alta incarcare")
        f.click('#nav a[data-route="flux"]')
        f.wait_for_selector("#feed-list .post")

        # O incurajare aflata pe drum: improspatarile care trec intre timp nu o sterg.
        held = []
        f.route("**/rest/v1/rpc/cheer", lambda r: held.append(r))
        f.click('#feed-list .post:has-text("Înot") .cheer')
        n1 = len(feed_calls)
        f.wait_for_timeout(2700)
        check(len(held) == 1 and len(feed_calls) - n1 >= 1, "incurajarea este inca pe drum, iar fluxul s-a improspatat intre timp")
        check("Încurajat" in text(f, '#feed-list .post:has-text("Înot") .cheer'), "improspatarea nu sterge o incurajare aflata pe drum")
        with f.expect_response("**/rest/v1/rpc/cheer"):
            held[0].continue_()
        f.unroute("**/rest/v1/rpc/cheer")
        f.wait_for_timeout(300)
        check("o încurajare, de la tine" in text(f, '#feed-list .post:has-text("Înot") .post-n'), "dupa raspunsul serverului, incurajarea ramane data")
        check(db("select cheers_count from public.entries where name like 'Înot%'") == "1", "in baza: incurajarea a ajuns o singura data")

        # Un raspuns de flux plecat inaintea unei schimbari facute aici soseste dupa ea: schimbarea ramane.
        stale = []

        def hold_first(route, bucket):
            if bucket:
                route.continue_()
            else:
                bucket.append((route, route.fetch()))

        f.route("**/rest/v1/rpc/feed", lambda r: hold_first(r, stale))
        soft(lambda: until(f, lambda: len(stale) == 1, "o cerere de flux oprita pe drum", 6000), "o cerere de flux este tinuta pe drum")
        f.evaluate("""() => {
          window.__back = 0;
          new MutationObserver(() => {
            const p = [...document.querySelectorAll('#feed-list .post')].find((x) => x.textContent.includes('Înot'));
            if (p && p.querySelector('.cheer[aria-pressed="true"]')) window.__back++;
          }).observe(document.getElementById('view'), { childList: true });
        }""")
        with f.expect_response("**/rest/v1/rpc/cheer"):
            f.click('#feed-list .post:has-text("Înot") .cheer')
        soft(lambda: wait_text(f, '#feed-list .post:has-text("Înot") .post-n', "Fii primul"), "Ana isi retrage incurajarea")
        stale[0][0].fulfill(response=stale[0][1])
        f.wait_for_timeout(1600)
        f.unroute("**/rest/v1/rpc/feed")
        check(f.evaluate("() => window.__back") == 0, "raspunsul vechi, sosit dupa retragere, nu readuce incurajarea pe ecran")
        check("Încurajează" in text(f, '#feed-list .post:has-text("Înot") .cheer'), "butonul ramane pe Incurajeaza")
        check(db("select cheers_count from public.entries where name like 'Înot%'") == "0", "in baza: incurajarea este retrasa")

        g.click('#nav a[data-route="azi"]')
        g.click('#today-list .row:has-text("Înot")')
        g.click("#dlg-extra")
        soft(lambda: wait_count(f, '#feed-list .post:has-text("Înot")', 0), "o activitate scoasa din flux dispare singura si la ceilalti")

        # Paginile deschise cu Mai multe raman deschise.
        for _ in range(4):
            if f.locator('[data-act="feed-more"]').count() == 0:
                break
            f.click('[data-act="feed-more"]')
            f.wait_for_timeout(600)
        soft(lambda: wait_count(f, "#feed-list .post", 61), "cu Mai multe se vad toate cele 61 de activitati in romana")
        f.wait_for_timeout(2800)
        check(f.locator("#feed-list .post").count() == 61 and f.locator('[data-act="feed-more"]').count() == 0, "improspatarea singura nu strange paginile deschise")
        check("Veche 60" in f.locator("#feed-list .post").last.inner_text(), "cea mai veche activitate a ramas la coada listei")

        # Cu lista coborata, noutatile intra deasupra fara sa miste ce are omul in fata.
        f.evaluate("() => { const p = document.querySelectorAll('#feed-list .post')[25]; window.scrollTo(0, window.scrollY + p.getBoundingClientRect().top - 10); }")
        f.wait_for_timeout(200)
        mark = f.evaluate("""() => {
          const p = [...document.querySelectorAll('#feed-list .post')].find((x) => x.getBoundingClientRect().bottom > 0);
          return [p.getAttribute('data-post'), p.getBoundingClientRect().top, window.scrollY];
        }""")
        add(g, "plus", name="Yoga seara", public=True)
        soft(lambda: wait_count(f, '#feed-list .post:has-text("Yoga seara")', 1), "activitatea noua intra in lista si cand omul a coborat in ea")
        now = f.evaluate("""(id) => {
          const p = [...document.querySelectorAll('#feed-list .post')].find((x) => x.getAttribute('data-post') === id);
          return [p.getBoundingClientRect().top, window.scrollY];
        }""", mark[0])
        check(abs(now[0] - mark[1]) <= 1.5 and now[1] > mark[2] + 40, "activitatea la care se uita ramane pe loc (%.1f, apoi %.1f; pagina a coborat cu %d)" % (mark[1], now[0], now[1] - mark[2]))
        check(f.locator("#feed-list .post").count() == 62, "si toate paginile deschise raman, cu noutatea in plus")

        # Cu aplicatia in fundal nu se cere nimic; la revenire fluxul se aduce la zi.
        hide = "(h) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); document.dispatchEvent(new Event('visibilitychange')); }"
        f.evaluate("() => window.scrollTo(0, 0)")
        f.evaluate(hide, True)
        n2 = len(feed_calls)
        add(g, "plus", name="Stretching", public=True)
        f.wait_for_timeout(2600)
        check(len(feed_calls) == n2, "cu aplicatia in fundal, fluxul nu este cerut")
        check(f.locator('#feed-list .post:has-text("Stretching")').count() == 0, "si lista ramane cum era")
        f.evaluate(hide, False)
        soft(lambda: wait_text(f, "#feed-list .post", "Stretching", 4000), "la revenirea in aplicatie, noutatea apare singura")

        # Cand serverul nu raspunde, lista ramane, incercarile se raresc, apoi totul isi revine singur.
        f.route("**/rest/v1/rpc/feed", lambda r: r.abort())
        n3 = len(feed_calls)
        f.wait_for_timeout(6000)
        tries = len(feed_calls) - n3
        check(1 <= tries <= 3, "cand serverul nu raspunde, incercarile se raresc (%d in 6 secunde)" % tries)
        check(f.locator("#feed-list .post").count() == 63 and f.locator("p.note.feed").count() == 0, "lista ramane pe ecran, fara mesaj de eroare")
        add(g, "plus", name="Plimbare", public=True)
        f.unroute("**/rest/v1/rpc/feed")
        soft(lambda: wait_text(f, "#feed-list .post", "Plimbare", 15000), "cand serverul raspunde din nou, fluxul isi revine singur")

        # Un raspuns intarziat pentru limba veche nu ajunge in lista limbii noi.
        late = []
        f.route("**/rest/v1/rpc/feed", lambda r: hold_first(r, late))
        soft(lambda: until(f, lambda: len(late) == 1, "o cerere de flux in romana oprita pe drum", 12000), "o cerere pentru fluxul in romana este tinuta pe drum")
        f.click('#nav a[data-route="profil"]')
        f.click('[data-lang="en"]')
        f.click('#nav a[data-route="flux"]')
        soft(lambda: wait_count(f, '#feed-list .post:has-text("Morning walk")', 1), "in engleza, fluxul arata activitatea in engleza")
        f.evaluate("""() => {
          window.__lost = 0;
          new MutationObserver(() => {
            const list = document.getElementById('feed-list');
            if (list && !list.textContent.includes('Morning walk')) window.__lost++;
          }).observe(document.getElementById('view'), { childList: true });
        }""")
        late[0][0].fulfill(response=late[0][1])
        f.wait_for_timeout(1500)
        f.unroute("**/rest/v1/rpc/feed")
        check(f.evaluate("() => window.__lost") == 0 and f.locator('#feed-list .post:has-text("Morning walk")').count() == 1, "raspunsul intarziat pentru limba veche nu strica lista noua")
        f.click('#nav a[data-route="profil"]')
        f.click('[data-lang="ro"]')
        f.click('#nav a[data-route="flux"]')
        soft(lambda: wait_count(f, '#feed-list .post:has-text("Morning walk")', 0), "inapoi in romana, activitatea in engleza dispare")
        soft(lambda: wait_text(f, "#feed-list .post", "Plimbare"), "iar lista in romana este la zi")

        # Dupa o pauza lunga pot fi mai multe noutati decat incap intr-un raspuns: lista nu ramane cu un gol in ea.
        # Val 30, ultima de pe prima pagina, are timpul pus de server, cu fractiuni de milisecunda: la Mai multe vine inca o data.
        check(f.locator("#feed-list .post").count() == 30, "inainte de pauza sunt 30 de activitati pe ecran")
        f.evaluate(hide, True)
        db("insert into public.entries (id, user_id, day, ts, type, pts, name, is_public, lang) "
           "select gen_random_uuid(), p.id, (now() at time zone 'UTC')::date, date_trunc('milliseconds', now()) - make_interval(secs => n / 1000.0) "
           "+ case when n = 30 then interval '700 microseconds' else interval '0' end, "
           "'plus', 5, 'Val ' || lpad(n::text, 2, '0'), true, 'ro' from public.profiles p, generate_series(1, 55) n where p.name = 'Gina'")
        f.evaluate(hide, False)
        soft(lambda: wait_text(f, "#feed-list .post", "Val 01"), "dupa pauza, cea mai noua activitate este prima")
        names = f.evaluate("() => [...document.querySelectorAll('#feed-list .post-t')].map((x) => x.textContent)")
        check(names == ["Val %02d" % n for n in range(1, 31)], "lista porneste din nou de la inceput, fara gol: %d activitati, ultima %s" % (len(names), names[-1] if names else "-"))
        check(f.locator('[data-act="feed-more"]').count() == 1, "restul se aduce cu Mai multe")
        f.evaluate("""() => {
          window.__twice = 0;
          new MutationObserver(() => {
            const names = [...document.querySelectorAll('#feed-list .post-t')].map((x) => x.textContent);
            if (new Set(names).size !== names.length) window.__twice++;
          }).observe(document.getElementById('view'), { childList: true });
        }""")
        f.click('[data-act="feed-more"]')
        soft(lambda: wait_text(f, "#feed-list", "Stretching"), "Mai multe continua de unde s-a oprit lista")
        f.wait_for_timeout(1500)
        names = f.evaluate("() => [...document.querySelectorAll('#feed-list .post-t')].map((x) => x.textContent)")
        check(names[28:33] == ["Val 29", "Val 30", "Val 31", "Val 32", "Val 33"] and f.evaluate("() => window.__twice") == 0, "nicio activitate nu apare de doua ori, nici macar o clipa: " + ", ".join(names[28:33]))
        check(names[53:57] == ["Val 54", "Val 55", "Plimbare", "Stretching"], "in ordine, fara nimic sarit: " + ", ".join(names[53:57]))

        # Prima incarcare nereusita se reia singura, fara apasat pe Incearca din nou.
        ctx_h, h = new_page()
        h.route("**/rest/v1/rpc/feed", lambda r: r.abort())
        sign_in(h, "gina@example.test", "parola-gina-4")
        h.wait_for_selector("#score")
        h.click('#nav a[data-route="flux"]')
        soft(lambda: wait_text(h, ".empty.feed", "Fluxul"), "fara raspuns de la server, ecranul Flux spune ca nu s-a putut incarca")
        check(h.locator('[data-focus="feed-retry"]').count() == 1, "si ofera Incearca din nou")
        h.unroute("**/rest/v1/rpc/feed")
        soft(lambda: wait_count(h, "#feed-list .post", 30, 15000), "cand serverul raspunde, fluxul se incarca singur")

        urllib.request.urlopen(BASE + "/__test/set?feed=0").read()
        ctx_f.close()
        ctx_g.close()
        ctx_h.close()

        # ------------------------------------------------------------ detalii la o activitate
        urllib.request.urlopen(BASE + "/__test/set?feed=1000").read()
        ctx_ma, ma = new_page()
        sign_up(ma, "maria@example.test", "parola-maria-7", "Maria")
        ma.wait_for_selector("#score")
        ctx_ne, ne = new_page()
        sign_up(ne, "nelu@example.test", "parola-nelu-88", "Nelu")
        ne.wait_for_selector("#score")

        ma.click("a.btn-plus")
        soft(lambda: ma.wait_for_selector("#note-row", timeout=8000), "cu baza de date la zi, formularul ofera randul Detalii")
        ma.fill("#act-name", "Am ajutat un coleg")
        ma.click('[data-act="note-open"]')
        check(text(ma, "#act-note-h") == "Le vede cine vede activitatea.", "sub camp scrie cine vede detaliile")
        typed = "  I-am arătat cum să își facă un cont.\r\n\n\n\nA durat o jumătate de oră. <b>țin minte</b> \t "
        clean = "I-am arătat cum să își facă un cont.\n\nA durat o jumătate de oră. <b>țin minte</b>"
        ma.fill("#act-note", typed)
        ma.click('[data-act="pub"][data-v="1"]')
        check(ma.input_value("#act-note").strip().startswith("I-am arătat"), "detaliile raman dupa alegerea vizibilitatii")
        shot(ma, "c15-detalii-notare.png", full=True)
        ma.click("#save-btn")
        ma.wait_for_selector("#score")
        row = '#today-list .row:has-text("Am ajutat un coleg")'
        check(ma.locator(row + " .note-ic").count() == 1, "in lista de azi activitatea poarta semnul de detalii")
        soft(lambda: saved(ma), "activitatea cu detalii ajunge in cont")
        check(db("select note from public.entries where name = 'Am ajutat un coleg'") == clean, "in baza: detaliile sunt pastrate curate, cu diacritice si randuri")

        ne.click('#nav a[data-route="flux"]')
        post = '#feed-list .post:has-text("Am ajutat un coleg")'
        soft(lambda: wait_count(ne, post, 1), "activitatea apare in fluxul lui Nelu")
        check(ne.locator(post + " .post-more .note-ic").count() == 1, "in flux titlul poarta semnul de detalii")
        check(ne.locator(post + " .post-note").count() == 0 and "I-am arătat" not in text(ne, "#feed-list"), "detaliile nu se vad pana nu apesi pe activitate")
        check(ne.get_attribute(post + " .post-more", "aria-expanded") == "false", "titlul spune ca detaliile sunt stranse")
        ne.click(post + " .post-more")
        check(text(ne, post + " .post-note") == clean, "la apasare apar detaliile, intregi: " + repr(text(ne, post + " .post-note")))
        check(ne.locator(post + " .post-note b").count() == 0, "detaliile altcuiva sunt aratate ca text, niciodata ca marcaje")
        check(ne.get_attribute(post + " .post-more", "aria-expanded") == "true", "titlul spune ca detaliile sunt deschise")
        shot(ne, "c16-detalii-flux.png")
        no_overflow(ne, "flux cu detalii 390")
        ne.wait_for_timeout(2600)
        check(ne.locator(post + " .post-note").count() == 1, "detaliile raman deschise cand fluxul se improspateaza singur")
        ne.click(post + " .cheer")
        soft(lambda: wait_text(ne, post + " .cheer", "Încurajat"), "o activitate cu detalii se incurajeaza la fel")
        check(ne.locator(post + " .post-note").count() == 1, "iar detaliile raman deschise")

        # Maria schimba detaliile mai tarziu; Nelu le vede schimbate fara sa atinga nimic.
        ma.click('#nav a[data-route="azi"]')
        ma.click(row)
        check(text(ma, "#dlg-n") == clean and text(ma, "#dlg-link") == "Schimbă detaliile sau poza", "dialogul Mariei arata detaliile si ofera schimbarea lor")
        shot(ma, "c17-detalii-dialog.png")
        ma.click("#dlg-link")
        check(text(ma, "h1") == "Detalii și poză" and "Le vede cine vede activitatea." in text(ma, "#note-input-h"), "ecranul de detalii spune cine le vede")
        ma.fill("#note-input", "I-am arătat cum să își facă un cont. Mâine îi arăt și restul.")
        ma.click("#note-btn")
        soft(lambda: wait_text(ne, post + " .post-note", "Mâine îi arăt și restul."), "detaliile schimbate apar singure la Nelu")
        check(db("select note from public.entries where name = 'Am ajutat un coleg'") == "I-am arătat cum să își facă un cont. Mâine îi arăt și restul.", "in baza: detaliile schimbate")
        check(db("select cheers_count from public.entries where name = 'Am ajutat un coleg'") == "1", "in baza: incurajarea a ramas dupa schimbarea detaliilor")

        # O activitate privata cu detalii ramane cu totul privata.
        add(ma, "minus", name="Ceva de tinut pentru mine")
        ma.click('#today-list .row:has-text("Ceva de tinut pentru mine")')
        ma.click("#dlg-link")
        ma.fill("#note-input", "Numai eu citesc asta.")
        ma.click("#note-btn")
        soft(lambda: saved(ma), "detaliile adaugate mai tarziu ajung in cont")
        check(db("select note || '/' || is_public from public.entries where name = 'Ceva de tinut pentru mine'") == "Numai eu citesc asta./false", "in baza: activitate privata, cu detalii")
        ne.click('[data-act="feed-refresh"]')
        ne.wait_for_timeout(800)
        check("Numai eu citesc" not in ne.content() and "Ceva de tinut" not in ne.content(), "nimic din activitatea privata nu ajunge la Nelu")

        # Si o favorita poate primi detalii.
        ma.click('#nav a[data-route="azi"]')
        ma.click("a.btn-plus")
        ma.click('.chip:has-text("Sală")')
        ma.click('[data-act="note-open"]')
        ma.fill("#act-note", "picioare, 45 de minute")
        ma.click("#save-btn")
        soft(lambda: saved(ma), "favorita cu detalii ajunge in cont")
        check(db("select key || '/' || note from public.entries e join public.profiles p on p.id = e.user_id where p.name = 'Maria' and key is not null") == "gym/picioare, 45 de minute", "in baza: favorita pastrata dupa cheie, cu detaliile ei")

        # Detalii schimbate chiar cat timp activitatea este pe drum spre cont: ramane ultima varianta.
        ma.click('#nav a[data-route="azi"]')
        onway = []
        ma.route("**/rest/v1/rpc/sync", lambda r: r.continue_() if onway else onway.append(r))
        ma.click("a.btn-plus")
        ma.fill("#act-name", "Pe drum")
        ma.click('[data-act="note-open"]')
        ma.fill("#act-note", "prima varianta")
        ma.click("#save-btn")
        soft(lambda: until(ma, lambda: len(onway) >= 1, "salvarea oprita pe drum", 6000), "salvarea activitatii noi este tinuta pe drum")
        ma.click('#today-list .row:has-text("Pe drum")')
        ma.click("#dlg-link")
        ma.fill("#note-input", "a doua varianta")
        ma.click("#note-btn")
        check(db("select count(*) from public.entries where name = 'Pe drum'") == "0", "activitatea inca nu a ajuns in baza")
        onway[0].continue_()
        soft(lambda: saved(ma), "dupa ce drumul se incheie, totul ajunge in cont")
        ma.unroute("**/rest/v1/rpc/sync")
        check(db("select note from public.entries where name = 'Pe drum'") == "a doua varianta", "in baza a ramas varianta scrisa ultima")
        ma.click('#nav a[data-route="azi"]')
        ma.click('#today-list .row:has-text("Pe drum")')
        check(text(ma, "#dlg-n") == "a doua varianta", "si pe ecran la fel")
        ma.click("#dlg-ok")
        soft(lambda: saved(ma), "activitatea de proba este stearsa")

        # Fara internet, schimbarea asteapta si pleaca singura mai tarziu.
        ma.click('#nav a[data-route="azi"]')
        ma.route("**/rest/v1/rpc/sync", lambda r: r.abort())
        ma.click(row)
        ma.click("#dlg-link")
        ma.fill("#note-input", "")
        ma.click("#note-btn")
        check(ma.locator(row + " .note-ic").count() == 0, "fara internet, stergerea detaliilor se vede imediat")
        soft(lambda: wait_text(ma, "#pending", "În așteptare: 1 modificare."), "si este numarata ca modificare in asteptare")
        check(db("select note is not null from public.entries where name = 'Am ajutat un coleg'") == "t", "in baza detaliile inca exista")
        ma.unroute("**/rest/v1/rpc/sync")
        ma.click('#nav a[data-route="profil"]')
        ma.click('[data-act="sync-now"]')
        soft(lambda: wait_text(ma, "#sync-status", "Totul e salvat în cont", 10000), "cand revine internetul, stergerea pleaca")
        check(db("select note is null from public.entries where name = 'Am ajutat un coleg'") == "t", "in baza: detaliile au fost sterse")
        soft(lambda: wait_count(ne, post + " .post-more", 0), "la Nelu titlul nu mai poarta semnul si nu se mai deschide")
        check(ne.locator(post + " .post-note").count() == 0 and ne.locator(post + " .post-t").count() == 1, "iar activitatea ramane in flux, fara detalii")

        # Pe un alt dispozitiv detaliile vin din cont.
        ctx_m2, m2 = new_page()
        sign_in(m2, "maria@example.test", "parola-maria-7")
        soft(lambda: wait_count(m2, "#today-list .row", 3), "pe al doilea dispozitiv apar cele trei activitati ale Mariei")
        m2.click('#today-list .row:has-text("Ceva de tinut pentru mine")')
        check(text(m2, "#dlg-n") == "Numai eu citesc asta.", "cu detaliile lor")
        m2.click("#dlg-cancel")
        ctx_m2.close()

        # Aplicatia si baza de date curata detaliile dupa aceeasi regula.
        samples = ["  a  ", "a\r\nb\rc", "a\n\n\n\n\nb", "\n\n a \n\n", "a\tb\u0001c", "", " \n ", "ș" * 400, "ab " * 200, "😀" * 400,
                   "x \n\n\n y", "a\u007fb", " \t a", "rând\n\n\n", "Țigară și cafea, în oraș", "a\n \n \n \nb", "  \r\n  două rânduri\r\n\r\n\r\n\r\ngata  "]
        diff = []
        for sample in samples:
            js = ma.evaluate("(s) => L.cleanNote(s)", sample)
            sql = json.loads(db("select to_jsonb(coalesce(public.note_text($j$%s$j$::jsonb #>> '{}'), ''))::text" % json.dumps(sample)))
            if js != sql:
                diff.append(repr(sample)[:30])
        check(not diff, "aplicatia si baza de date curata detaliile la fel: " + ", ".join(diff))

        # O baza de date ramasa la versiunea veche: aplicatia merge, doar ca nu ofera detalii.
        ctx_o, o = new_page()
        sent_notes = []

        def old_server(route):
            body = route.request.post_data_json or {}
            if "p_note" in body:
                sent_notes.append(body["p_note"])
            resp = route.fetch()
            data = resp.json()
            data.pop("v", None)
            route.fulfill(response=resp, json=data)

        o.route("**/rest/v1/rpc/sync", old_server)
        sign_in(o, "maria@example.test", "parola-maria-7")
        soft(lambda: wait_count(o, "#today-list .row", 3), "cu un server vechi, Maria isi vede activitatile")
        soft(lambda: saved(o), "si salvarea in cont merge")
        o.click('#nav a[data-route="azi"]')
        o.click("a.btn-plus")
        check(o.locator("#note-row").count() == 0 and o.locator("#act-note").count() == 0, "formularul nu ofera detalii cat timp serverul nu le poate pastra")
        o.click('.chip:has-text("Citit")')
        o.click("#save-btn")
        soft(lambda: saved(o), "o activitate noua se salveaza ca inainte")
        o.click('#nav a[data-route="azi"]')
        o.click('#today-list .row:has-text("Ceva de tinut pentru mine")')
        check(text(o, "#dlg-n") == "Numai eu citesc asta." and o.locator("#dlg-link").is_hidden(), "detaliile existente se vad, dar nu pot fi schimbate")
        o.click("#dlg-cancel")
        check(not sent_notes, "aplicatia nu trimite niciodata schimbari de detalii unui server vechi")
        ctx_o.close()

        urllib.request.urlopen(BASE + "/__test/set?feed=0").read()
        ctx_ma.close()
        ctx_ne.close()

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
