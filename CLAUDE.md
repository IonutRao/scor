# Scorul zilei (working name)

Motivational web app. People log good deeds (plus points) and less good ones (minus points), see a daily score, a streak and a journal. The owner is not a developer; Claude writes and ships all the code. Reply to the owner in plain language, without jargon, one step at a time: one short message, one thing for him to do, then wait.

## Layout

- `src/` is the source of truth: `app.css`, `logic.js` (pure scoring rules, also loaded by the node test), `i18n.js` (every UI string, Romanian and English, also loaded by a node test), `app.js` (UI, routing, storage), `body.html`. `build.py` concatenates the scripts in the order `logic.js`, `i18n.js`, `api.js`, `app.js`.
- `build.py` assembles `src/` into the files GitHub Pages serves from the repo root (`index.html`, `sw.js`, `manifest.webmanifest`, icons) and into `artifact/scorul-zilei.html`, a preview page with example data that is not committed.
- Never edit the built files at the root by hand. Edit `src/`, run the build, commit sources and built files together.
- `test/logic.test.js` and `test/i18n.test.js` run under node. `test/flow.py` walks the built app with Playwright on a phone-size screen, including an offline start through the service worker.

## Commands

- Build: `python3 build.py`
- Tests: `TZ=Europe/Bucharest node test/logic.test.js`, `node test/i18n.test.js`, then `python3 test/flow.py`
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
- An activity has a short title (up to 40 characters) and optional details (up to 300 characters, line breaks allowed). Details are never shown in lists: a small tag marks the activities that have them and the text appears on tap (the activity's dialog in Azi and Jurnal, an inline block in Flux). Whoever can see the activity can see its details. They can be written when logging, or added, changed and removed later; title and points still cannot be changed.
- Agreed next step, not built yet: one optional photo per activity, shrunk in the app before upload, shown only on tap like the details. Before the app is opened to strangers, public text and photos need a report button and a way for the owner to remove them.
- Romanian and English from the start. Every UI string lives in the `T` dictionary in `src/i18n.js`; both languages must have the same keys, and `test/i18n.test.js` checks it.
- Romanian text shown to people is written with diacritics, with ș and ț as comma-below letters (never the cedilla forms), and wording that agrees with the number next to it (1 încurajare, 2 încurajări). The owner's own chat preference (no diacritics, no hyphens) is about replies to him, not about the app.
- Default favorites and the activities logged from them are stored by key (`gym`, `smoke`) and named at display time, so their names follow the language and any later text correction. Names people type are kept as typed; `fold()` in `src/app.js` compares names ignoring case and diacritics.
- Look: Manrope, one light theme, tokens at the top of `src/app.css`: indigo ink and score cards, mint for plus, coral for minus, gold for rewards.
- Kept deliberately small: no leaderboards and no comments in the first versions.

## Accounts and feed (version 0.2)

- Backend is Supabase, project URL in `src/config.json`. With URL and publishable key filled in, the build runs with accounts; with either one empty it stays in the device-only mode of 0.1. The preview artifact always stays device-only.
- `supabase/schema.sql` is the whole database: tables, grants, row level security, triggers and the functions the app calls (`me`, `set_name`, `sync`, `feed`, `cheer`, `delete_my_account`; `note_text` is a helper). It is idempotent and also upgrades a database created by an older copy of itself; the owner pastes it into the Supabase SQL Editor. The app talks to the database only through those functions.
- The owner runs the script by hand, so the app and the database are never updated at the same moment. Every release must hold in both directions: the new app on the previous script (what depends on the new script stays hidden) and the previous app on the new script. `sync` returns the script version as `v` (3 since details); the app keeps it in `data.sv` and `notesOn()` gates the details on it. A parameter added to a function gets a default, and the old signature is dropped in the script so there is never a second function with the same name. Publish the app first, then ask the owner to run the script.
- Details live in `entries.note`. `L.cleanNote()` in `src/logic.js` and `note_text()` in the script apply the same tidy-up rule; `test/accounts.py` compares them. New details travel inside `p_add`; later changes go through `data.outbox.note` and the `p_note` parameter, which is sent only when there is something in it.
- `src/api.js` is the only file that touches the network. It loads supabase-js from the CDN URL in `src/config.json`.
- The app is local-first: screens render from local data, `sync()` in `src/app.js` sends pending changes and pulls the account state in one call.
- `src/social.css` holds the styles for accounts, visibility and the feed; it is concatenated after `app.css`.
- The feed refreshes itself while the Flux screen is open and visible (`feedTick()` in `src/app.js`, every `FEED_EVERY`, 15 seconds; slower after failed attempts; nothing while the page is hidden or offline). It is plain polling of the `feed` function, not a live connection. `refreshFeed()` merges the newest page into what is on screen: no loading text, pages opened with "Mai multe" stay open, a reader who scrolled down keeps his place, and an encouragement the user just gave or withdrew is never overwritten by an older answer. Feed requests are numbered with `feedSeq`; an answer is used only if no other feed request started after it. The "Actualizează" link stays as a manual refresh.
- The user's own activities seen in the feed bring their encouragement counts with them (`noteMine()`); a full `sync` runs at most once a minute while Flux is open.
- Fine for the test phase, not for many users: every open feed asks for the newest page every 15 seconds and `sync` returns the whole journal each time. Before real scale, add a cheap "anything new" call or a live connection, and make `sync` send only what changed.
- Tests: `test/db/start.sh` starts a local PostgreSQL shaped like a Supabase project and loads the schema; `psql -h 127.0.0.1 -p 54329 -U postgres -d postgres -f test/db/security.sql` checks the access rules (also run with `SCOR_STRICT=1`); `python3 test/accounts.py` walks the app with several users against `test/server.py`, a stand-in for Supabase that uses `test/fake-supabase.js` in place of supabase-js. It takes about a minute and a half.
- `test/server.py` answers `/__test/set?feed=1000`: pages opened afterwards refresh the feed every second (`feedEvery` in the injected config) so the automatic refresh can be tested without waiting 15 seconds each time. The published build never sets `feedEvery`.
- Tests for the hand-run script: `python3 test/old_server.py` walks the current app on a database still on the previous script (`test/db/schema-0.2.sql`, loaded with `SCOR_SCHEMA_FILE`); `test/db/upgrade.sql`, run on such a database, loads the current script over existing data and checks nothing is lost. For the other direction, export the previous release (`git archive <commit>`), copy the current `supabase/schema.sql` into it and run its own `test/accounts.py`. When the script changes again, replace the snapshot with the script of the release being left behind.
- The sandbox cannot reach Supabase, npm or CDNs, so the real supabase-js and the real project are never exercised here. The first run against the real project has to be checked by the owner on the live site.

### Status on 2026-10-13

- `main` serves 0.3 with accounts, against the real Supabase project. The real database is still on the 0.2 script until the owner runs the current `supabase/schema.sql`; until then the app works as 0.2.2 and the details stay hidden. Ask him to confirm before assuming details work on the live site.
- Seen working on the real project, from the owner's screenshots and messages: sign-up, the name step, moving his 0.1 activities into the account, public activities in the feed, encouragements received from a second account, the feed refreshing on its own.
- 0.2.1 put the Romanian text on diacritics and moved the strings out of `src/app.js` into `src/i18n.js`. 0.2.2 made the feed refresh on its own. 0.3 added details to activities.
- Not yet seen working on the real project: details (needs the script), account deletion, the offline queue on a phone.
- Password reset is not built yet: Supabase's built-in email only reaches project team members, so it needs a custom SMTP service and a domain first.
- Since 0.2, finished and tested work is pushed straight to `main`, which makes it live. The owner was told this beforehand and went along with it.

## Conventions

- Plain JavaScript without a build step or framework, so the whole app is one self-contained `index.html`.
- User-provided text is always escaped with `esc()` before it goes into markup.
- Browser storage access is wrapped in try/catch; the app must render without it.
- `confirm()` and `alert()` are never used; confirmations go through the `<dialog>` in `body.html`.
