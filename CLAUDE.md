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

## Accounts and feed (version 0.2)

- Backend is Supabase, project URL in `src/config.json`. With URL and publishable key filled in, the build runs with accounts; with either one empty it stays in the device-only mode of 0.1. The preview artifact always stays device-only.
- `supabase/schema.sql` is the whole database: tables, grants, row level security, triggers and the functions the app calls (`me`, `set_name`, `sync`, `feed`, `cheer`, `delete_my_account`). It is idempotent; the owner pastes it into the Supabase SQL Editor. The app talks to the database only through those functions.
- `src/api.js` is the only file that touches the network. It loads supabase-js from the CDN URL in `src/config.json`.
- The app is local-first: screens render from local data, `sync()` in `src/app.js` sends pending changes and pulls the account state in one call.
- `src/social.css` holds the styles for accounts, visibility and the feed; it is concatenated after `app.css`.
- Tests: `test/db/start.sh` starts a local PostgreSQL shaped like a Supabase project and loads the schema; `psql -h 127.0.0.1 -p 54329 -U postgres -d postgres -f test/db/security.sql` checks the access rules (also run with `SCOR_STRICT=1`); `python3 test/accounts.py` walks the app with several users against `test/server.py`, a stand-in for Supabase that uses `test/fake-supabase.js` in place of supabase-js.
- The sandbox cannot reach Supabase, npm or CDNs, so the real supabase-js and the real project are never exercised here. The first run against the real project has to be checked by the owner on the live site.

### Status on 2026-10-13

- 0.2 is built and passes all local tests on branch `claude/surse-si-v0.2`. It is not merged; `main` still serves 0.1.
- Still to do, one step at a time with the owner: get the publishable key into `src/config.json`, have him run `supabase/schema.sql`, turn off "Confirm email" for the test phase, rebuild, publish to `main`, then test sign-up on the live site.
- Password reset is not built yet: Supabase's built-in email only reaches project team members, so it needs a custom SMTP service and a domain first.

## Conventions

- Plain JavaScript without a build step or framework, so the whole app is one self-contained `index.html`.
- User-provided text is always escaped with `esc()` before it goes into markup.
- Browser storage access is wrapped in try/catch; the app must render without it.
- `confirm()` and `alert()` are never used; confirmations go through the `<dialog>` in `body.html`.
