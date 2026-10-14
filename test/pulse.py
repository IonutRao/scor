"""Telul comun "Azi pe plus" si randul saptamanii din Jurnal, cu doi utilizatori, pe baza locala construita la fel ca cea din Supabase.

   Porneste singur baza (test/db/start.sh) si serverul de test (test/server.py). Rulare: python3 test/pulse.py
"""
import datetime

from playwright.sync_api import sync_playwright

from kit import BASE, check, db, finish, no_overflow, saved, setting, shot, sign_up, soft, start, stop, text, until, wait_text

RO_DAYS = ["duminică", "luni", "marți", "miercuri", "joi", "vineri", "sâmbătă"]


def add(page, kind, name, pts_steps=0, public=None):
    """Noteaza o activitate: fel, titlu, cateva apasari pe + sau - la puncte (pornind de la 10), vizibilitate."""
    page.click('#nav a[data-route="azi"]')
    page.click("a.btn-plus" if kind == "plus" else "a.btn-minus")
    page.wait_for_selector("#save-btn")
    page.fill("#act-name", name)
    for _ in range(abs(pts_steps)):
        page.click('[data-act="step"][data-d="%d"]' % (1 if pts_steps > 0 else -1))
    if public is not None:
        page.click('[data-act="pub"][data-v="%d"]' % (1 if public else 0))
    page.click("#save-btn")
    page.wait_for_selector("#score")


def flux(page):
    page.click('#nav a[data-route="flux"]')
    page.wait_for_selector("#feed-list, #feed-empty, #feed-loading")


def card(page):
    """Ce arata cardul: numarul si randul cu numele, fara spatii de prisos."""
    return text(page, "#pulse-n"), " ".join(text(page, "#pulse-s").split())


