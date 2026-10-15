"""Modul educator: un adult tine scorul si pentru copii, care nu au conturi. Cu doi utilizatori si doua dispozitive,
   pe baza locala construita la fel ca cea din Supabase.

   Porneste singur baza (test/db/start.sh) si serverul de test (test/server.py). Rulare: python3 test/edu.py
"""
from playwright.sync_api import sync_playwright

from kit import check, db, finish, no_overflow, saved, setting, shot, sign_in, sign_up, soft, start, stop, text, until, wait_count, wait_text


def log(page, kind, name, public=None, pts_steps=0):
    page.click("a.btn-plus" if kind == "plus" else "a.btn-minus")
    page.wait_for_selector("#save-btn")
    page.fill("#act-name", name)
    for _ in range(abs(pts_steps)):
        page.click('[data-act="step"][data-d="%d"]' % (1 if pts_steps > 0 else -1))
    if public is not None:
        page.click('[data-act="pub"][data-v="%d"]' % (1 if public else 0))
    page.click("#save-btn")
    page.wait_for_selector("#score")


def pick_who(page, label):
    page.click('[data-act="who-open"]')
    page.wait_for_selector("#dlg[open]")
    page.click('#dlg-l [data-act="who-pick"]:has-text("%s")' % label)
    page.wait_for_selector("#dlg:not([open])", state="attached")


def go(page, route):
    page.click('#nav a[data-route="%s"]' % route)
    page.wait_for_selector("#title")


