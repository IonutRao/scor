# Scorul zilei

Aplicație web motivațională: notezi faptele bune pe plus și pe cele mai puțin bune pe minus, vezi scorul zilei, seria de zile pe plus și jurnalul. Cu un cont, datele se păstrează și pe server, iar activitățile pe care alegi să le arăți apar în flux, unde ceilalți te pot încuraja. „Scorul zilei” este un nume de lucru.

Aplicația rulează la https://ionutrao.github.io/scor/ și se poate pune pe ecranul telefonului.

## Ce e în acest repo

| Loc | Ce conține |
| --- | --- |
| `index.html`, `sw.js`, `manifest.webmanifest`, iconițele | Aplicația așa cum o servește GitHub Pages. Se generează automat, nu se editează de mână. |
| `src/` | Sursele: `app.css` și `social.css` (aspect), `logic.js` (regulile de punctaj), `i18n.js` (textele în română și engleză), `api.js` (legătura cu serverul), `photo.js` (micșorarea pozelor și păstrarea lor pe dispozitiv până ajung în cont), `app.js` (interfața), `body.html`, `config.json` (adresa serverului). |
| `supabase/schema.sql` | Baza de date: tabele, reguli de acces, locul pentru poze, țelul comun „Azi pe plus” și funcțiile pe care le cheamă aplicația. Se poate rula din nou oricând și aduce la zi o bază mai veche. |
| `build.py` | Asamblează sursele în fișierele de mai sus. |
| `test/` | Verificări automate: regulile de punctaj, textele, regulile de acces din baza de date și din locul de poze și parcursuri complete pe ecran de telefon, cu și fără cont. |

## Cum se face o actualizare

1. Se modifică fișierele din `src/`.
2. `python3 build.py`
3. `TZ=Europe/Bucharest node test/logic.test.js`, `node test/i18n.test.js`, `python3 test/flow.py`, apoi, pe rând, `python3 test/accounts.py`, `python3 test/photos.py`, `python3 test/pulse.py`, `python3 test/edu.py` și `python3 test/old_server.py`
4. Ce ajunge pe ramura `main` apare în aplicație în câteva minute.

## Versiuni

- 0.7: un punct pe butonul Flux când altcineva a postat ceva ce nu ai văzut încă; dispare când deschizi Flux.
- 0.6.3: un cont nou nu mai pornește cu „Țigară” și „Alcool” printre favorite; în locul lor, „Am amânat ceva” și „M-am enervat”. Cine le avea le păstrează.
- 0.6.2: la o faptă mai puțin bună făcută publică, butonul din flux spune „Mâine mai bine”, nu „Încurajează”.
- 0.6.1: în lista „Pentru cine?”, lângă fiecare nume apar scorul de azi și seria pe plus.
- 0.6: modul educator: cine ține scorul și pentru copii bifează în Profil, adaugă copiii pe nume și alege din colțul oricărui ecran pentru cine notează. Activitățile copiilor rămân private. Cere rularea din nou a scriptului `supabase/schema.sql`.
- 0.5.2: fluxul arată doar activitățile în limba aleasă în aplicație; butonul „Toate limbile” a dispărut.
- 0.5.1: pe cardul „Azi pe plus”, cel care se uită apare drept „tu” după ce spune serverul, nu după numele de pe dispozitiv; numele schimbat pe un dispozitiv ajunge și pe celelalte. Cere rularea din nou a scriptului.
- 0.5: țelul comun „Azi pe plus” în Flux (cine participă vede câți sunt pe plus azi și cine; participarea e la alegere) și un rând cu rezumatul săptămânii în Jurnal. Cere rularea din nou a scriptului `supabase/schema.sql`.
- 0.4.2: camera se deschide chiar în aplicație, nu în aplicația de cameră a telefonului, iar ce scrii într-un formular se păstrează dacă pagina este reîncărcată între timp.
- 0.4.1: pe telefon, poza se poate face și pe loc, cu aparatul foto, nu doar alege din telefon.
- 0.4: o activitate poate avea o poză, micșorată automat înainte de încărcare și văzută doar la apăsare, de cine vede și activitatea. Cere rularea din nou a scriptului `supabase/schema.sql`.
- 0.3: o activitate poate avea detalii, câteva rânduri care se văd doar la apăsare. Cere rularea din nou a scriptului `supabase/schema.sql`.
- 0.2.2: fluxul se actualizează singur cât timp este deschis.
- 0.2.1: textele în română sunt scrise cu diacritice.
- 0.2: conturi cu email și parolă, salvare în cont, activități publice sau private, flux și încurajări.
- 0.1: scor zilnic, favorite, serie, jurnal, română și engleză. Datele rămân pe dispozitiv.