server = start()
setting(feed=1000)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--no-sandbox"])
        opts = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="ro-RO", timezone_id="Europe/Bucharest")
        errs, calls = [], []

        def new_page():
            ctx = browser.new_context(**opts)
            pg = ctx.new_page()
            pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
            pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
            pg.on("request", lambda r: calls.append(r.post_data or "") if r.url.endswith("/rest/v1/rpc/pulse") else None)
            return ctx, pg

        # ------------------------------------------------------------ cardul, inainte sa participe cineva
        ctx_a, a = new_page()
        sign_up(a, "ana@example.test", "parola-ana-1", "Ana")
        flux(a)
        soft(lambda: a.wait_for_selector("#pulse", timeout=8000), "in Flux apare cardul Azi pe plus")
        check(text(a, ".pulse-t") == "Azi pe plus" and card(a) == ("0", "Nimeni nu participă încă. Fii primul."), "nimeni nu participa inca, iar cardul invita")
        check("un singur lucru" in text(a, "#pulse") and text(a, '[data-act="pulse-join"]') == "Particip", "spune ce se vede despre tine si ofera Particip")
        check(a.locator("#pulse").bounding_box()["y"] > a.locator(".gold").bounding_box()["y"] and a.locator("#pulse").bounding_box()["y"] < a.locator(".feed-bar").bounding_box()["y"],
              "cardul sta intre incurajari si flux")
        shot(a, "g01-card-gol.png")
        no_overflow(a, "flux cu card 390")

        # ------------------------------------------------------------ Ana intra
        a.click('[data-act="pulse-join"]')
        soft(lambda: wait_text(a, "#toast", "Participi"), "la Particip, aplicatia confirma")
        soft(lambda: until(a, lambda: card(a) == ("0 din 1", "Încă nimeni."), "cardul dupa intrare"), "un participant, nimeni pe plus inca")
        check(a.locator('[data-act="pulse-leave"]').count() == 1 and a.locator('[data-act="pulse-join"]').count() == 0 and "un singur lucru" not in text(a, "#pulse"),
              "pentru participant ramane doar Ma retrag, fara explicatie")
        check(db("select count(*) from public.pulse") == "1", "in baza: un participant")
        add(a, "plus", "Alergare", public=True)
        flux(a)
        soft(lambda: until(a, lambda: card(a) == ("1 din 1", "tu"), "cardul dupa o fapta buna"), "dupa o fapta buna, Ana este pe plus: 1 din 1, tu")
        shot(a, "g02-card-eu.png")

        # ------------------------------------------------------------ Bogdan vede, intra, urca si coboara
        ctx_b, b = new_page()
        sign_up(b, "bogdan@example.test", "parola-bogdan-1", "Bogdan")
        flux(b)
        soft(lambda: until(b, lambda: card(b) == ("1 din 1", "Ana"), "cardul lui Bogdan"), "Bogdan, fara sa participe, vede ca Ana e pe plus")
        check(b.locator('[data-act="pulse-join"]').count() == 1, "si poate intra")
        b.click('[data-act="pulse-join"]')
        soft(lambda: until(b, lambda: card(b) == ("1 din 2", "Ana"), "cardul dupa intrare"), "Bogdan intra: 1 din 2, doar Ana pe plus")
        soft(lambda: until(a, lambda: card(a) == ("1 din 2", "tu"), "cardul Anei se improspateaza"), "la Ana cardul se improspateaza singur: 1 din 2")
        add(b, "plus", "Citit", pts_steps=-5, public=False)
        flux(b)
        soft(lambda: until(b, lambda: card(b) == ("2 din 2", "Ana și tu"), "cardul dupa plus"), "cu o fapta buna privata de +5, Bogdan e pe plus: 2 din 2, Ana si tu")
        soft(lambda: until(a, lambda: card(a) == ("2 din 2", "Bogdan și tu"), "cardul Anei"), "Ana vede: 2 din 2, Bogdan si tu")
        shot(a, "g03-card-doi.png")
        check("Citit" not in a.inner_text("#view"), "dar nimic despre activitatea privata a lui Bogdan nu ajunge la Ana")
        add(b, "minus", "Prea mult pe telefon", public=False)
        flux(b)
        soft(lambda: until(b, lambda: card(b) == ("1 din 2", "Ana"), "cardul dupa minus"), "cu un minus de 10, ziua lui Bogdan e pe minus: 1 din 2, Ana")
        soft(lambda: until(a, lambda: card(a) == ("1 din 2", "tu"), "cardul Anei"), "Ana vede 1 din 2 si doar pe ea; nu afla de ce a coborat Bogdan")
        check("telefon" not in a.inner_text("#view"), "nici activitatea pe minus nu ajunge la ea")

        # ------------------------------------------------------------ Bogdan se retrage
        b.click('[data-act="pulse-leave"]')
        soft(lambda: wait_text(b, "#toast", "Nu mai participi"), "la Ma retrag, aplicatia confirma")
        soft(lambda: until(b, lambda: card(b) == ("1 din 1", "Ana") and b.locator('[data-act="pulse-join"]').count() == 1, "cardul dupa retragere"), "Bogdan nu mai e numarat si poate intra din nou")
        soft(lambda: until(a, lambda: card(a) == ("1 din 1", "tu"), "cardul Anei"), "Ana vede din nou 1 din 1")
        check(db("select count(*) from public.pulse") == "1", "in baza: un singur participant")

        # ------------------------------------------------------------ "tu" nu depinde de numele de pe dispozitiv
        # Ana isi schimba numele de pe alt dispozitiv. Pe primul, cardul o arata in continuare drept "tu", iar numele nou
        # ajunge si acolo odata cu starea contului.
        ctx_a2, a2 = new_page()
        a2.goto(BASE)
        a2.wait_for_selector("#auth-btn")
        a2.fill("#auth-email", "ana@example.test")
        a2.fill("#auth-pass", "parola-ana-1")
        a2.click("#auth-btn")
        a2.wait_for_selector("#score")
        a2.click('#nav a[data-route="profil"]')
        a2.click('a[data-route="nume"]')
        a2.fill("#name-input", "Anda")
        a2.click("#name-btn")
        soft(lambda: wait_text(a2, "#my-name", "Anda"), "pe al doilea dispozitiv Ana devine Anda")
        ctx_a2.close()
        check(a.evaluate("() => JSON.parse(localStorage.getItem('scor.v1')).name") == "Ana", "primul dispozitiv inca o stie drept Ana")
        a.click('[data-act="feed-refresh"]')
        soft(lambda: until(a, lambda: card(a) == ("1 din 1", "tu"), "cardul dupa redenumire"), "cardul o arata tot drept tu, nu dupa numele vechi")
        a.click('#nav a[data-route="profil"]')
        a.click('[data-act="sync-now"]')
        soft(lambda: wait_text(a, "#my-name", "Anda"), "iar numele nou ajunge si pe primul dispozitiv, odata cu starea contului")
        flux(b)
        soft(lambda: until(b, lambda: card(b) == ("1 din 1", "Anda"), "cardul lui Bogdan"), "Bogdan vede numele nou")
        flux(a)

        # ------------------------------------------------------------ cardul cunoaste ziua
        a.evaluate("() => { const d = JSON.parse(localStorage.getItem('scor.v1')); d.pulse.day = '2000-01-01'; d.pulse.up = ['Fantoma']; localStorage.setItem('scor.v1', JSON.stringify(d)); }")
        a.reload()
        a.wait_for_selector("#feed-list, #feed-empty")
        check("Fantoma" not in a.inner_text("#view"), "un raspuns pastrat pentru alta zi nu se arata")
        soft(lambda: until(a, lambda: card(a) == ("1 din 1", "tu"), "cardul proaspat"), "cardul se umple din nou din cont")
        check(all('"p_day"' in c for c in calls), "fiecare cerere spune ziua de pe dispozitiv")
        joins = [c for c in calls if '"p_join"' in c]
        check(len(joins) == 3, "doar intrarile si iesirile trimit p_join (%d)" % len(joins))

        # ------------------------------------------------------------ randul saptamanii din Jurnal
        b.click('#nav a[data-route="jurnal"]')
        soft(lambda: b.wait_for_selector("#week-line", timeout=8000), "Jurnalul are randul saptamanii")
        check(text(b, "#week-line") == "prima zi, încă nu e pe plus", "in prima zi, pe minus, randul spune asta (%s)" % text(b, "#week-line"))
        a.click('#nav a[data-route="jurnal"]')
        check(text(a, "#week-line") == "prima zi, și e pe plus", "pentru Ana, prima zi este pe plus (%s)" % text(a, "#week-line"))
        shot(a, "g04-jurnal-prima-zi.png")
        # Un jurnal mai lung, scris direct in cont: patru zile notate, trei pe plus, cea mai buna alaltaieri.
        today = datetime.date.today()
        ana = db("select p.id from public.profiles p join auth.users u on u.id = p.id where u.email = 'ana@example.test'")
        rows = []
        for back, pts, kind in ((3, 10, "plus"), (2, 30, "plus"), (1, 5, "minus")):
            day = today - datetime.timedelta(days=back)
            rows.append("(gen_random_uuid(), '%s', '%s', '%s 12:00:00+03', '%s', %d, 'Din trecut', false, 'ro')" % (ana, day, day, kind, min(pts, 20)))
            if pts > 20:
                rows.append("(gen_random_uuid(), '%s', '%s', '%s 13:00:00+03', '%s', %d, 'Din trecut', false, 'ro')" % (ana, day, day, kind, pts - 20))
        db("insert into public.entries (id, user_id, day, ts, type, pts, name, is_public, lang) values " + ", ".join(rows))
        a.click('#nav a[data-route="profil"]')
        a.click('[data-act="sync-now"]')
        soft(lambda: until(a, lambda: len(a.evaluate("() => JSON.parse(localStorage.getItem('scor.v1')).entries")) == 5, "jurnalul adus din cont"), "Ana primeste din cont zilele mai vechi")
        a.click('#nav a[data-route="jurnal"]')
        best_day = RO_DAYS[(today - datetime.timedelta(days=2)).isoweekday() % 7]
        check(text(a, "#week-line") == "3 din 4 zile pe plus · cea mai bună zi: %s, +30" % best_day, "patru zile notate, trei pe plus, cea mai buna alaltaieri (%s)" % text(a, "#week-line"))
        shot(a, "g05-jurnal-saptamana.png")
        no_overflow(a, "jurnal cu rand 390")

        check(not errs, "fara erori in consola: " + "; ".join(errs[:3]))
        browser.close()
except Exception as e:  # noqa: BLE001
    check(False, "parcursul s-a oprit inainte de capat: " + str(e).splitlines()[0][:200])
finally:
    stop(server)

finish()