server = start()
setting(feed=1000)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--no-sandbox"])
        opts = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="ro-RO", timezone_id="Europe/Bucharest")
        errs, syncs = [], []

        def new_page():
            ctx = browser.new_context(**opts)
            pg = ctx.new_page()
            pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
            pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
            pg.on("request", lambda r: syncs.append(r.post_data or "") if r.url.endswith("/rest/v1/rpc/sync") else None)
            return ctx, pg

        # ------------------------------------------------------------ pornirea modului, din Profil
        ctx_a, a = new_page()
        sign_up(a, "ana@example.test", "parola-ana-1", "Ana")
        check(a.locator('[data-act="who-open"]').count() == 0, "fara modul educator, nu exista butonul cu cel ales")
        go(a, "profil")
        soft(lambda: a.wait_for_selector("#edu", timeout=8000), "Profilul are sectiunea Mod educator")
        check(not a.is_checked("#edu-on") and a.locator("#kid-list, #kid-none").count() == 0, "oprit la inceput, fara lista de copii")
        a.check("#edu-on")
        soft(lambda: a.wait_for_selector("#kid-none", timeout=8000), "pornit: apare lista de copii, goala")
        check(a.locator('[data-act="who-open"]').count() == 1 and text(a, '[data-act="who-open"]') == "Eu", "si butonul cu cel ales, pe Eu, chiar si in Profil")
        shot(a, "e01-profil-educator.png", full=True)
        no_overflow(a, "profil educator 390")

        # ------------------------------------------------------------ copiii
        a.click('[data-focus="kid-add"]')
        soft(lambda: a.wait_for_selector("#kid-input", timeout=8000), "Adauga copil deschide ecranul copilului nou")
        a.fill("#kid-input", "Maria")
        a.click("#kid-btn")
        soft(lambda: wait_text(a, "#toast", "Maria a fost adăugat"), "copilul este adaugat, cu o confirmare")
        check(text(a, "h1") == "Profil" and a.locator('#kid-list .row:has-text("Maria")').count() == 1, "si apare in lista din Profil")
        check(text(a, '[data-act="who-open"]') == "Maria", "copilul nou devine cel ales")
        a.click('[data-focus="kid-add"]')
        a.fill("#kid-input", "maria")
        a.click("#kid-btn")
        check(text(a, "#kid-err") == "Mai ai un copil cu numele acesta." and text(a, "h1") == "Copil nou", "un nume deja folosit, oricum scris, este refuzat")
        a.fill("#kid-input", "Andrei")
        a.click("#kid-btn")
        soft(lambda: wait_count(a, "#kid-list .row", 2), "al doilea copil intra in lista")
        soft(lambda: saved(a), "lista copiilor ajunge in cont")
        check(db("select kids->'on' = 'true'::jsonb and jsonb_array_length(kids->'list') = 2 from public.settings s join public.profiles p on p.id = s.user_id where p.name = 'Ana'") == "t",
              "in baza: modul pornit si doi copii")

        # ------------------------------------------------------------ scoruri separate
        go(a, "azi")
        check(text(a, '[data-act="who-open"]') == "Andrei", "alegerea tine: Andrei")
        log(a, "plus", "Teme făcute", pts_steps=-5)
        check(text(a, "#score") == "+5" and a.locator("#today-list .row").count() == 1, "o fapta buna pentru Andrei: scorul lui, +5")
        check(a.locator("#today-list .row-s").first.inner_text().strip().count("·") == 0, "activitatea copilului nu poarta Privat sau Public: e mereu privata")
        pick_who(a, "Eu")
        check(text(a, '[data-act="who-open"]') == "Eu" and text(a, "#score") == "0" and a.locator("#today-list .row").count() == 0, "inapoi la Eu: scorul adultului este separat, 0")
        log(a, "plus", "Alergare", public=True)
        check(text(a, "#score") == "+10", "o fapta buna a adultului: +10")
        pick_who(a, "Maria")
        check(text(a, "#score") == "0" and a.locator("#today-list .row").count() == 0, "Maria nu are inca nimic")
        a.click("a.btn-plus")
        a.wait_for_selector("#save-btn")
        check(text(a, "#for-kid") == "pentru Maria" and a.locator('[data-act="pub"]').count() == 0 and text(a, "#kid-private") == "Activitățile copiilor rămân private.",
              "formularul spune pentru cine noteaza si nu ofera vizibilitate pentru un copil")
        shot(a, "e02-notare-copil.png", full=True)
        no_overflow(a, "notare copil 390")
        a.fill("#act-name", "Și-a strâns jucăriile")
        a.click("#save-btn")
        a.wait_for_selector("#score")
        log(a, "minus", "Nu a mâncat legumele", pts_steps=-5)
        check(text(a, "#score") == "+5" and a.locator("#today-list .row").count() == 2, "Maria: +10 si -5, scor +5")
        shot(a, "e03-azi-copil.png")
        no_overflow(a, "azi copil 390")
        go(a, "jurnal")
        check(text(a, "#week-total") == "+5" and "2 activități" in text(a, "#day-list"), "Jurnalul urmeaza alegerea: ziua Mariei")
        pick_who(a, "Andrei")
        check(text(a, "#week-total") == "+5" and "1 activitate" in text(a, "#day-list"), "si trece la Andrei odata cu butonul")
        pick_who(a, "Eu")
        check(text(a, "#week-total") == "+10", "iar la Eu arata ziua adultului")
        soft(lambda: saved(a), "totul ajunge in cont")
        check(db("select count(*) filter (where kid is not null) || '/' || count(*) filter (where kid is null) || '/' || count(*) filter (where kid is not null and is_public) from public.entries") == "3/1/0",
              "in baza: trei activitati de copii, una a adultului, niciuna de copil publica")

        # ------------------------------------------------------------ ce vad ceilalti
        ctx_b, b = new_page()
        sign_up(b, "bogdan@example.test", "parola-bogdan-1", "Bogdan")
        go(b, "flux")
        soft(lambda: wait_count(b, "#feed-list .post", 1), "in flux este o singura activitate")
        check("Alergare" in text(b, "#feed-list") and "Teme" not in text(b, "#view") and "jucăriile" not in text(b, "#view"), "a adultului; ale copiilor nu apar")
        go(a, "flux")
        a.click('[data-act="pulse-join"]')
        soft(lambda: until(a, lambda: text(a, "#pulse-n") == "1 din 1", "cardul"), "Ana intra in Azi pe plus si este pe plus prin fapta ei")
        go(a, "azi")
        log(a, "minus", "Prea mult pe telefon", pts_steps=5)
        go(a, "flux")
        soft(lambda: until(a, lambda: text(a, "#pulse-n") == "0 din 1", "cardul"), "cu un minus de 15 ziua adultului e pe minus, desi copiii sunt pe plus: cardul numara doar activitatile adultului")
        check(text(a, '[data-act="who-open"]') == "Eu", "butonul cu cel ales sta si in Flux")

        # ------------------------------------------------------------ al doilea dispozitiv
        ctx_a2, a2 = new_page()
        sign_in(a2, "ana@example.test", "parola-ana-1")
        soft(lambda: a2.wait_for_selector('[data-act="who-open"]', timeout=8000), "pe al doilea dispozitiv modul educator este pornit, din cont")
        check(text(a2, '[data-act="who-open"]') == "Eu" and text(a2, "#score") == "−5", "porneste pe Eu, cu scorul adultului")
        pick_who(a2, "Maria")
        soft(lambda: until(a2, lambda: text(a2, "#score") == "+5" and a2.locator("#today-list .row").count() == 2, "ziua Mariei"), "si arata ziua Mariei, cu activitatile ei")
        a2.click('#today-list .row:has-text("jucăriile")')
        check(a2.locator("#dlg-extra").is_hidden(), "dialogul unei activitati de copil nu ofera Arata in flux")
        a2.click("#dlg-cancel")
        shot(a2, "e04-azi-copil-dispozitiv2.png")
        ctx_a2.close()

        # ------------------------------------------------------------ scoaterea unui copil
        go(a, "profil")
        a.click('[data-focus="kr-%s"]' % db("select k->>'id' from public.settings s, jsonb_array_elements(s.kids->'list') k where k->>'name' = 'Andrei'"))
        check(text(a, "#dlg-t") == "Scoți copilul Andrei?" and "toate activitățile notate pentru Andrei" in text(a, "#dlg-b"), "scoaterea unui copil cere confirmare si spune ce se pierde")
        a.click("#dlg-ok")
        soft(lambda: wait_text(a, "#toast", "Copil scos"), "copilul este scos")
        check(a.locator("#kid-list .row").count() == 1, "ramane un copil in lista")
        soft(lambda: saved(a), "schimbarea ajunge in cont")
        check(db("select count(*) from public.entries where name = 'Teme făcute'") == "0" and db("select jsonb_array_length(kids->'list') from public.settings") == "1",
              "in baza: activitatile lui au disparut, lista are un copil")
        go(a, "azi")
        a.click('[data-act="who-open"]')
        check(a.locator('#dlg-l [data-act="who-pick"]').count() == 2 and a.locator('#dlg-l [data-act="kid-new"]').count() == 1, "lista de ales: Eu, Maria si Adauga copil")
        shot(a, "e05-alegere.png")
        a.click('#dlg-l [data-act="kid-new"]')
        soft(lambda: a.wait_for_selector("#kid-input", timeout=8000), "Adauga copil din lista deschide ecranul copilului nou")
        a.click("a.icon-btn")
        check(text(a, "h1") == "Azi", "inchiderea lui intoarce la ecranul de dinainte")

        # ------------------------------------------------------------ oprirea modului
        pick_who(a, "Maria")
        go(a, "profil")
        a.uncheck("#edu-on")
        soft(lambda: until(a, lambda: a.locator('[data-act="who-open"]').count() == 0, "butonul"), "oprit: butonul cu cel ales dispare")
        go(a, "azi")
        check(text(a, "#score") == "−5" and "jucăriile" not in text(a, "#view"), "se vede din nou doar ziua adultului")
        soft(lambda: saved(a), "oprirea ajunge in cont")
        check(db("select count(*) from public.entries where kid is not null") == "2", "in baza: activitatile Mariei raman, pentru cand modul porneste din nou")
        go(a, "profil")
        a.check("#edu-on")
        soft(lambda: wait_count(a, "#kid-list .row", 1), "repornit: Maria este tot acolo")

        check(not errs, "fara erori in consola: " + "; ".join(errs[:3]))
        browser.close()
except Exception as e:  # noqa: BLE001
    check(False, "parcursul s-a oprit inainte de capat: " + str(e).splitlines()[0][:200])
finally:
    stop(server)

finish()
