"""Unelte comune pentru parcursurile cu conturi: pornesc baza locala si serverul de test si tin socoteala verificarilor.

   Folosit de test/photos.py. Parcursurile mai vechi (accounts.py, old_server.py) au propriile copii ale acestor unelte.
"""
import os
import pathlib
import subprocess
import sys
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = int(os.environ.get("SCOR_PORT", "8766"))
BASE = f"http://127.0.0.1:{PORT}"
SHOTS = ROOT / "test" / "shots"
SHOTS.mkdir(parents=True, exist_ok=True)
problems = []


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


def until(page, cond, what, timeout=8000):
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
    page.wait_for_selector("#score")


def sign_in(page, email, password):
    page.goto(BASE)
    page.wait_for_selector("#auth-btn")
    page.fill("#auth-email", email)
    page.fill("#auth-pass", password)
    page.click("#auth-btn")
    page.wait_for_selector("#score")


def saved(page, timeout=10000):
    """Asteapta pana cand totul a ajuns in cont, privind din Profil."""
    page.click('#nav a[data-route="profil"]')
    wait_text(page, "#sync-status", "Totul e salvat în cont", timeout)


def setting(**mode):
    """Schimba felul in care se poarta serverul de test (vezi /__test/set in test/server.py)."""
    query = "&".join(f"{k}={v}" for k, v in mode.items())
    return urllib.request.urlopen(f"{BASE}/__test/set?{query}", timeout=2).read()


def start(schema=None):
    """Porneste baza locala (cu scriptul de acum sau cu cel dat) si serverul de test. Intoarce serverul, pentru stop()."""
    env = dict(os.environ)
    if schema:
        env["SCOR_SCHEMA_FILE"] = str(schema)
    subprocess.run([str(ROOT / "test" / "db" / "start.sh")], check=True, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    server = subprocess.Popen([sys.executable, str(ROOT / "test" / "server.py")], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    for _ in range(50):
        try:
            setting(confirm=0)
            break
        except Exception:  # noqa: BLE001
            time.sleep(0.2)
    return server


def stop(server):
    try:
        setting(feed=0)
    except Exception:  # noqa: BLE001
        pass
    server.terminate()
    subprocess.run([str(ROOT / "test" / "db" / "start.sh"), "stop"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def finish():
    print()
    print("PROBLEMS: %d" % len(problems))
    for m in problems:
        print(" - " + m)
    sys.exit(1 if problems else 0)
