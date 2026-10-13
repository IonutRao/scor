# Scorul zilei

Aplicatie web motivationala: notezi faptele bune pe plus si pe cele mai putin bune pe minus, vezi scorul zilei, seria de zile pe plus si jurnalul. "Scorul zilei" este un nume de lucru.

Aplicatia ruleaza la https://ionutrao.github.io/scor/ si se poate pune pe ecranul telefonului.

## Ce e in acest repo

| Loc | Ce contine |
| --- | --- |
| `index.html`, `sw.js`, `manifest.webmanifest`, iconitele | Aplicatia asa cum o serveste GitHub Pages. Se genereaza automat, nu se editeaza de mana. |
| `src/` | Sursele: `app.css` (aspect), `logic.js` (regulile de punctaj), `app.js` (interfata si textele in romana si engleza), `body.html`. |
| `build.py` | Asambleaza sursele in fisierele de mai sus. |
| `test/` | Verificari automate: regulile de punctaj si un parcurs complet pe ecran de telefon. |

## Cum se face o actualizare

1. Se modifica fisierele din `src/`.
2. `python3 build.py`
3. `TZ=Europe/Bucharest node test/logic.test.js` si `python3 test/flow.py`
4. Ce ajunge pe ramura `main` apare in aplicatie in cateva minute.

## Versiuni

- 0.1: scor zilnic, favorite, serie, jurnal, romana si engleza. Datele raman pe dispozitiv.
