# Scorul zilei (working name)

Motivational web app. People log good deeds (plus points) and less good ones (minus points), see a daily score, a streak and a journal. The owner is not a developer; Claude writes and ships all the code. Reply to the owner in plain language, without jargon.

## Layout

- `src/` is the source of truth: `app.css`, `logic.js` (pure scoring rules, also loaded by the node test), `app.js` (UI, routing, storage, all strings), `body.html`.
- `build.py` assembles `src/` into the files GitHub Pages serves from the repo root (`index.html`, `sw.js`, `manifest.webmanifest`, icons) and into `artifact/scorul-zilei.html`, a preview page with example data that is not committed.
- Never edit the built files at the root by hand. Edit `src/`, run the build, commit sources and built files together.
- `test/logic.test.js` runs under node. `test/flow.py` walks the built app with Playwright on a phone-size screen, including an offline start through the service worker.

## Commands

- Build: `python3 build.py`
- Tests: `TZ=Europe/Bucharest node test/logic.test.js` then `python3 test/flow.py`
- The Playwright script launches `/opt/pw-browsers/chromium`. Google Fonts cannot load in the sandbox; the test ignores those failures only.

## Deploy

- GitHub Pages serves branch `main`, folder `/`, at https://ionutrao.github.io/scor/. Whatever reaches `main` is live within minutes.
- The version lives in two places that must change together: `VERSION` in `build.py` (names the service worker cache) and `VERSION` in `src/app.js` (shown in Profile).
- All paths are relative so the app works under `/scor/` and later under a custom domain.

## Product rules already decided with the owner

- An activity is worth 1 to 20 points, plus or minus. The score is per day.
- Streak: consecutive days that ended above zero. Today counts only once it is above zero, otherwise the streak runs through yesterday.
- Encouragements from other people are counted separately and never added to the score.
- Visibility is per activity. Minus activities are private by default.
- Romanian and English from the start. Every UI string lives in the `T` dictionary in `src/app.js`. Romanian UI text is written without diacritics for now.
- Look: Manrope, one light theme, tokens at the top of `src/app.css`: indigo ink and score cards, mint for plus, coral for minus, gold for rewards.
- Kept deliberately small: no leaderboards and no comments in the first versions.

## Conventions

- Plain JavaScript without a build step or framework, so the whole app is one self-contained `index.html`.
- User-provided text is always escaped with `esc()` before it goes into markup.
- Browser storage access is wrapped in try/catch; the app must render without it.
- `confirm()` and `alert()` are never used; confirmations go through the `<dialog>` in `body.html`.
