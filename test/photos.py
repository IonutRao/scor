"""Pozele activitatilor, cu mai multi utilizatori si mai multe dispozitive, pe baza locala construita la fel ca cea din Supabase.

   Porneste singur baza (test/db/start.sh) si serverul de test (test/server.py), care tine si locul fisierelor.
   Pozele se aleg ca un om: se apasa butonul din formular si se raspunde ferestrei de alegere a fisierelor.
   Rulare: python3 test/photos.py
"""
import json
import pathlib
import re
import tempfile
import time

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

from kit import BASE, check, db, finish, no_overflow, saved, setting, shot, sign_in, sign_up, soft, start, stop, text, until, wait_count, wait_text

PICS = pathlib.Path(tempfile.mkdtemp(prefix="scor-poze-"))
STORE = "**/storage/v1/object/photos/**"
# Cate poze asteapta pe dispozitiv, in baza de date a browserului, si sub ce forma sunt pastrate.
KEPT = """() => new Promise((res) => {
  const r = indexedDB.open('scor-poze', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('poze');
  r.onerror = () => res([-1, '']);
  r.onsuccess = () => {
    const d = r.result;
    let q;
    try { q = d.transaction('poze').objectStore('poze').getAll(); } catch (e) { d.close(); res([-1, String(e)]); return; }
    q.onsuccess = () => { d.close(); res([q.result.length, q.result.map((v) => Object.prototype.toString.call(v)).join(',')]); };
    q.onerror = () => { d.close(); res([-1, '']); };
  };
})"""
WIPE = """() => new Promise((res) => {
  const r = indexedDB.open('scor-poze', 1);
  r.onsuccess = () => {
    const d = r.result, t = d.transaction('poze', 'readwrite');
    t.objectStore('poze').clear();
    t.oncomplete = () => { d.close(); res(true); };
  };
})"""


