"""Aplicatia de acum pe o baza de date ramasa la scriptul versiunii dinainte (0.3, test/db/schema-0.3.sql).

   Este starea reala dintre publicarea unei versiuni noi si momentul in care scriptul actualizat este rulat in Supabase:
   totul trebuie sa mearga ca inainte, iar ce depinde de scriptul nou (pozele) sa stea ascuns, fara erori si fara nicio
   cerere catre locul de fisiere, care pe o asemenea baza nu este pregatit.

   Porneste singur baza (test/db/start.sh, cu scriptul vechi) si serverul de test. Rulare: python3 test/old_server.py
"""
from playwright.sync_api import sync_playwright

from kit import ROOT, check, db, finish, saved, setting, sign_up, soft, start, stop, text, wait_text

server = start(ROOT / "test" / "db" / "schema-0.3.sql")
setting(feed=1000)
try:
    check(db("select count(*) from information_schema.columns where table_name = 'entries' and column_name = 'note'") == "1"
          and db("select count(*) from information_schema.columns where table_name = 'entries' and column_name = 'photo'") == "0",
          "baza de test este cea veche: pastreaza detalii, dar nu stie de poze")
    check(db("select count(*) from storage.buckets") == "0", "si nu are niciun loc pregatit pentru fisiere")
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--no-sandbox"])
        opts = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="ro-RO", timezone_id="Europe/Bucharest")
        errs, bad, files, photo_args = [], [], [], []

        def watch(r):
            if "/storage/v1/" in r.url:
                files.append(r.method + " " + r.url.rsplit("/storage/v1/", 1)[1])
            if r.url.endswith("/rest/v1/rpc/sync") and "p_photo" in (r.post_data or ""):
                photo_args.append(r.post_data)

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

        # Notarea: detaliile se ofera, pozele nu.
        a.click("a.btn-plus")
        soft(lambda: a.wait_for_selector("#note-row", timeout=8000), "formularul ofera detalii, pe care baza aceasta le pastreaza")
        check(a.locator('[data-act="pic-pick"]').count() == 0 and a.locator("#act-pic").count() == 0, "dar nu ofera poza")
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
        check(a.evaluate("() => JSON.parse(localStorage.getItem('scor.v1')).sv") == 3, "aplicatia a retinut ca serverul este la versiunea dinaintea pozelor")

        # Dialogul si ecranul de detalii arata ca in versiunea dinainte.
        a.click('#nav a[data-route="azi"]')
        a.click('#today-list .row:has-text("Sală")')
        check(text(a, "#dlg-n") == "Picioare, 45 de minute." and text(a, "#dlg-link") == "Schimbă detaliile", "dialogul arata detaliile si ofera schimbarea lor, fara nicio vorba despre poze")
        check(a.locator("#dlg-p").is_hidden(), "si nu arata niciun loc de poza")
        a.click("#dlg-link")
        check(text(a, "h1") == "Detalii" and text(a, "#note-btn") == "Salvează detaliile" and a.locator("#note-pic").count() == 0, "ecranul de detalii este cel simplu, fara poza")
        a.fill("#note-input", "Picioare si spate.")
        a.click("#note-btn")
        soft(lambda: wait_text(a, "#toast", "Detalii salvate"), "schimbarea detaliilor este confirmata")
        soft(lambda: saved(a), "si ajunge in cont")
        check(db("select note from public.entries where key = 'gym'") == "Picioare si spate.", "in baza: detaliile cele noi")
        a.click('#nav a[data-route="azi"]')
        a.click('#today-list .row:has-text("Prea mult pe telefon")')
        check(text(a, "#dlg-link") == "Adaugă detalii", "o activitate fara detalii primeste oferta de a le adauga")
        check(text(a, "#dlg-extra") == "Arată în flux", "si schimbarea vizibilitatii")
        a.click("#dlg-ok")
        soft(lambda: saved(a), "stergerea se salveaza")
        check(db("select count(*) || '/' || count(*) filter (where is_public) from public.entries") == "1/1", "in baza: a ramas o activitate, publica")

        # Fluxul si incurajarile.
        ctx_b, b = new_page()
        sign_up(b, "bogdan@example.test", "alta-parola-9", "Bogdan")
        b.click('#nav a[data-route="flux"]')
        post = '#feed-list .post:has-text("Sală")'
        soft(lambda: wait_text(b, post, "Ana"), "fluxul arata activitatea Anei")
        b.click(post + " .post-more")
        soft(lambda: wait_text(b, post + " .post-note", "Picioare si spate."), "cu detaliile la apasare")
        check(b.locator(post + " .shot").count() == 0, "si fara loc de poza")
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

        check(not files, "nicio cerere catre locul de fisiere: " + "; ".join(files[:3]))
        check(not photo_args, "nicio schimbare de poze trimisa unui server care nu le cunoaste")
        check(not bad, "niciun raspuns de eroare de la server: " + "; ".join(bad[:4]))
        check(not errs, "fara erori in consola: " + "; ".join(errs[:3]))
        browser.close()
except Exception as e:  # noqa: BLE001
    check(False, "parcursul s-a oprit inainte de capat: " + str(e).splitlines()[0][:200])
finally:
    stop(server)

finish()
