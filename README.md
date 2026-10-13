# Scorul zilei

Aplicație web motivațională: notezi faptele bune pe plus și pe cele mai puțin bune pe minus, vezi scorul zilei, seria de zile pe plus și jurnalul. Cu un cont, datele se păstrează și pe server, iar activitățile pe care alegi să le arăți apar în flux, unde ceilalți te pot încuraja. „Scorul zilei” este un nume de lucru.

Aplicația rulează la https://ionutrao.github.io/scor/ și se poate pune pe ecranul telefonului.

## Ce e în acest repo

| Loc | Ce conține |
| --- | --- |
| `index.html`, `sw.js`, `manifest.webmanifest`, iconițele | Aplicația așa cum o servește GitHub Pages. Se generează automat, nu se editează de mână. |
| `src/` | Sursele: `app.css` și `social.css` (aspect), `logic.js` (regulile de punctaj), `i18n.js` (textele în română și engleză), `api.js` (legătura cu serverul), `app.js` (interfața), `body.html`, `config.json` (adresa serverului). |
| `supabase/schema.sql` | Baza de date: tabele, reguli de acces și funcțiile pe care le cheamă aplicația. |
| `build.py` | Asamblează sursele în fișierele de mai sus. |
| `test/` | Verificări automate: regulile de punctaj, textele, regulile de acces din baza de date și parcursuri complete pe ecran de telefon, cu și fără cont. |

## Cum se face o actualizare

1. Se modifică fișierele din `src/`.
2. `python3 build.py`
3. `TZ=Europe/Bucharest node test/logic.test.js`, `node test/i18n.test.js`, `python3 test/flow.py` și `python3 test/accounts.py`
4. Ce ajunge pe ramura `main` apare în aplicație în câteva minute.

## Versiuni

- 0.2.2: fluxul se actualizează singur cât timp este deschis.
- 0.2.1: textele în română sunt scrise cu diacritice.
- 0.2: conturi cu email și parolă, salvare în cont, activități publice sau private, flux și încurajări.
- 0.1: scor zilnic, favorite, serie, jurnal, română și engleză. Datele rămân pe dispozitiv.