def picture(name, w, h, kind="JPEG", alpha=False):
    """O poza de test care seamana cu una adevarata: culori care se schimba lin, plus cateva forme."""
    im = Image.new("RGBA" if alpha else "RGB", (w, h))
    px = im.load()
    for y in range(0, h, 4):
        for x in range(0, w, 4):
            c = (40 + 200 * x // w, 60 + 160 * y // h, 220 - 150 * x // w) + ((0 if (x // 64 + y // 64) % 5 == 0 else 255,) if alpha else ())
            for dy in range(4):
                for dx in range(4):
                    if x + dx < w and y + dy < h:
                        px[x + dx, y + dy] = c
    d = ImageDraw.Draw(im)
    d.ellipse([w // 5, h // 5, w // 2, h // 2], fill=(250, 240, 90) + ((255,) if alpha else ()))
    d.rectangle([w // 2, h // 2, w * 9 // 10, h * 8 // 10], outline=(20, 20, 60) + ((255,) if alpha else ()), width=max(4, w // 150))
    path = PICS / name
    im.save(path, kind, **({"quality": 95} if kind == "JPEG" else {}))
    return str(path)


CHOOSERS = {}


GALLERY = '[data-act="pic-pick"]:not([data-cam])'
CAMERA = '[data-act="pic-pick"][data-cam]'


def pick(page, form, path, between=None, press=None, camera=False):
    """Alege o poza ca un om: apasa butonul din formular (din telefon sau, cu camera=True, pe loc; sau o tasta, cu butonul
    deja ales), apoi raspunde ferestrei de alegere a fisierelor. Ferestrele deschise de o pagina se aduna in CHOOSERS,
    prin ascultatorul pus la crearea ei."""
    opened = CHOOSERS[page]
    del opened[:]
    button = "#%s-pic %s" % (form, CAMERA if camera else GALLERY)
    page.wait_for_selector(button, timeout=8000)
    if press:
        page.keyboard.press(press)
    else:
        page.click(button)
    until(page, lambda: len(opened) == 1, "fereastra de alegere a fisierelor nu s-a deschis (%s, %s)" % (form, pathlib.Path(path).name))
    if between:
        between()
    opened[0].set_files(path)


def nat(page, sel):
    """Marimea adevarata a pozei dintr-un <img>, sau None cat timp nu exista."""
    loc = page.locator(sel)
    if loc.count() == 0:
        return None
    return loc.first.evaluate("(i) => [i.naturalWidth, i.naturalHeight]")


def files_of(name):
    return db("select count(*) from storage.objects o join public.profiles p on o.name like p.id::text || '/%%' where p.name = '%s'" % name)


def photo_of(title):
    return db("select coalesce(photo, '-') from public.entries where name = '%s'" % title)


def fetch_photo(page, path):
    """Cere o poza direct, cu identitatea celui din pagina, ocolind aplicatia."""
    return page.evaluate("""async (path) => {
      const s = JSON.parse(localStorage.getItem('fake-sb-session'));
      const r = await fetch('/storage/v1/object/photos/' + path, { headers: { Authorization: 'Bearer ' + s.access_token } });
      return r.status;
    }""", path)


def local(page):
    return page.evaluate("() => JSON.parse(localStorage.getItem('scor.v1'))")


def sign_in_here(page, email, password):
    """Intra in cont pe ecranul de intrare deja afisat, fara sa reincarce pagina: asa se intampla pe telefon dupa o iesire."""
    page.wait_for_selector("#auth-btn")
    page.fill("#auth-email", email)
    page.fill("#auth-pass", password)
    page.click("#auth-btn")
    page.wait_for_selector("#score")


def today(page):
    page.click('#nav a[data-route="azi"]')
    page.wait_for_selector("#score")


def row(title):
    return '#today-list .row:has-text("%s")' % title


big = picture("mare.jpg", 3000, 2000)
tall = picture("inalta.png", 900, 1600, "PNG", alpha=True)
small = picture("mica.jpg", 320, 200)
(PICS / "nu-e-poza.jpg").write_text("acesta nu este o poza", encoding="utf-8")
big_kb = pathlib.Path(big).stat().st_size // 1024

server = start()
setting(feed=1000)
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
            CHOOSERS[pg] = []
            pg.on("filechooser", lambda fc, pg=pg: CHOOSERS[pg].append(fc))
            return ctx, pg

        ctx_oa, oa = new_page()
        syncs = []
        oa.on("request", lambda r: syncs.append(r.url) if r.url.endswith("/rest/v1/rpc/sync") else None)
        sign_up(oa, "oana@example.test", "parola-oana-9", "Oana")
        ctx_pe, pe = new_page()
        gets = []
        pe.on("request", lambda r: gets.append(r.url) if r.method == "GET" and "/storage/v1/object/photos/" in r.url else None)
        sign_up(pe, "petru@example.test", "parola-petru-1", "Petru")
        oana = db("select id from public.profiles where name = 'Oana'")

        # ------------------------------------------------------------ o activitate publica, notata cu poza
        oa.click("a.btn-plus")
        soft(lambda: oa.wait_for_selector("#act-pic", timeout=8000), "cu baza de date la zi, formularul ofera randul Poza")
        check(text(oa, "#act-pic " + GALLERY) == "Alege o poză" and "o vede cine vede activitatea" in text(oa, "#act-pic"), "randul spune cine vede poza si invita la alegere")
        check(oa.locator(CAMERA).count() == 0, "pe un calculator, fara ecran tactil, nu se ofera fotografierea pe loc")
        oa.fill("#act-name", "Tort pentru vecina")
        pick(oa, "act", str(PICS / "nu-e-poza.jpg"))
        soft(lambda: wait_text(oa, "#toast", "Poza nu a putut fi citită"), "un fisier care nu e poza este refuzat cu un mesaj clar")
        check(oa.locator("#act-pic .shot").count() == 0 and oa.input_value("#act-name") == "Tort pentru vecina", "si formularul ramane cum era")

        # La intoarcerea din camera sau din galeria telefonului ecranul se redeseneaza; alegerea nu are voie sa se piarda.
        oa.evaluate("() => document.getElementById('act-pic').setAttribute('data-vechi', '1')")
        redrawn = []

        def come_back():
            oa.evaluate("() => document.dispatchEvent(new Event('visibilitychange'))")
            redrawn.append(oa.locator("#act-pic[data-vechi]").count() == 0)

        pick(oa, "act", big, between=come_back)
        check(redrawn == [True], "cat timp omul alegea poza, ecranul s-a redesenat, ca la intoarcerea din camera telefonului")
        soft(lambda: oa.wait_for_selector("#act-pic .shot img", timeout=10000), "poza aleasa ajunge totusi in formular, micsorata")
        check(oa.input_value("#act-name") == "Tort pentru vecina", "alegerea pozei nu sterge ce era scris")
        check(text(oa, "#act-pic " + GALLERY) == "Alege o poză" and oa.locator('[data-act="pic-drop"]').count() == 1, "poza aleasa poate fi schimbata sau scoasa")
        oa.click('[data-act="pub"][data-v="1"]')
        check(oa.locator("#act-pic .shot img").count() == 1, "poza ramane dupa alegerea vizibilitatii")
        oa.wait_for_timeout(2500)
        oa.evaluate("() => window.scrollTo(0, document.documentElement.scrollHeight)")
        shot(oa, "p01-notare.png")
        no_overflow(oa, "notare cu poza 390")
        oa.click("#save-btn")
        oa.wait_for_selector("#score")
        check("are poză" in oa.locator(row("Tort pentru vecina") + " .note-ic .sr").inner_text(), "in lista de azi activitatea poarta semnul de poza")
        soft(lambda: saved(oa), "activitatea si poza ei ajung in cont")
        name1 = photo_of("Tort pentru vecina")
        check(re.match(r"^[0-9a-f]{16}-1280x853\.jpg$", name1) is not None, "in baza: poza are numele asteptat, cu marimea micsorata 1280x853 (%s)" % name1)
        size1 = int(db("select (metadata->>'size')::int from storage.objects where name = '%s/%s'" % (oana, name1)) or 0)
        check(0 < size1 < 400000, "fisierul din cont este mic: %d KB, din %d KB cat avea poza aleasa" % (size1 // 1024, big_kb))
        check(db("select metadata->>'mimetype' from storage.objects where name = '%s/%s'" % (oana, name1)) == "image/jpeg", "si este trimis ca imagine JPEG")
        check(files_of("Oana") == "1", "in locul de poze: un singur fisier al Oanei")
        check(oa.evaluate(KEPT)[0] == 0, "odata ajunsa in cont, poza nu mai ocupa loc pe dispozitiv")

        # ------------------------------------------------------------ ceilalti o vad doar cand o cer
        pe.click('#nav a[data-route="flux"]')
        post = '#feed-list .post:has-text("Tort pentru vecina")'
        soft(lambda: wait_count(pe, post, 1), "activitatea apare in fluxul lui Petru")
        check("are poză" in pe.locator(post + " .post-more .note-ic .sr").inner_text(), "in flux titlul poarta semnul de poza")
        pe.wait_for_timeout(1500)
        check(pe.locator(post + " .shot").count() == 0 and not gets, "poza nu este nici aratata, nici adusa pana nu apesi pe activitate")
        pe.click(post + " .post-more")
        soft(lambda: pe.wait_for_selector(post + " .shot img", timeout=8000), "la apasare poza apare")
        check(nat(pe, post + " .shot img") == [1280, 853], "este poza micsorata, intreaga")
        box = pe.locator(post + " .shot").first.evaluate("(el) => { const b = el.getBoundingClientRect(); return b.width / b.height; }")
        check(abs(box - 1280 / 853) < 0.02, "locul ei pe ecran are forma pozei")
        shot(pe, "p02-flux.png")
        no_overflow(pe, "flux cu poza 390")
        pe.click(post + " .post-more")
        pe.click(post + " .post-more")
        pe.wait_for_timeout(2600)
        check(pe.locator(post + " .shot img").count() == 1 and len(gets) == 1, "poza este adusa o singura data, oricate improspatari si deschideri urmeaza (%d)" % len(gets))

        # ------------------------------------------------------------ Oana isi vede poza; pe alt dispozitiv vine din cont
        today(oa)
        oa.click(row("Tort pentru vecina"))
        soft(lambda: oa.wait_for_selector("#dlg-p .shot img", timeout=8000), "dialogul Oanei arata poza")
        check(text(oa, "#dlg-link") == "Schimbă detaliile sau poza", "si ofera schimbarea ei")
        shot(oa, "p03-dialog.png")
        oa.click("#dlg-cancel")
        ctx_o2, o2 = new_page()
        sign_in(o2, "oana@example.test", "parola-oana-9")
        soft(lambda: wait_count(o2, "#today-list .row", 1), "pe al doilea dispozitiv apare activitatea")
        o2.click(row("Tort pentru vecina"))
        soft(lambda: o2.wait_for_selector("#dlg-p .shot img", timeout=8000), "cu poza adusa din cont")
        o2.click("#dlg-cancel")

        # ------------------------------------------------------------ poza unei activitati private nu poate fi adusa de altcineva
        oa.click("a.btn-plus")
        oa.fill("#act-name", "Doar pentru mine")
        oa.focus("#act-pic " + GALLERY)
        pick(oa, "act", tall, press="Enter")
        soft(lambda: oa.wait_for_selector("#act-pic .shot img", timeout=10000), "poza se poate alege si doar cu tastatura")
        check(oa.evaluate("() => document.activeElement && document.activeElement.getAttribute('data-focus')") == "act-pick", "iar dupa alegere tastatura ramane pe randul pozei")
        oa.click('[data-act="pub"][data-v="0"]')
        oa.click("#save-btn")
        soft(lambda: saved(oa), "activitatea privata cu poza ajunge in cont")
        name2 = photo_of("Doar pentru mine")
        check(re.match(r"^[0-9a-f]{16}-720x1280\.jpg$", name2) is not None, "poza inalta este micsorata la 720x1280 (%s)" % name2)
        check(fetch_photo(oa, oana + "/" + name2) == 200, "Oana isi poate aduce poza privata")
        check(fetch_photo(pe, oana + "/" + name2) == 400, "Petru nu o poate aduce, nici daca ii stie adresa")
        check(fetch_photo(pe, oana + "/" + name1) == 200, "pe cea publica o poate aduce")
        pe.click('[data-act="feed-refresh"]')
        pe.wait_for_timeout(800)
        check("Doar pentru mine" not in pe.content() and name2 not in pe.content(), "si nimic despre ea nu ajunge in pagina lui")
        today(oa)
        oa.click(row("Doar pentru mine"))
        oa.click("#dlg-extra")
        soft(lambda: saved(oa), "Oana o arata in flux")
        check(fetch_photo(pe, oana + "/" + name2) == 200, "acum Petru ii poate aduce poza")
        today(oa)
        oa.click(row("Doar pentru mine"))
        soft(lambda: oa.wait_for_selector("#dlg-p .shot img", timeout=8000), "poza inalta se vede in dialog")
        box = oa.locator("#dlg-p .shot").first.bounding_box()
        check(box["height"] <= 844 * 0.46 + 1, "fara sa impinga butoanele dialogului in afara ecranului (%d px)" % box["height"])
        check(abs(box["width"] / box["height"] - 720 / 1280) < 0.02, "iar locul ei se ingusteaza cat sa pastreze forma pozei, fara margini goale")
        shot(oa, "p04-dialog-inalta.png")
        oa.click("#dlg-extra")
        soft(lambda: saved(oa), "Oana o scoate din nou din flux")
        check(fetch_photo(pe, oana + "/" + name2) == 400, "si Petru nu o mai poate aduce")

        # ------------------------------------------------------------ poza schimbata mai tarziu
        today(oa)
        oa.click(row("Tort pentru vecina"))
        oa.click("#dlg-link")
        soft(lambda: oa.wait_for_selector("#note-pic .shot img", timeout=8000), "ecranul de detalii arata poza de acum")
        check(text(oa, "h1") == "Detalii și poză", "ecranul se numeste Detalii si poza")
        oa.fill("#note-input", "Cu ciocolată și vișine.")
        pick(oa, "note", small)
        soft(lambda: until(oa, lambda: nat(oa, "#note-pic .shot img") == [320, 200], "poza noua in formular"), "poza noua ii ia locul in formular")
        check(oa.input_value("#note-input") == "Cu ciocolată și vișine.", "schimbarea pozei nu sterge detaliile scrise")
        shot(oa, "p05-schimbare.png")
        oa.click("#note-btn")
        soft(lambda: wait_text(oa, "#toast", "Modificări salvate"), "salvarea este confirmata")
        soft(lambda: saved(oa), "schimbarile ajung in cont")
        name3 = photo_of("Tort pentru vecina")
        check(name3 != name1 and name3.endswith("-320x200.jpg"), "in baza: activitatea are poza noua, nemarita (%s)" % name3)
        soft(lambda: until(oa, lambda: files_of("Oana") == "2", "curatenia din locul de poze"), "poza veche a fost stearsa din cont: raman doua fisiere")
        check(fetch_photo(oa, oana + "/" + name1) == 400, "cea veche nu mai exista")
        soft(lambda: until(pe, lambda: nat(pe, post + " .shot img") == [320, 200], "poza noua la Petru"), "la Petru poza noua apare singura")
        check("Cu ciocolată și vișine." in text(pe, post), "impreuna cu detaliile")

        # Al doilea dispozitiv afla de schimbare si nu strica nimic cand isi face curatenia.
        o2.click('#nav a[data-route="profil"]')
        o2.click('[data-act="sync-now"]')
        soft(lambda: until(o2, lambda: any(e.get("photo") == name3 for e in local(o2)["entries"]), "starea contului pe al doilea dispozitiv"), "al doilea dispozitiv afla de poza noua")
        today(o2)
        o2.click(row("Tort pentru vecina"))
        soft(lambda: until(o2, lambda: nat(o2, "#dlg-p .shot img") == [320, 200], "poza noua pe al doilea dispozitiv"), "al doilea dispozitiv arata poza noua")
        o2.click("#dlg-cancel")
        o2.wait_for_timeout(1200)
        check(files_of("Oana") == "2" and fetch_photo(oa, oana + "/" + name3) == 200, "iar pozele de acum raman la locul lor")
        check(local(o2)["outbox"]["gone"] == [], "dupa curatenie, al doilea dispozitiv nu mai are nimic de sters")

        # ------------------------------------------------------------ un raspuns pierdut, apoi poza schimbata de pe alt dispozitiv
        # Telefonul leaga poza P1, contul o primeste, dar raspunsul se pierde si telefonul ramane fara legatura; laptopul pune
        # P2 in loc si sterge P1; telefonul repeta legatura veche. Contul trebuie sa ramana la P2, iar P2 sa nu fie stearsa.
        lost = []

        def lose_answer(route):
            body = route.request.post_data_json or {}
            if lost:
                return route.abort()
            if "p_photo" in body:
                lost.append(body["p_photo"])
                route.fetch()
                return route.abort()
            route.continue_()

        oa.route("**/rest/v1/rpc/sync", lose_answer)
        today(oa)
        oa.click("a.btn-plus")
        oa.fill("#act-name", "Ciorba de legume")
        pick(oa, "act", small)
        oa.wait_for_selector("#act-pic .shot img", timeout=10000)
        oa.click("#save-btn")
        soft(lambda: until(oa, lambda: len(lost) == 1, "legatura pozei"), "contul a primit legatura pozei P1, dar raspunsul s-a pierdut pe drum")
        p1 = photo_of("Ciorba de legume")
        check(p1.endswith("-320x200.jpg") and len(local(oa)["outbox"]["photo"]) == 1, "in baza: P1; pe telefon legatura asteapta sa fie trimisa din nou")
        o2.click('#nav a[data-route="profil"]')
        o2.click('[data-act="sync-now"]')
        soft(lambda: until(o2, lambda: any(e.get("photo") == p1 for e in local(o2)["entries"]), "starea contului pe laptop"), "laptopul afla de activitate si de P1")
        today(o2)
        o2.click(row("Ciorba de legume"))
        o2.click("#dlg-link")
        o2.wait_for_selector("#note-pic .shot")
        pick(o2, "note", big)
        soft(lambda: until(o2, lambda: nat(o2, "#note-pic .shot img") == [1280, 853], "poza noua pe laptop"), "pe laptop Oana pune alta poza, P2")
        o2.click("#note-btn")
        soft(lambda: saved(o2), "schimbarea ajunge in cont")
        p2 = photo_of("Ciorba de legume")
        check(p2 != p1 and p2.endswith("-1280x853.jpg"), "in baza: P2")
        soft(lambda: until(o2, lambda: fetch_photo(o2, oana + "/" + p1) == 400, "stergerea lui P1"), "iar laptopul sterge P1 din cont")
        oa.unroute("**/rest/v1/rpc/sync")
        oa.click('#nav a[data-route="profil"]')
        oa.click('[data-act="sync-now"]')
        soft(lambda: until(oa, lambda: local(oa)["outbox"]["photo"] == [], "repetarea legaturii"), "telefonul repeta legatura veche si o lasa in urma")
        check(photo_of("Ciorba de legume") == p2, "contul nu se lasa dus inapoi la o poza al carei fisier nu mai exista")
        oa.wait_for_timeout(1500)
        check(fetch_photo(oa, oana + "/" + p2) == 200 and files_of("Oana") == "3", "iar P2 ramane la locul ei")
        today(oa)
        oa.click(row("Ciorba de legume"))
        soft(lambda: until(oa, lambda: nat(oa, "#dlg-p .shot img") == [1280, 853], "P2 pe telefon"), "telefonul arata P2")
        oa.click("#dlg-ok")
        soft(lambda: saved(oa), "activitatea de proba este stearsa")
        soft(lambda: until(oa, lambda: files_of("Oana") == "2", "curatenia"), "impreuna cu P2")

        # ------------------------------------------------------------ un raspuns pierdut la notare, apoi activitatea stearsa
        # Contul a primit activitatea, dar raspunsul s-a pierdut; omul o sterge: stergerea trebuie sa ajunga si in cont,
        # altfel activitatea ar reaparea, cu trimitere la o poza stearsa intre timp.
        lost = []

        def lose_add(route):
            body = route.request.post_data_json or {}
            if lost:
                return route.abort()
            if any(e.get("name") == "Oglinda curata" for e in body.get("p_add", [])):
                lost.append(1)
                route.fetch()
                return route.abort()
            route.continue_()

        oa.route("**/rest/v1/rpc/sync", lose_add)
        today(oa)
        oa.click("a.btn-plus")
        oa.fill("#act-name", "Oglinda curata")
        pick(oa, "act", small)
        oa.wait_for_selector("#act-pic .shot img", timeout=10000)
        oa.click("#save-btn")
        soft(lambda: until(oa, lambda: len(lost) == 1, "notarea"), "contul a primit activitatea, dar raspunsul s-a pierdut")
        soft(lambda: until(oa, lambda: files_of("Oana") == "3", "incarcarea"), "poza ei a ajuns in cont")
        check(db("select count(*) from public.entries where name = 'Oglinda curata'") == "1" and any(e["sync"] == 1 for e in local(oa)["entries"]), "pe telefon activitatea pare inca netrimisa")
        oa.click(row("Oglinda curata"))
        oa.click("#dlg-ok")
        oa.unroute("**/rest/v1/rpc/sync")
        soft(lambda: saved(oa), "Oana o sterge, iar stergerea ajunge in cont")
        check(db("select count(*) from public.entries where name = 'Oglinda curata'") == "0", "in baza: activitatea nu mai exista, nu reapare")
        soft(lambda: until(oa, lambda: files_of("Oana") == "2", "curatenia"), "iar poza ei este stearsa din cont")
        today(oa)
        check(oa.locator(row("Oglinda curata")).count() == 0, "si pe telefon a ramas stearsa")

        # ------------------------------------------------------------ poza scoasa, apoi activitatea stearsa
        today(oa)
        oa.click(row("Tort pentru vecina"))
        oa.click("#dlg-link")
        oa.wait_for_selector("#note-pic .shot")
        oa.click('[data-act="pic-drop"]')
        check(oa.locator("#note-pic .shot").count() == 0 and text(oa, "#note-pic " + GALLERY) == "Alege o poză", "dupa Scoate poza, formularul invita din nou la alegere")
        deletes = []
        oa.route("**/storage/v1/object/photos", lambda r: deletes.append(r) if r.request.method == "DELETE" else r.continue_())
        oa.click("#note-btn")
        soft(lambda: saved(oa), "scoaterea pozei ajunge in cont")
        check(photo_of("Tort pentru vecina") == "-", "in baza: activitatea nu mai are poza")
        soft(lambda: until(oa, lambda: len(deletes) == 1, "stergerea fisierului"), "stergerea fisierului porneste si este tinuta pe loc")
        oa.click('[data-act="signout"]')
        soft(lambda: wait_text(oa, "#dlg-b", "Ai modificări care nu au ajuns încă în cont"), "cat timp fisierul asteapta sa fie sters, iesirea din cont avertizeaza")
        oa.click("#dlg-cancel")
        deletes[0].continue_()
        oa.unroute("**/storage/v1/object/photos")
        soft(lambda: until(oa, lambda: files_of("Oana") == "1", "curatenia"), "fisierul ei a fost sters din cont")
        today(oa)
        marks = oa.locator(row("Tort pentru vecina") + " .note-ic")
        check(marks.count() == 1 and "are detalii" in marks.first.inner_text(), "in lista a ramas doar semnul de detalii")
        soft(lambda: wait_count(pe, post + " .shot", 0), "la Petru poza dispare singura")
        oa.click(row("Doar pentru mine"))
        oa.click("#dlg-ok")
        soft(lambda: saved(oa), "stergerea activitatii private ajunge in cont")
        soft(lambda: until(oa, lambda: files_of("Oana") == "0", "curatenia"), "odata cu activitatea se sterge si poza ei din cont")

        # ------------------------------------------------------------ fara legatura cu locul de poze
        oa.route(STORE, lambda r: r.abort() if r.request.method == "POST" else r.continue_())
        today(oa)
        oa.click("a.btn-plus")
        oa.fill("#act-name", "Plimbare la apus")
        pick(oa, "act", big)
        oa.wait_for_selector("#act-pic .shot img", timeout=10000)
        oa.click("#save-btn")
        soft(lambda: wait_text(oa, "#pending", "În așteptare: 1 modificare."), "poza care nu a putut pleca este numarata ca modificare in asteptare")
        check(db("select count(*) || '/' || count(photo) from public.entries where name = 'Plimbare la apus'") == "1/0", "in baza: activitatea a ajuns, fara poza inca")
        check(oa.locator(row("Plimbare la apus") + " .note-ic").count() == 1, "pe dispozitiv activitatea isi arata deja poza")
        kept = oa.evaluate(KEPT)
        check(kept == [1, "[object ArrayBuffer]"], "poza care asteapta este pastrata pe dispozitiv, ca octeti (%s)" % kept)
        before = len(syncs)
        oa.wait_for_timeout(3000)
        check(len(syncs) - before <= 1, "cat timp poza asteapta, aplicatia nu intreaba serverul la nesfarsit (%d cereri in 3 secunde)" % (len(syncs) - before))
        oa.reload()
        oa.wait_for_selector("#score")
        oa.click(row("Plimbare la apus"))
        soft(lambda: oa.wait_for_selector("#dlg-p .shot img", timeout=8000), "dupa inchiderea si redeschiderea aplicatiei, poza inca e pe dispozitiv")
        oa.click("#dlg-cancel")
        check(files_of("Oana") == "0", "in locul de poze inca nu a ajuns nimic")
        oa.click('#nav a[data-route="profil"]')
        check("Fără internet" in text(oa, "#sync-status") and oa.locator("#photo-err").count() == 0, "Profilul spune ca lipseste legatura si ca poza pleaca singura cand revine")
        oa.unroute(STORE)
        oa.click('[data-act="sync-now"]')
        soft(lambda: wait_text(oa, "#sync-status", "Totul e salvat în cont", 15000), "cand legatura revine, poza pleaca")
        check(photo_of("Plimbare la apus").endswith("-1280x853.jpg") and files_of("Oana") == "1", "in baza: activitatea are acum poza, iar fisierul este in cont")

        # ------------------------------------------------------------ poze pe care serverul nu le primeste
        db("update storage.buckets set file_size_limit = 2000 where id = 'photos'")
        today(oa)
        oa.click("a.btn-plus")
        oa.fill("#act-name", "Poza prea mare")
        pick(oa, "act", small)
        oa.wait_for_selector("#act-pic .shot img", timeout=10000)
        oa.click("#save-btn")
        soft(lambda: wait_text(oa, "#toast", "Poza nu a fost primită de server", 10000), "un fisier prea mare pentru server: omul afla ca poza nu a fost primita")
        soft(lambda: saved(oa), "si nu ramane nimic in asteptare")
        today(oa)
        check(oa.locator(row("Poza prea mare") + " .note-ic").count() == 0 and photo_of("Poza prea mare") == "-", "activitatea ramane notata, fara poza")
        db("update storage.buckets set file_size_limit = 1048576 where id = 'photos'")

        # Un refuz fara motiv limpede (o sesiune expirata pentru o clipa, o baza de date nepregatita): poza nu se pierde.
        # Asteapta, cu motivul aratat in Profil, si pleaca atunci cand serverul o primeste.
        refusals = []

        def refuse(route):
            if route.request.method != "POST":
                return route.continue_()
            refusals.append(1)
            route.fulfill(status=400, content_type="application/json",
                          body=json.dumps({"statusCode": "403", "error": "Unauthorized", "message": "new row violates row-level security policy"}))

        oa.route(STORE, refuse)
        oa.click("a.btn-plus")
        oa.fill("#act-name", "Poza respinsa")
        pick(oa, "act", small)
        oa.wait_for_selector("#act-pic .shot img", timeout=10000)
        oa.click("#save-btn")
        soft(lambda: until(oa, lambda: len(refusals) == 1, "primul refuz"), "serverul refuza poza o data")
        oa.click('#nav a[data-route="profil"]')
        soft(lambda: until(oa, lambda: all(e["sync"] == 0 for e in local(oa)["entries"]), "activitatea in cont"), "activitatea insasi ajunge in cont")

        def waiting():
            kept = local(oa)
            return len(kept["uploads"]) == 1 and len(kept["outbox"]["photo"]) == 1 and "În așteptare: 1 modificare" in text(oa, "#sync-status")

        check(waiting(), "dupa primul refuz poza inca asteapta sa plece")
        check("Salvarea nu a reușit" in text(oa, "#sync-status") and "Fără internet" not in text(oa, "#sync-status"), "Profilul spune ca salvarea nu a reusit, nu ca lipseste internetul")
        check("403" in text(oa, "#photo-err") and "row-level security" in text(oa, "#photo-err"), "si arata motivul dat de server, ca sa se poata afla ce nu merge (%s)" % text(oa, "#photo-err"))
        no_overflow(oa, "profil cu motivul refuzului 390")
        shot(oa, "p10-profil-refuz.png", full=True)
        for n in (2, 3, 4, 5):
            oa.click('[data-act="sync-now"]')
            soft(lambda n=n: until(oa, lambda: len(refusals) >= n, "refuzul %d" % n), "la o noua incercare serverul o refuza din nou (%d)" % n)
        oa.wait_for_timeout(400)
        check(waiting() and photo_of("Poza respinsa") == "-", "oricate refuzuri ar primi, poza asteapta mai departe: nu se renunta la ea")
        oa.unroute(STORE)
        oa.click('[data-act="sync-now"]')
        soft(lambda: wait_text(oa, "#sync-status", "Totul e salvat în cont", 10000), "cand serverul o primeste in sfarsit, poza pleaca")
        check(photo_of("Poza respinsa").endswith("-320x200.jpg") and files_of("Oana") == "2", "in baza: activitatea are poza, iar fisierul este in cont")
        check(oa.locator("#photo-err").count() == 0, "iar motivul refuzului a disparut din Profil")
        today(oa)
        oa.click(row("Poza respinsa"))
        oa.click("#dlg-ok")
        soft(lambda: saved(oa), "activitatea de proba este stearsa")
        soft(lambda: until(oa, lambda: files_of("Oana") == "1", "curatenia"), "impreuna cu poza ei")

        # O poza pusa in locul alteia, cazuta o data din lipsa de legatura si apoi refuzata definitiv: cea veche se sterge din cont
        # fara sa mai astepte o alta ocazie, iar contul afla ca activitatea a ramas fara poza.
        today(oa)
        oa.click("a.btn-plus")
        oa.fill("#act-name", "Cu poza veche")
        pick(oa, "act", small)
        oa.wait_for_selector("#act-pic .shot img", timeout=10000)
        oa.click("#save-btn")
        soft(lambda: saved(oa), "o activitate cu poza ajunge in cont")
        check(files_of("Oana") == "2", "inainte: doua fisiere in cont")
        dropped = []

        def flaky(route):
            if route.request.method == "POST" and not dropped:
                dropped.append(1)
                return route.abort()
            route.continue_()

        oa.route(STORE, flaky)
        db("update storage.buckets set file_size_limit = 2000 where id = 'photos'")
        today(oa)
        oa.click(row("Cu poza veche"))
        oa.click("#dlg-link")
        oa.wait_for_selector("#note-pic .shot")
        pick(oa, "note", big)
        soft(lambda: until(oa, lambda: nat(oa, "#note-pic .shot img") == [1280, 853], "poza noua in formular"), "Oana ii alege alta poza")
        oa.click("#note-btn")
        soft(lambda: until(oa, lambda: len(dropped) == 1, "prima incercare"), "prima incercare de incarcare cade din lipsa de legatura")
        soft(lambda: wait_text(oa, "#pending", "În așteptare: 1 modificare."), "poza noua asteapta")
        # Omul revine in aplicatie: poza mai face o incercare, pe care serverul o refuza definitiv.
        oa.evaluate("() => document.dispatchEvent(new Event('visibilitychange'))")
        soft(lambda: wait_text(oa, "#toast", "Poza nu a fost primită de server", 10000), "serverul o refuza definitiv, iar Oana afla")
        oa.unroute(STORE)
        db("update storage.buckets set file_size_limit = 1048576 where id = 'photos'")
        soft(lambda: saved(oa), "nimic nu mai asteapta")
        soft(lambda: until(oa, lambda: files_of("Oana") == "1", "curatenia", 6000), "iar poza veche este stearsa din cont fara sa mai astepte o alta ocazie")
        check(photo_of("Cu poza veche") == "-", "in baza: activitatea a ramas fara poza")
        today(oa)
        oa.click(row("Cu poza veche"))
        oa.click("#dlg-ok")
        soft(lambda: saved(oa), "activitatea de proba este stearsa")

        # Poza care asteapta s-a pierdut de pe dispozitiv (de exemplu browserul si-a golit spatiul): activitatea ramane fara ea.
        oa.route(STORE, lambda r: r.abort() if r.request.method == "POST" else r.continue_())
        today(oa)
        oa.click("a.btn-plus")
        oa.fill("#act-name", "Poza ratacita")
        pick(oa, "act", small)
        oa.wait_for_selector("#act-pic .shot img", timeout=10000)
        oa.click("#save-btn")
        soft(lambda: wait_text(oa, "#pending", "În așteptare: 1 modificare."), "o alta poza asteapta pe dispozitiv")
        oa.evaluate(WIPE)
        oa.unroute(STORE)
        oa.reload()
        soft(lambda: wait_text(oa, "#toast", "Poza nu a mai fost găsită pe dispozitiv", 10000), "o poza pierduta de pe dispozitiv inainte sa plece: omul afla")
        soft(lambda: saved(oa), "si nimic nu ramane in asteptare la nesfarsit")
        today(oa)
        check(oa.locator(row("Poza ratacita") + " .note-ic").count() == 0 and photo_of("Poza ratacita") == "-", "activitatea ramane notata, fara poza")

        # ------------------------------------------------------------ o incarcare cazuta nu intarzie curatenia de mai tarziu
        today(oa)
        oa.click("a.btn-plus")
        oa.fill("#act-name", "Cu poza de sters")
        pick(oa, "act", small)
        oa.wait_for_selector("#act-pic .shot img", timeout=10000)
        oa.click("#save-btn")
        soft(lambda: saved(oa), "o activitate cu poza ajunge in cont")
        check(files_of("Oana") == "2", "inainte: doua fisiere in cont")
        oa.route(STORE, lambda r: r.abort() if r.request.method == "POST" else r.continue_())
        today(oa)
        oa.click("a.btn-plus")
        oa.fill("#act-name", "Trecatoare")
        pick(oa, "act", small)
        oa.wait_for_selector("#act-pic .shot img", timeout=10000)
        oa.click("#save-btn")
        soft(lambda: wait_text(oa, "#pending", "În așteptare: 1 modificare."), "o alta poza nu poate pleca")
        oa.wait_for_timeout(9000)
        oa.click(row("Trecatoare"))
        oa.click("#dlg-link")
        oa.wait_for_selector("#note-pic .shot")
        oa.click('[data-act="pic-drop"]')
        oa.click("#note-btn")
        soft(lambda: saved(oa), "Oana renunta la ea; nimic nu mai asteapta")
        oa.unroute(STORE)
        today(oa)
        oa.click(row("Cu poza de sters"))
        oa.click("#dlg-link")
        oa.wait_for_selector("#note-pic .shot")
        oa.click('[data-act="pic-drop"]')
        oa.click("#note-btn")
        soft(lambda: saved(oa), "apoi scoate poza celeilalte activitati")
        soft(lambda: until(oa, lambda: files_of("Oana") == "1", "curatenia", 5000), "iar fisierul ei dispare din cont imediat, nu la urmatoarea ocazie")
        today(oa)
        for title in ("Trecatoare", "Cu poza de sters"):
            oa.click(row(title))
            oa.click("#dlg-ok")
        soft(lambda: saved(oa), "activitatile de proba sunt sterse")

        # ------------------------------------------------------------ o eroare trecatoare a bazei de date a browserului
        # Pe telefoane, dupa mult timp in fundal, prima citire din baza de date a browserului poate cadea. Poza nu este pierduta.
        oa.route(STORE, lambda r: r.abort() if r.request.method == "POST" else r.continue_())
        today(oa)
        oa.click("a.btn-plus")
        oa.fill("#act-name", "Poza rabdatoare")
        pick(oa, "act", small)
        oa.wait_for_selector("#act-pic .shot img", timeout=10000)
        oa.click("#save-btn")
        soft(lambda: wait_text(oa, "#pending", "În așteptare: 1 modificare."), "o poza asteapta pe dispozitiv")
        # Scriptul de mai jos ramane pentru toate incarcarile viitoare ale paginii; cade o singura data, la prima citire de dupa el.
        oa.context.add_init_script("""(() => {
          const open = IDBDatabase.prototype.transaction;
          IDBDatabase.prototype.transaction = function (store, mode) {
            if (mode !== 'readwrite' && !localStorage.getItem('idb-a-cazut')) {
              localStorage.setItem('idb-a-cazut', '1');
              throw new DOMException('Connection to Indexed Database server lost. Refresh the page to try again', 'UnknownError');
            }
            return open.apply(this, arguments);
          };
        })()""")
        oa.reload()
        oa.wait_for_selector("#score")
        oa.wait_for_timeout(2500)
        check(len(local(oa)["uploads"]) == 1 and oa.locator(row("Poza rabdatoare") + " .note-ic").count() == 1, "o eroare la prima citire nu inseamna ca poza s-a pierdut: ea asteapta mai departe")
        oa.unroute(STORE)
        oa.click('#nav a[data-route="profil"]')
        oa.click('[data-act="sync-now"]')
        soft(lambda: wait_text(oa, "#sync-status", "Totul e salvat în cont", 10000), "la urmatoarea incercare pleaca")
        check(photo_of("Poza rabdatoare").endswith("-320x200.jpg") and files_of("Oana") == "2", "in baza: activitatea are poza")
        today(oa)
        oa.click(row("Poza rabdatoare"))
        oa.click("#dlg-ok")
        soft(lambda: saved(oa), "activitatea de proba este stearsa")
        soft(lambda: until(oa, lambda: files_of("Oana") == "1", "curatenia"), "impreuna cu poza ei")

        # ------------------------------------------------------------ curatenia dupa schimbari facute in alta parte
        # O activitate cu poza dispare din cont fara ca fisierul sa fie sters (asa face o versiune mai veche a aplicatiei).
        check(files_of("Oana") == "1", "inainte: Oana are un fisier, cel al plimbarii")
        db("delete from public.entries where name = 'Plimbare la apus'")
        oa.click('#nav a[data-route="profil"]')
        oa.click('[data-act="sync-now"]')
        soft(lambda: until(oa, lambda: files_of("Oana") == "0", "curatenia"), "o poza ramasa in cont dupa disparitia activitatii ei este stearsa de dispozitivul care o stia")
        today(oa)
        check(oa.locator(row("Plimbare la apus")).count() == 0, "iar activitatea a disparut si de pe dispozitiv")

        # ------------------------------------------------------------ un server ramas la versiunea dinaintea pozelor
        today(oa)
        oa.click("a.btn-plus")
        oa.fill("#act-name", "Rasarit la munte")
        pick(oa, "act", big)
        oa.wait_for_selector("#act-pic .shot img", timeout=10000)
        oa.click('[data-act="pub"][data-v="1"]')
        oa.click("#save-btn")
        soft(lambda: saved(oa), "o noua activitate publica cu poza ajunge in cont")

        # Lista de curatenie nu are voie sa stearga o poza pe care o activitate o foloseste, orice ar scrie in ea.
        name4 = photo_of("Rasarit la munte")
        today(oa)
        oa.evaluate("(n) => { const d = JSON.parse(localStorage.getItem('scor.v1')); d.outbox.gone.push(n); localStorage.setItem('scor.v1', JSON.stringify(d)); }", name4)
        oa.reload()
        oa.wait_for_selector("#score")
        soft(lambda: until(oa, lambda: local(oa)["outbox"]["gone"] == [], "lista de curatenie"), "o poza ajunsa din greseala pe lista de curatenie este scoasa de pe ea")
        oa.wait_for_timeout(800)
        check(files_of("Oana") == "1" and fetch_photo(oa, oana + "/" + name4) == 200, "si ramane neatinsa in cont")
        ctx_ov, ov = new_page()
        sign_in(ov, "oana@example.test", "parola-oana-9")
        soft(lambda: wait_count(ov, row("Rasarit la munte") + " .note-ic", 1), "un al treilea dispozitiv vede activitatea cu poza")
        sent_photos = []

        def before_photos(route):
            body = route.request.post_data_json or {}
            if "p_photo" in body:
                sent_photos.append(body["p_photo"])
            resp = route.fetch()
            data = resp.json()
            data["v"] = 3
            for e in data.get("entries", []):
                e.pop("photo", None)
            route.fulfill(response=resp, json=data)

        ov.route("**/rest/v1/rpc/sync", before_photos)
        ov.click('#nav a[data-route="profil"]')
        ov.click('[data-act="sync-now"]')
        today(ov)
        soft(lambda: wait_count(ov, row("Rasarit la munte") + " .note-ic", 0), "raspunsul unui server fara poze: activitatea ramane, fara semnul de poza")
        ov.click("a.btn-plus")
        soft(lambda: ov.wait_for_selector("#note-row", timeout=8000), "formularul ofera detalii")
        check(ov.locator('[data-act="pic-pick"]').count() == 0, "dar nu ofera poza")
        ov.click("a.icon-btn")
        ov.click(row("Rasarit la munte"))
        check(text(ov, "#dlg-link") == "Adaugă detalii" and ov.locator("#dlg-p").is_hidden(), "dialogul ofera doar detalii")
        ov.click("#dlg-link")
        check(text(ov, "h1") == "Detalii" and ov.locator("#note-pic").count() == 0, "ecranul de detalii nu ofera poza")
        ov.fill("#note-input", "Scris pe un server vechi.")
        ov.click("#note-btn")
        soft(lambda: saved(ov), "detaliile se salveaza")
        ov.wait_for_timeout(1200)
        check(not sent_photos, "aplicatia nu trimite schimbari de poze unui server care nu le cunoaste")
        check(files_of("Oana") == "1" and photo_of("Rasarit la munte").endswith(".jpg"), "si nu sterge din cont pozele despre care un asemenea server nu spune nimic")
        ctx_ov.close()

        # ------------------------------------------------------------ raspunsul contului soseste cand omul scrie deja
        # Pe un dispozitiv nou, ce stie baza de date sa pastreze se afla abia la primul drum pana la cont.
        ctx_n, nw = new_page()
        first = []
        nw.route("**/rest/v1/rpc/sync", lambda r: first.append(r) if not first else r.continue_())
        sign_in(nw, "oana@example.test", "parola-oana-9")
        nw.click("a.btn-plus")
        nw.fill("#act-name", "Scrisa repede")
        soft(lambda: until(nw, lambda: len(first) == 1, "primul drum"), "pe un dispozitiv nou, primul drum pana la cont intarzie")
        check(nw.locator("#note-row").count() == 0 and nw.locator("#act-pic").count() == 0, "pana cand contul raspunde, formularul nu ofera nici detalii, nici poza")
        nw.type("#act-name", " de tot")
        first[0].continue_()
        soft(lambda: nw.wait_for_selector("#act-pic", timeout=8000), "cand raspunsul soseste, randul de poza apare pe loc")
        tops = nw.evaluate("() => ['note-row', 'act-pic', 'save-btn'].map((id) => { const e = document.getElementById(id); return e ? Math.round(e.getBoundingClientRect().top) : -1; })")
        check(tops[0] > 0 and tops[0] < tops[1] < tops[2], "impreuna cu cel de detalii, in ordinea obisnuita, deasupra butonului de salvare %s" % tops)
        check(nw.input_value("#act-name") == "Scrisa repede de tot" and nw.evaluate("() => document.activeElement && document.activeElement.id") == "act-name",
              "fara ca omul sa piarda ce scria sau locul in care scria")
        pick(nw, "act", small)
        soft(lambda: nw.wait_for_selector("#act-pic .shot img", timeout=10000), "si poza se poate alege imediat")
        nw.click("#save-btn")
        soft(lambda: saved(nw), "activitatea scrisa repede ajunge in cont cu poza ei")
        check(photo_of("Scrisa repede de tot").endswith("-320x200.jpg"), "in baza: poza este la activitate")
        nw.click('#nav a[data-route="azi"]')
        nw.click(row("Scrisa repede de tot"))
        nw.click("#dlg-ok")
        soft(lambda: saved(nw), "stergerea ei ajunge in cont")
        soft(lambda: until(nw, lambda: files_of("Oana") == "1", "curatenia"), "iar poza ei este stearsa din cont")
        ctx_n.close()

        # ------------------------------------------------------------ pe telefon: poza facuta pe loc
        # Pe un ecran tactil, randul de poza ofera si fotografierea pe loc. Butonul deschide direct camera telefonului, prin
        # atributul capture al campului de fisiere; celalalt buton il scoate, ca sa se deschida galeria.
        ctx_t, tp = new_page({"has_touch": True})
        sign_in(tp, "oana@example.test", "parola-oana-9")
        tp.click("a.btn-plus")
        soft(lambda: tp.wait_for_selector("#act-pic " + CAMERA, timeout=8000), "pe un telefon, formularul ofera si fotografierea pe loc")
        check(text(tp, "#act-pic " + CAMERA) == "Fă o poză" and text(tp, "#act-pic " + GALLERY) == "Alege o poză", "cu doua butoane: Fa o poza si Alege o poza")
        tp.fill("#act-name", "Poza pe loc")
        pick(tp, "act", small, camera=True)
        check(tp.get_attribute("#pic-file", "capture") == "environment", "butonul de fotografiere cere telefonului sa deschida direct camera")
        soft(lambda: tp.wait_for_selector("#act-pic .shot img", timeout=10000), "poza facuta apare in formular")
        check(tp.locator("#act-pic " + CAMERA).count() == 1 and tp.locator("#act-pic " + GALLERY).count() == 1 and tp.locator('[data-act="pic-drop"]').count() == 1,
              "langa ea raman amandoua butoanele si Scoate poza")
        check(tp.evaluate("() => document.activeElement && document.activeElement.getAttribute('data-focus')") == "act-cam", "iar tastatura ramane pe butonul folosit")
        tp.evaluate("() => window.scrollTo(0, document.documentElement.scrollHeight)")
        drop = tp.locator('#act-pic [data-act="pic-drop"]').bounding_box()
        save = tp.locator("#save-btn").bounding_box()
        check(drop["y"] + drop["height"] <= save["y"], "la capatul formularului, cele trei butoane ale pozei se vad intregi deasupra butonului de salvare")
        shot(tp, "p11-telefon-camera.png")
        no_overflow(tp, "notare cu camera 390")
        pick(tp, "act", big)
        check(tp.get_attribute("#pic-file", "capture") is None, "butonul Alege o poza nu mai cere camera: se deschide galeria")
        soft(lambda: until(tp, lambda: nat(tp, "#act-pic .shot img") == [1280, 853], "poza din galerie"), "poza din galerie ii ia locul celei facute")
        tp.click("#save-btn")
        soft(lambda: saved(tp), "activitatea ajunge in cont cu poza ei")
        check(photo_of("Poza pe loc").endswith("-1280x853.jpg"), "in baza: poza din galerie")
        today(tp)
        tp.click(row("Poza pe loc"))
        tp.click("#dlg-ok")
        soft(lambda: saved(tp), "activitatea de proba este stearsa")
        ctx_t.close()

        # ------------------------------------------------------------ ecran ingust
        ctx_s, sm = new_page({"viewport": {"width": 320, "height": 568}, "has_touch": True})
        sign_in(sm, "oana@example.test", "parola-oana-9")
        soft(lambda: wait_count(sm, row("Rasarit la munte"), 1), "pe un ecran de 320 apare activitatea")
        no_overflow(sm, "azi cu semne de poza 320")
        sm.click(row("Rasarit la munte"))
        soft(lambda: sm.wait_for_selector("#dlg-p .shot img", timeout=8000), "dialogul arata poza si pe ecranul ingust")
        fits = sm.evaluate("() => { const b = document.getElementById('dlg-ok').getBoundingClientRect(); return b.bottom <= window.innerHeight && b.top >= 0; }")
        check(fits, "cu butoanele dialogului pe ecran")
        shot(sm, "p06-dialog-320.png")
        sm.click("#dlg-link")
        sm.wait_for_selector("#note-pic .shot img", timeout=8000)
        no_overflow(sm, "detalii si poza 320")
        shot(sm, "p07-detalii-320.png")
        sm.click("a.icon-btn")
        sm.click("a.btn-plus")
        sm.wait_for_selector("#act-pic")
        no_overflow(sm, "notare fara poza 320")
        pick(sm, "act", tall)
        sm.wait_for_selector("#act-pic .shot img", timeout=10000)
        no_overflow(sm, "notare cu poza 320")
        sm.evaluate("() => window.scrollTo(0, document.documentElement.scrollHeight)")
        drop = sm.locator('#act-pic [data-act="pic-drop"]').bounding_box()
        save = sm.locator("#save-btn").bounding_box()
        check(drop["y"] + drop["height"] <= save["y"], "la capatul formularului, randul pozei se vede intreg deasupra butonului de salvare")
        shot(sm, "p08-notare-320.png")
        sm.click("a.icon-btn")
        sm.click('#nav a[data-route="flux"]')
        mine = '#feed-list .post:has-text("Rasarit la munte")'
        soft(lambda: wait_count(sm, mine, 1), "fluxul arata activitatea")
        sm.click(mine + " .post-more")
        soft(lambda: sm.wait_for_selector(mine + " .shot img", timeout=8000), "cu poza la apasare")
        no_overflow(sm, "flux cu poza 320")
        shot(sm, "p09-flux-320.png")
        ctx_s.close()

        # ------------------------------------------------------------ o poza noua refuzata, pusa in locul uneia vechi
        # Cea veche se sterge oricum din cont, deci si contul trebuie sa afle ca activitatea a ramas fara poza.
        db("update storage.buckets set file_size_limit = 2000 where id = 'photos'")
        today(oa)
        oa.click(row("Rasarit la munte"))
        oa.click("#dlg-link")
        oa.wait_for_selector("#note-pic .shot")
        pick(oa, "note", small)
        soft(lambda: until(oa, lambda: nat(oa, "#note-pic .shot img") == [320, 200], "poza noua in formular"), "Oana alege o poza noua in locul celei vechi")
        oa.click("#note-btn")
        soft(lambda: wait_text(oa, "#toast", "Poza nu a fost primită de server", 10000), "serverul nu o primeste, iar Oana afla")
        soft(lambda: saved(oa), "nimic nu ramane in asteptare")
        soft(lambda: until(oa, lambda: files_of("Oana") == "0", "curatenia"), "poza veche a fost stearsa din cont, cum ceruse schimbarea")
        check(photo_of("Rasarit la munte") == "-", "iar contul stie ca activitatea a ramas fara poza, nu trimite la un fisier care nu mai exista")
        today(oa)
        check(oa.locator(row("Rasarit la munte") + " .note-ic").count() == 1 and "are detalii" in oa.locator(row("Rasarit la munte") + " .note-ic .sr").inner_text(),
              "pe dispozitiv activitatea si-a pastrat detaliile si nu mai arata semnul de poza")
        db("update storage.buckets set file_size_limit = 1048576 where id = 'photos'")

        # ------------------------------------------------------------ o cerere care nu primeste niciun raspuns
        setting(patience=2000)
        ctx_pw, pw = new_page()
        sign_in(pw, "petru@example.test", "parola-petru-1")
        setting(patience=0)
        stuck = []

        def swallow(route):
            if route.request.method == "POST" and not stuck:
                stuck.append(route)
            else:
                route.continue_()

        pw.route(STORE, swallow)
        pw.click("a.btn-plus")
        pw.fill("#act-name", "Poza fara raspuns")
        pick(pw, "act", small)
        pw.wait_for_selector("#act-pic .shot img", timeout=10000)
        pw.click("#save-btn")
        soft(lambda: until(pw, lambda: len(stuck) == 1, "incarcarea pornita"), "incarcarea pozei porneste, dar serverul nu mai raspunde")
        soft(lambda: wait_text(pw, "#pending", "În așteptare: 1 modificare.", 8000), "dupa un timp cererea este data pierduta, iar omul vede ca poza asteapta")
        check(files_of("Petru") == "0", "in cont inca nu a ajuns nimic")
        pw.click('#nav a[data-route="profil"]')
        pw.click('[data-act="sync-now"]')
        soft(lambda: wait_text(pw, "#sync-status", "Totul e salvat în cont", 10000), "la urmatoarea incercare poza pleaca")
        check(photo_of("Poza fara raspuns").endswith("-320x200.jpg") and files_of("Petru") == "1", "in baza: activitatea are poza, iar fisierul este in cont")
        stuck[0].abort()
        pw.wait_for_timeout(400)
        ctx_pw.close()

        # ------------------------------------------------------------ iesirea din cont cu o poza pe drum
        held = []

        def hold(route):
            if route.request.method == "POST":
                held.append(route)
            else:
                route.continue_()

        pe.route(STORE, hold)
        today(pe)
        pe.click("a.btn-plus")
        pe.fill("#act-name", "Poza pe drum")
        pick(pe, "act", small)
        pe.wait_for_selector("#act-pic .shot img", timeout=10000)
        pe.click("#save-btn")
        soft(lambda: until(pe, lambda: len(held) == 1, "incarcarea pornita"), "incarcarea pozei lui Petru a pornit si este tinuta pe loc")
        pe.click('#nav a[data-route="profil"]')
        soft(lambda: until(pe, lambda: all(e["sync"] == 0 for e in local(pe)["entries"]), "activitatea in cont"), "activitatea insasi a ajuns in cont")
        # Si un drum pana la cont este tinut pe loc: raspunsul lui va sosi abia dupa iesire.
        late_syncs = []
        pe.route("**/rest/v1/rpc/sync", lambda r: late_syncs.append(r))
        pe.click('[data-act="sync-now"]')
        soft(lambda: until(pe, lambda: len(late_syncs) == 1, "drumul pornit"), "un drum pana la cont este si el pe drum")
        pe.click('[data-act="signout"]')
        soft(lambda: wait_text(pe, "#dlg-b", "Ai modificări care nu au ajuns încă în cont"), "la iesire Petru este avertizat ca poza nu a ajuns inca in cont")
        pe.click("#dlg-ok")
        pe.wait_for_selector("#auth-btn")
        held[0].continue_()
        late_syncs[0].continue_()
        pe.wait_for_timeout(1500)
        kept = local(pe)
        check(kept["uid"] is None and kept["entries"] == [] and kept["uploads"] == [] and kept["outbox"]["gone"] == [], "raspunsurile sosite dupa iesirea din cont nu mai schimba nimic pe dispozitiv")
        check(pe.locator("#auth-btn").count() == 1, "si ecranul ramane cel de intrare")
        check(pe.evaluate(KEPT)[0] == 0, "nicio poza nu ramane pe dispozitiv")
        pe.unroute(STORE)
        pe.unroute("**/rest/v1/rpc/sync")

        # ------------------------------------------------------------ stergerea contului, intrerupta de iesirea din cont
        # Oana cere stergerea, prima intrebare catre cont intarzie, ea iese din cont si intra Petru pe acelasi telefon:
        # raspunsul sosit apoi nu are voie sa duca mai departe stergerea, nici a contului ei, nici a lui.
        held_syncs = []
        oa.route("**/rest/v1/rpc/sync", lambda r: held_syncs.append(r))
        oa.click('#nav a[data-route="profil"]')
        oa.click('[data-act="delete-account"]')
        oa.click("#dlg-ok")
        soft(lambda: until(oa, lambda: len(held_syncs) == 1, "intrebarea catre cont"), "stergerea porneste cu o intrebare catre cont, tinuta pe loc")
        oa.click('[data-act="signout"]')
        sign_in_here(oa, "petru@example.test", "parola-petru-1")
        for r in held_syncs:
            r.continue_()
        oa.wait_for_timeout(1500)
        check(db("select count(*) from auth.users where email in ('oana@example.test', 'petru@example.test')") == "2", "raspunsul sosit dupa iesire nu sterge niciun cont")
        check(oa.locator("#auth-btn").count() == 0 and oa.locator("#score").count() == 1, "iar Petru ramane in cont pe telefon")
        oa.unroute("**/rest/v1/rpc/sync")
        oa.click('#nav a[data-route="profil"]')
        oa.click('[data-act="signout"]')
        oa.wait_for_selector("#auth-btn")
        sign_in(oa, "oana@example.test", "parola-oana-9")
        soft(lambda: wait_count(oa, row("Rasarit la munte"), 1), "Oana intra din nou si isi gaseste activitatile")

        # ------------------------------------------------------------ la stergerea contului dispar si pozele
        was = int(files_of("Oana"))
        db("insert into storage.objects (bucket_id, name, owner_id) select 'photos', '%s/' || lpad(to_hex(g), 16, '0') || '-10x10.jpg', '%s' from generate_series(1, 230) g" % (oana, oana))
        check(files_of("Oana") == str(was + 230), "inainte: Oana are %d fisiere in cont, mai multe decat vin intr-un singur raspuns" % (was + 230))
        held = []
        oa.route(STORE, hold)
        # Prima cerere de stergere a contului cade; aplicatia insista, ca sa nu ramana un cont ale carui activitati trimit la poze disparute.
        failed_deletes = []
        oa.route("**/rest/v1/rpc/delete_my_account", lambda r: (failed_deletes.append(1), r.abort()) if not failed_deletes else r.continue_())
        today(oa)
        oa.click("a.btn-plus")
        oa.fill("#act-name", "Ultima poza")
        pick(oa, "act", small)
        oa.wait_for_selector("#act-pic .shot img", timeout=10000)
        oa.click("#save-btn")
        soft(lambda: until(oa, lambda: len(held) == 1, "incarcarea pornita"), "o ultima poza este pe drum spre cont")
        oa.click('#nav a[data-route="profil"]')
        oa.click('[data-act="delete-account"]')
        check("pozele lor" in text(oa, "#dlg-b"), "intrebarea de stergere spune ca dispar si pozele")
        oa.click("#dlg-ok")
        oa.wait_for_timeout(700)
        check(db("select count(*) from auth.users where email = 'oana@example.test'") == "1", "cat timp o poza este pe drum, stergerea asteapta")
        held[0].continue_()
        soft(lambda: oa.wait_for_selector("#auth-btn", timeout=20000), "dupa stergerea contului apare ecranul de intrare")
        check(len(failed_deletes) == 1, "desi prima cerere de stergere a contului cazuse")
        check(db("select count(*) from auth.users where email = 'oana@example.test'") == "0", "in baza: contul Oanei nu mai exista")
        oa.wait_for_timeout(800)
        check(db("select count(*) from storage.objects where name like '%s/%%'" % oana) == "0", "in locul de poze nu a ramas niciun fisier al ei, nici cel sosit in ultima clipa")
        check(oa.evaluate(KEPT)[0] == 0, "nici pe dispozitiv nu a ramas nicio poza")
        oa.unroute(STORE)
        oa.unroute("**/rest/v1/rpc/delete_my_account")

        check(not errs, "fara erori in consola: " + "; ".join(errs[:3]))
        browser.close()
except Exception as e:  # noqa: BLE001
    check(False, "parcursul s-a oprit inainte de capat: " + str(e).splitlines()[0][:200])
finally:
    stop(server)

finish()
