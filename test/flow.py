"""Parcurge aplicatia ca un utilizator, pe ecran de telefon, si verifica ce se vede."""
import datetime
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parent.parent
SITE = (ROOT / "test" / "local" / "index.html").as_uri()
ART = (ROOT / "test" / "artifact-preview.html").as_uri()
SHOTS = ROOT / "test" / "shots"
SHOTS.mkdir(parents=True, exist_ok=True)
problems = []
MINUS = "−"


def check(cond, msg):
    print(("ok    " if cond else "FAIL  ") + msg)
    if not cond:
        problems.append(msg)


def text(page, sel):
    return page.locator(sel).first.inner_text().strip()


def shot(page, name, full=False):
    page.wait_for_timeout(250)
    page.screenshot(path=str(SHOTS / name), full_page=full)


def no_overflow(page, label):
    wide = page.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check(wide <= 0, f"no sideways scroll: {label} (extra {wide}px)")


SEED = """() => {
  const d = JSON.parse(localStorage.getItem('scor.v1'));
  const now = new Date();
  const key = (dt) => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
  const plan = {1: 25, 2: 30, 3: 15, 4: 30, 5: 20, 6: -5, 9: 10, 10: 10, 11: 10, 12: 10, 13: 10, 14: 10, 15: 10, 16: 10};
  for (const [ago, total] of Object.entries(plan)) {
    const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() - Number(ago), 9, 0, 0);
    let rest = Math.abs(total), i = 0;
    while (rest > 0) {
      const pts = Math.min(20, rest);
      d.entries.push({id: 's' + ago + '-' + i, ts: dt.getTime() + i * 60000, day: key(dt), type: total > 0 ? 'plus' : 'minus', pts, name: 'Test ' + ago});
      rest -= pts; i++;
    }
  }
  localStorage.setItem('scor.v1', JSON.stringify(d));
}"""

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--no-sandbox"])
    opts = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="ro-RO", timezone_id="Europe/Bucharest")
    ctx = browser.new_context(**opts)
    page = ctx.new_page()
    errs = []
    failed = []

    def watch(pg, bucket):
        # Fonturile Google nu se pot incarca din mediul de test; orice alta resursa lipsa e o problema reala.
        pg.on("console", lambda m: bucket.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
        pg.on("pageerror", lambda e: bucket.append("pageerror: " + str(e)))
        pg.on("requestfailed", lambda r: failed.append(r.url) if "fonts.g" not in r.url else None)

    watch(page, errs)

    # --- pornire ---
    page.goto(SITE)
    page.wait_for_selector("#score")
    check(text(page, "#score") == "0", "starts empty with score 0")
    check(page.locator(".demo").count() == 0, "no example banner on the hosted build")
    check(text(page, "h1") == "Azi", "Romanian from the browser language")
    check(page.evaluate("() => document.documentElement.lang") == "ro", "html lang is ro")
    check("Faptă bună" in text(page, "a.btn-plus") and "Mai puțin bună" in text(page, "a.btn-minus"), "Romanian buttons written with diacritics")
    check(text(page, ".sect > h2") == "ACTIVITĂȚILE DE AZI", "uppercase heading keeps the diacritics, got " + text(page, ".sect > h2"))
    check(text(page, ".empty-s") == "Începe cu o faptă bună.", "empty day hint with diacritics")
    check(page.get_attribute("#nav", "aria-label") == "Secțiuni", "tab bar label with diacritics")
    shot(page, "01-gol.png")

    # --- o fapta buna din favorite ---
    page.click("a.btn-plus")
    check(text(page, "h1") == "Activitate nouă", "add screen opens")
    check(page.locator("#nav").is_hidden(), "tab bar hidden on the add screen")
    page.click('.chip:has-text("Sală")')
    check(page.input_value("#act-name") == "Sală", "favorite fills the name")
    check(text(page, "#save-btn") == "Salvează +10", "save label shows the points")
    check(page.locator("#keep-row").is_hidden(), "keep in favorites hidden for an existing favorite")
    check(page.locator('.chip[aria-pressed="true"]').count() == 1, "one favorite marked as selected")
    shot(page, "02-adauga.png")
    page.click("#save-btn")
    check(text(page, "h1") == "Azi", "back on today after saving")
    check(text(page, "#score") == "+10", "score +10 after saving")
    check(page.locator("#today-list .row").count() == 1, "one row in today's list")
    check(page.locator("#toast").is_visible(), "confirmation message visible")

    # --- una mai putin buna, scrisa de mana ---
    page.click("a.btn-minus")
    check(page.locator('.seg-b.minus[aria-pressed="true"]').count() == 1, "minus preselected")
    page.click("#save-btn")
    check(page.locator("#name-err").is_visible(), "missing name message shown")
    check(text(page, "h1") == "Activitate nouă", "still on the add screen")
    page.fill("#act-name", "Chipsuri <b>")
    check(page.locator("#name-err").is_hidden(), "message goes away when typing")
    check(page.locator("#keep-row").is_visible(), "keep in favorites offered for a new name")
    page.click('[data-focus="step-down"]')
    page.click('[data-focus="step-down"]')
    check(text(page, "#pts-val") == "8", "stepper goes down to 8")
    check(text(page, "#save-btn") == "Salvează " + MINUS + "8", "minus save label")
    check(page.input_value("#act-name") == "Chipsuri <b>", "typed name survives the stepper")
    page.check("#keep-fav")
    shot(page, "03-minus.png")
    page.press("#act-name", "Enter")
    check(text(page, "#score") == "+2", "score +2 after minus 8")
    check("Chipsuri <b>" in text(page, "#today-list"), "custom name shown as text, not as markup")
    check(page.locator("#today-list b").count() == 0, "no markup injected from the name")

    # --- o favorita scrisa de mana, fara diacritice, nu este oferita inca o data ---
    page.click("a.btn-plus")
    page.fill("#act-name", "sala")
    check(page.locator("#keep-row").is_hidden(), "typing sala by hand matches the favorite Sală")
    page.fill("#act-name", "SALĂ ")
    check(page.locator("#keep-row").is_hidden(), "capitals and spaces do not make it a new favorite either")
    page.fill("#act-name", "sala de dans")
    check(page.locator("#keep-row").is_visible(), "a different name is still offered as a new favorite")
    page.click("a.icon-btn")

    # --- limitele de puncte ---
    page.click("a.btn-plus")
    for _ in range(15):
        page.click('[data-focus="step-up"]')
    check(text(page, "#pts-val") == "20", "points capped at 20")
    for _ in range(30):
        page.click('[data-focus="step-down"]')
    check(text(page, "#pts-val") == "1", "points floor at 1")
    page.click("a.icon-btn")
    check(text(page, "h1") == "Azi", "close returns to today")
    check(page.locator("#today-list .row").count() == 2, "closing saves nothing")

    # --- favorita noua, schimbarea felului pastreaza textul ---
    page.click("a.btn-minus")
    check(page.locator('.chip:has-text("Chipsuri")').count() == 1, "new favorite kept")
    page.fill("#act-name", "Ceva")
    page.click('[data-focus="type-plus"]')
    check(page.input_value("#act-name") == "Ceva", "name kept when switching kind")
    check(text(page, "#save-btn") == "Salvează +10", "label follows the kind")
    page.go_back()
    check(text(page, "h1") == "Azi", "browser back closes the add screen")

    # --- stergere prin dialog ---
    page.click('#today-list .row:has-text("Chipsuri")')
    check(page.locator("#dlg[open]").count() == 1, "dialog opens from a row")
    shot(page, "04-dialog.png")
    page.click("#dlg-cancel")
    check(page.locator("#dlg[open]").count() == 0, "dialog closes on cancel")
    check(text(page, "#score") == "+2", "cancel deletes nothing")
    page.click('#today-list .row:has-text("Chipsuri")')
    page.keyboard.press("Escape")
    check(page.locator("#dlg[open]").count() == 0, "dialog closes on Escape")
    page.click('#today-list .row:has-text("Chipsuri")')
    page.click("#dlg-ok")
    check(text(page, "#score") == "+10", "score back to +10 after delete")
    check(page.locator("#today-list .row").count() == 1, "row removed")

    # --- detalii: scrise la notare, vazute doar la apasare, schimbate si sterse mai tarziu ---
    page.click("a.btn-plus")
    check(page.locator("#act-note").count() == 0 and "Detalii" in text(page, "#note-row"), "details stay folded until asked for")
    page.fill("#act-name", "Ajutat un vecin")
    page.click('[data-act="note-open"]')
    check(page.evaluate("() => document.activeElement.id") == "act-note", "the details field opens with the cursor in it")
    check(page.input_value("#act-name") == "Ajutat un vecin", "opening the details keeps the name")
    typed = "  Am mutat o canapea.\n\n\n\nA durat o oră. <i>fără marcaje</i>  "
    page.fill("#act-note", typed)
    check(text(page, "#act-note-n") == "%d/300" % len(typed), "the counter follows the text, got " + text(page, "#act-note-n"))
    shot(page, "13-detalii-notare.png", full=True)
    no_overflow(page, "add with details 390")
    # Cu tastatura deschisa ecranul e scund: butonul de salvare nu are voie sa acopere randul care se scrie.
    page.set_viewport_size({"width": 390, "height": 400})
    page.click("#act-note")
    page.keyboard.press("Control+End")
    page.keyboard.type("\nInca un rand.\nSi inca unul.\nSi ultimul.")
    page.wait_for_timeout(200)
    box = page.evaluate("""() => {
      const a = document.getElementById('act-note').getBoundingClientRect(), s = document.getElementById('save-btn').getBoundingClientRect();
      return [Math.round(a.bottom), Math.round(s.top), window.innerHeight];
    }""")
    check(box[1] >= box[0] and box[0] <= box[2], "while details are typed on a short screen the save button does not cover them (field ends at %d, button starts at %d)" % (box[0], box[1]))
    page.fill("#act-note", typed)
    check(page.locator('[data-act="pic-pick"]').count() == 0 and page.locator("#act-pic").count() == 0, "without an account the form offers no photo: photos live in the account")
    page.set_viewport_size({"width": 390, "height": 844})
    page.click('[data-focus="type-minus"]')
    page.click('[data-focus="type-plus"]')
    check(page.input_value("#act-note").strip().startswith("Am mutat o canapea."), "details survive switching the kind")
    page.click("#save-btn")
    row = '#today-list .row:has-text("Ajutat un vecin")'
    check(text(page, "#score") == "+20", "activity with details saved")
    check(page.locator(row + " .note-ic").count() == 1 and page.locator('#today-list .row:has-text("Sală") .note-ic').count() == 0, "a small mark shows which activity has details")
    check("Am mutat" not in text(page, "#today-list"), "the details themselves stay out of the list")
    page.click(row)
    check(text(page, "#dlg-n") == "Am mutat o canapea.\n\nA durat o oră. <i>fără marcaje</i>", "the dialog shows the details, tidied up: " + repr(text(page, "#dlg-n")))
    check(page.locator("#dlg-n i").count() == 0, "details are shown as text, never as markup")
    check(text(page, "#dlg-link") == "Schimbă detaliile", "the dialog offers to change them")
    shot(page, "14-detalii-dialog.png")
    page.click("#dlg-link")
    check(text(page, "h1") == "Detalii" and page.input_value("#note-input").startswith("Am mutat o canapea."), "the details screen opens with the current text")
    check(page.locator("#nav").is_hidden() and "Ajutat un vecin" in text(page, ".note-of"), "it names the activity and hides the tab bar")
    check(page.locator('[data-act="pic-pick"]').count() == 0 and page.locator("#note-pic").count() == 0 and text(page, "#note-btn") == "Salvează detaliile",
          "without an account the details screen offers no photo")
    page.fill("#note-input", "Am mutat o canapea și două fotolii.")
    shot(page, "15-detalii-schimbare.png")
    page.click("#note-btn")
    check(text(page, "h1") == "Azi" and page.locator("#toast").is_visible(), "saving returns to today with a confirmation")
    page.click(row)
    check(text(page, "#dlg-n") == "Am mutat o canapea și două fotolii.", "the changed details are shown")
    page.click("#dlg-link")
    page.fill("#note-input", "Nu se salvează")
    page.click("a.icon-btn")
    page.click(row)
    check(text(page, "#dlg-n") == "Am mutat o canapea și două fotolii.", "closing the details screen changes nothing")
    page.click("#dlg-link")
    page.fill("#note-input", "  \n ")
    page.click("#note-btn")
    check(page.locator(row + " .note-ic").count() == 0, "emptying the field removes the details and the mark")
    page.click(row)
    check(page.locator("#dlg-n").is_hidden() and text(page, "#dlg-link") == "Adaugă detalii", "without details the dialog offers to add some")
    page.click("#dlg-link")
    page.fill("#note-input", "Adăugate mai târziu.")
    page.press("#note-input", "Enter")
    check(text(page, "h1") == "Detalii" and page.input_value("#note-input") == "Adăugate mai târziu.\n", "Enter makes a new line instead of saving")
    page.click("#note-btn")
    # Dupa o schimbare de ecran browserul isi cere din nou iconita; o reincarcare imediata ar intrerupe cererea.
    page.wait_for_timeout(500)
    page.reload()
    page.wait_for_selector("#score")
    check(page.locator(row + " .note-ic").count() == 1, "details survive a reload")
    page.click('#nav a[data-route="jurnal"]')
    page.click("#day-list > li:nth-child(1) > .row")
    page.click('#day-list .sub .row:has-text("Ajutat un vecin")')
    check(text(page, "#dlg-n") == "Adăugate mai târziu.", "the journal shows the same details")
    page.click("#dlg-link")
    page.click("a.icon-btn")
    check(text(page, "h1") == "Jurnal", "from the journal, the details screen returns to the journal")
    page.click("#day-list > li:nth-child(1) > .row")
    page.click('#nav a[data-route="azi"]')
    page.click(row)
    page.click("#dlg-ok")
    check(text(page, "#score") == "+10" and page.locator("#today-list .row").count() == 1, "an activity with details is deleted like any other")
    page.evaluate("() => { window.location.hash = '#detalii'; }")
    page.wait_for_timeout(500)
    check(text(page, "h1") == "Azi", "the details screen does not open for an activity that is gone")

    # --- datele raman dupa reincarcare ---
    page.reload()
    page.wait_for_selector("#score")
    check(text(page, "#score") == "+10", "data survives a reload")

    # --- istoric pe mai multe zile ---
    page.click('#nav a[data-route="jurnal"]')
    check(text(page, "#week-line") == "prima zi, și e pe plus", "on the first day the week line only says whether today is on plus, got " + text(page, "#week-line"))
    page.click('#nav a[data-route="azi"]')
    page.evaluate(SEED)
    # Dupa o schimbare de ecran browserul isi cere din nou iconita; o reincarcare imediata ar intrerupe cererea.
    page.wait_for_timeout(500)
    page.reload()
    page.wait_for_selector("#score")
    check(text(page, "#streak") == "6 zile", "streak of 6 days, got " + text(page, "#streak"))
    check(text(page, "#week") == "+125", "7 day total +125, got " + text(page, "#week"))
    check(text(page, "#best") == "8 zile", "best streak 8 days, got " + text(page, "#best"))
    shot(page, "05-azi.png")
    no_overflow(page, "today 390")

    page.click('#nav a[data-route="jurnal"]')
    check(text(page, "h1") == "Jurnal", "journal opens")
    check(text(page, "#week-total") == "+125", "journal total +125")
    check("serie de 6 zile" in text(page, "#week-streak"), "journal streak text")
    best_day = ["duminică", "luni", "marți", "miercuri", "joi", "vineri", "sâmbătă"][(datetime.date.today() - datetime.timedelta(days=4)).isoweekday() % 7]
    check(text(page, "#week-line") == "6 din 7 zile pe plus · cea mai bună zi: %s, +30" % best_day,
          "the week line counts the days on plus and names the best one, got " + text(page, "#week-line"))
    check(page.locator(".bar").count() == 7, "seven bars")
    check(page.locator(".bar.neg").count() == 1, "one negative bar")
    check(page.locator("#day-list > li").count() == 15, "15 days listed, got %d" % page.locator("#day-list > li").count())
    days = text(page, "#day-list")
    check("2 activități · toate pe plus" in days, "a day with two good deeds says: toate pe plus")
    check("1 activitate · pe plus" in days and "1 activitate · pe minus" in days, "a day with one activity does not say: toate")
    check("1 activitate · toate" not in days, "no plural wording next to a single activity")
    page.click("#day-list > li:nth-child(2) > .row")
    check(page.locator("#day-list > li:nth-child(2) .sub .row").count() == 2, "day expands to its activities")
    shot(page, "06-jurnal.png")
    no_overflow(page, "journal 390")
    page.click("#day-list > li:nth-child(2) .sub .row >> nth=0")
    check(page.locator("#dlg[open]").count() == 1, "an older activity can be opened")
    page.click("#dlg-ok")
    check(text(page, "#week-total") == "+120", "deleting an older 5 point activity updates the total, got " + text(page, "#week-total"))

    # --- profil, limba ---
    page.click('#nav a[data-route="profil"]')
    check(text(page, "h1") == "Profil", "profile opens")
    check(text(page, '[data-lang="ro"]') == "Română", "language button says Română")
    check("Am amânat ceva" in text(page, "#view") and "Meditație" in text(page, "#view") and "Țigară" not in text(page, "#view"), "default favorites listed with diacritics, without cigarette")
    shot(page, "07-profil.png", full=True)
    no_overflow(page, "profile 390")
    page.click('[data-lang="en"]')
    check(text(page, "h1") == "Profile", "switches to English")
    check(page.evaluate("() => document.documentElement.lang") == "en", "html lang is en")
    check(page.locator('#nav a[aria-current="page"]').inner_text().strip() == "Profile", "tab bar translated")
    page.click('#nav a[data-route="azi"]')
    check(text(page, "h1") == "Today", "today in English")
    check(text(page, "#streak") == "6 days", "English plural")
    check("Gym" in text(page, "#today-list"), "default favorite names follow the language")
    page.click("a.btn-plus")
    check("Details" in text(page, "#note-row") and text(page, '[data-act="note-open"]') == "Add", "details row in English")
    page.click('[data-act="note-open"]')
    check(text(page, "#act-note-n") == "0/300" and page.get_attribute("#act-note", "placeholder").startswith("For example"), "details field in English")
    page.click("a.icon-btn")
    shot(page, "08-today-en.png")
    page.click('#nav a[data-route="jurnal"]')
    shot(page, "09-journal-en.png")
    page.reload()
    page.wait_for_selector("h1")
    check(text(page, "h1") == "Journal", "language and screen survive a reload")

    # --- latimi mici si mari ---
    for w in (320, 360, 480, 900):
        page.set_viewport_size({"width": w, "height": 720})
        for r in ("azi", "jurnal", "profil"):
            page.click(f'#nav a[data-route="{r}"]')
            no_overflow(page, f"{r} {w}")
        page.click('#nav a[data-route="azi"]')
        page.click("a.btn-minus")
        no_overflow(page, f"add {w}")
        if w == 320:
            shot(page, "10-add-320.png", full=True)
        page.click("a.icon-btn")
        if w == 320:
            shot(page, "11-today-320.png", full=True)
    page.set_viewport_size({"width": 390, "height": 844})

    # --- favorite si resetare ---
    page.click('#nav a[data-route="profil"]')
    n = page.locator('[data-act="unfav"]').count()
    page.click('[data-act="unfav"] >> nth=0')
    check(page.locator('[data-act="unfav"]').count() == n - 1, "favorite removed")
    page.click('[data-act="reset"]')
    check(page.locator("#dlg[open]").count() == 1, "reset asks first")
    page.click("#dlg-ok")
    check(page.locator('[data-act="unfav"]').count() == 12, "favorites back to the 12 defaults")
    page.click('#nav a[data-route="azi"]')
    check(text(page, "#score") == "0", "score 0 after reset")
    check(text(page, "h1") == "Today", "language kept after reset")

    # --- zi pe minus ---
    page.click("a.btn-minus")
    page.fill("#act-name", "Cigarette")
    page.click("#save-btn")
    check(text(page, "#score") == MINUS + "10", "negative day shows minus 10")
    check("neg" in page.locator("#score").get_attribute("class"), "negative score uses the minus colour")
    shot(page, "12-minus-day.png")

    # --- legatura directa la un ecran ---
    page.goto(SITE + "#jurnal")
    page.wait_for_selector("h1")
    check(text(page, "h1") == "Journal", "direct link to the journal")
    check(not errs, "no console errors on the hosted build: " + "; ".join(errs[:3]))
    ctx.close()

    # --- pagina de previzualizare, cu date de exemplu ---
    ctx2 = browser.new_context(**dict(opts, locale="en-US"))
    page = ctx2.new_page()
    errs2 = []
    watch(page, errs2)
    page.goto(ART)
    page.wait_for_selector("#score")
    check(text(page, "h1") == "Azi", "preview opens in Romanian even on an English browser")
    check(page.locator(".demo").count() == 1, "example banner shown in the preview")
    check(text(page, "#score") == "+30", "example day is +30, got " + text(page, "#score"))
    check(text(page, "#week") == "+150", "example week is +150, got " + text(page, "#week"))
    check(text(page, "#streak") == "6 zile", "example streak 6 days")
    check(page.locator("#today-list .row").count() == 5, "five example activities today")
    print("       example times today:", [t.strip() for t in page.locator("#today-list .row-s").all_inner_texts()])
    shot(page, "a1-azi.png")
    no_overflow(page, "preview today")
    page.click('#nav a[data-route="jurnal"]')
    shot(page, "a2-jurnal.png")
    page.click('#nav a[data-route="azi"]')
    page.click("a.btn-plus")
    shot(page, "a3-adauga.png")
    page.click("a.icon-btn")
    page.click('[data-act="demo-clear"]')
    check(text(page, "#score") == "0", "start from zero clears the examples")
    check(page.locator(".demo").count() == 0, "banner gone after clearing")
    page.reload()
    page.wait_for_selector("#score")
    check(page.locator(".demo").count() == 0, "examples do not come back after a reload")
    check(not errs2, "no console errors in the preview: " + "; ".join(errs2[:3]))
    ctx2.close()

    # --- pornire fara internet, prin service worker ---
    import subprocess
    import time
    srv = subprocess.Popen([sys.executable, "-m", "http.server", "8765", "--bind", "127.0.0.1", "--directory", str(ROOT / "test" / "local")],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.2)
    ctx3 = browser.new_context(**opts)
    page = ctx3.new_page()
    errs3 = []
    watch(page, errs3)
    page.goto("http://127.0.0.1:8765/#detalii")
    page.wait_for_selector("#score")
    check(text(page, "h1") == "Azi", "a direct link to the details screen, with no activity chosen, opens today")
    page.evaluate("async () => { await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready; }")
    page.reload()
    page.wait_for_selector("#score")
    check(page.evaluate("() => !!navigator.serviceWorker.controller"), "service worker controls the page")
    page.click("a.btn-plus")
    page.click('.chip:has-text("Citit")')
    page.click("#save-btn")
    check(text(page, "#score") == "+10", "activity saved on the served build")
    cached = page.evaluate("async () => { const k = await caches.keys(); const c = await caches.open(k[0]); return [k, (await c.keys()).map(r => new URL(r.url).pathname)]; }")
    print("       cache:", cached)
    srv.terminate()
    srv.wait()
    page.reload()
    page.wait_for_selector("#score", timeout=8000)
    check(text(page, "#score") == "+10", "opens with the server gone and keeps the data")
    check(page.evaluate("async () => (await fetch('manifest.webmanifest')).ok"), "manifest served from the saved copy")
    check(not errs3, "no console errors with the service worker: " + "; ".join(errs3[:3]))
    ctx3.close()
    check(not failed, "no missing files: " + "; ".join(failed[:5]))
    browser.close()

print()
print("PROBLEMS: %d" % len(problems))
for m in problems:
    print(" - " + m)
sys.exit(1 if problems else 0)
