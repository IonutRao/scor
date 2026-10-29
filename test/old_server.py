"""Aplicatia de acum pe o baza de date ramasa la scriptul versiunii dinainte (0.6, test/db/schema-0.6.sql).

   Este starea reala dintre publicarea unei versiuni noi si momentul in care scriptul actualizat este rulat in Supabase:
   totul trebuie sa mearga ca inainte (detalii, poze, telul comun "Azi pe plus", modul educator), iar ce depinde de
   scriptul nou (scorul zilei la vedere) sa stea ascuns, fara erori si fara sa trimita bazei ceva ce ea nu cunoaste.

   Porneste singur baza (test/db/start.sh, cu scriptul vechi) si serverul de test. Rulare: python3 test/old_server.py
"""
from playwright.sync_api import sync_playwright

from kit import ROOT, check, db, finish, saved, setting, sign_up, soft, start, stop, text, wait_text

server = start(ROOT / "test" / "db" / "schema-0.6.sql")
setting(feed=1000)
try:
    check(db("select count(*) from information_schema.columns where table_name = 'entries' and column_name = 'kid'") == "1"
          and db("select count(*) from information_schema.columns where table_name = 'settings' and column_name = 'show_score'") == "0",
          "baza de test este cea veche: stie de copii, dar nu de scorul la vedere")
    check(db("select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'day_score'") == "0",
          "si nu are functia day_score")
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--no-sandbox"])
        opts = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="ro-RO", timezone_id="Europe/Bucharest")
        errs, bad, syncs, feeds = [], [], [], []

        def watch(r):
            if r.url.endswith("/rest/v1/rpc/sync"):
                syncs.append(r.post_data or "")
            if r.url.endswith("/rest/v1/rpc/feed"):
                feeds.append(r.post_data or "")

        def new_page():
            ctx = browser.new_context(**opts)
            pg = ctx.new_page()
            # Fonturile Google nu se pot incarca din mediul de test; raspunsurile de eroare ale serverului sunt prinse separat.
            pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
            pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
            pg.on("response", lambda r: bad.append("%d %s" % (r.status, r.url.rsplit("/", 1)[-1])) if r.status >= 400 else None)
            pg.on("request", watch)
            return ctx, pg

        ctx_a, a = new_page()
        sign_up(a, "ana@example.test", "parola-ana-1", "Ana")
        check(text(a, "h1") == "Azi", "contul nou intra in aplicatie")

        # Notarea: detaliile si pozele se ofera, ca pana acum.
        a.click("a.btn-plus")
        soft(lambda: a.wait_for_selector("#act-pic", timeout=8000), "formularul ofera detalii si poza, pe care baza aceasta le pastreaza")
        a.click('.chip:has-text("Sală")')
        a.click('[data-act="pub"][data-v="1"]')
        a.click('[data-act="note-open"]')
        a.fill("#act-note", "Picioare, 45 de minute.")
        a.click("#save-btn")
        a.wait_for_selector("#score")
        a.click("a.btn-minus")
        a.fill("#act-name", "Prea mult pe telefon")
        a.click("#save-btn")
        a.wait_for_selector("#score")
        soft(lambda: saved(a), "activitatile se salveaza in cont ca inainte")
        check(db("select string_agg(coalesce(key, name) || ':' || coalesce(note, '-'), ',' order by ts) from public.entries") == "gym:Picioare, 45 de minute.,Prea mult pe telefon:-",
              "in baza: cele doua activitati, una cu detalii")
        check(a.evaluate("() => JSON.parse(localStorage.getItem('scor.v1')).sv") == 6, "aplicatia a retinut ca serverul este la versiunea dinaintea scorului la vedere")
        check(all("p_show" not in x for x in syncs), "si nu i-a trimis nimic despre scorul la vedere")

        # Scorul la vedere lipseste din Profil; modul educator este acolo, ca inainte.
        a.click('#nav a[data-route="profil"]')
        a.wait_for_selector('[data-act="signout"]')
        check(a.locator("#show").count() == 0 and a.locator("#edu").count() == 1, "Profilul nu ofera scorul la vedere pe baza veche, dar ofera modul educator")

        # Dialogul si ecranul de detalii arata ca in versiunea dinainte.
        a.click('#nav a[data-route="azi"]')
        a.click('#today-list .row:has-text("Sală")')
        check(text(a, "#dlg-n") == "Picioare, 45 de minute." and text(a, "#dlg-link") == "Schimbă detaliile sau poza", "dialogul arata detaliile si ofera schimbarea lor sau a pozei")
        a.click("#dlg-link")
        check(text(a, "h1") == "Detalii și poză" and a.locator("#note-pic").count() == 1, "ecranul de detalii ofera si poza")
        a.fill("#note-input", "Picioare si spate.")
        a.click("#note-btn")
        soft(lambda: wait_text(a, "#toast", "Detalii salvate"), "schimbarea detaliilor este confirmata")
        soft(lambda: saved(a), "si ajunge in cont")
        check(db("select note from public.entries where key = 'gym'") == "Picioare si spate.", "in baza: detaliile cele noi")
        a.click('#nav a[data-route="azi"]')
        a.click('#today-list .row:has-text("Prea mult pe telefon")')
        check(text(a, "#dlg-link") == "Adaugă detalii sau poză", "o activitate fara detalii primeste oferta de a le adauga, impreuna cu o poza")
        check(text(a, "#dlg-extra") == "Arată în flux", "si schimbarea vizibilitatii")
        a.click("#dlg-ok")
        soft(lambda: saved(a), "stergerea se salveaza")
        check(db("select count(*) || '/' || count(*) filter (where is_public) from public.entries") == "1/1", "in baza: a ramas o activitate, publica")

        # Fluxul, incurajarile si cardul "Azi pe plus" merg ca inainte.
        ctx_b, b = new_page()
        sign_up(b, "bogdan@example.test", "alta-parola-9", "Bogdan")
        b.click('#nav a[data-route="flux"]')
        post = '#feed-list .post:has-text("Sală")'
        soft(lambda: wait_text(b, post, "Ana"), "fluxul arata activitatea Anei")
        check(b.locator("#feed-list .post-score").count() == 0, "niciun scor langa nume: baza veche nu il poate da")
        soft(lambda: b.wait_for_selector("#pulse", timeout=8000), "cardul Azi pe plus apare")
        b.click('#pulse [data-act="pulse-join"]')
        soft(lambda: wait_text(b, "#pulse", "0 din 1"), "Bogdan participa si cardul il numara")
        b.click(post + " .post-more")
        soft(lambda: wait_text(b, post + " .post-note", "Picioare si spate."), "cu detaliile la apasare")
        b.click(post + " .cheer")
        soft(lambda: wait_text(b, post + " .cheer", "Încurajat"), "incurajarea merge")
        a.click('#nav a[data-route="flux"]')
        soft(lambda: wait_text(a, "#cheers-got", "1"), "iar Ana o primeste singura, prin improspatarea fluxului")
        a.wait_for_timeout(2500)
        a.reload()
        a.wait_for_selector("#feed-list, #feed-empty")
        check(a.locator("#auth-btn").count() == 0, "dupa reincarcare Ana ramane in cont")

        # Stergerea contului nu are voie sa se impiedice de locul de fisiere, care aici nu exista.
        b.click('#nav a[data-route="profil"]')
        b.click('[data-act="delete-account"]')
        b.click("#dlg-ok")
        soft(lambda: b.wait_for_selector("#auth-btn", timeout=10000), "Bogdan isi poate sterge contul si pe baza veche")
        check(db("select count(*) from auth.users where email = 'bogdan@example.test'") == "0", "in baza: contul lui nu mai exista")

        check(all("p_show" not in x for x in syncs), "nimic despre scorul la vedere nu a plecat spre baza, pe toata durata")
        check(feeds and all("p_day" not in x for x in feeds), "nicio cerere de flux nu a purtat ziua, pe care baza veche nu o cunoaste (%d cereri)" % len(feeds))
        check(not bad, "niciun raspuns de eroare de la server: " + "; ".join(bad[:4]))
        check(not errs, "fara erori in consola: " + "; ".join(errs[:3]))
        browser.close()
except Exception as e:  # noqa: BLE001
    check(False, "parcursul s-a oprit inainte de capat: " + str(e).splitlines()[0][:200])
finally:
    stop(server)

finish()
