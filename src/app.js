/* Scorul zilei: interfata.
   Doua moduri: local (fara server, datele raman pe dispozitiv) si cu cont (datele se salveaza si pe server).
   In ambele, ecranele se deseneaza din datele locale; serverul le aduce la zi in fundal. */
(function () {
  'use strict';

  var CFG = window.SCOR_BUILD || {};
  var VERSION = '0.8';
  var KEY = 'scor.v1';
  var BACKEND = API.enabled();
  var MAIN = BACKEND ? ['azi', 'jurnal', 'flux', 'profil'] : ['azi', 'jurnal', 'profil'];
  var ROUTES = MAIN.concat(BACKEND ? ['plus', 'minus', 'detalii', 'nume', 'copil', 'raport'] : ['plus', 'minus', 'detalii', 'copil', 'raport']);
  /* De la ce versiune a scriptului din supabase/schema.sql stie serverul sa pastreze detalii, poze, telul comun, respectiv copiii. */
  var NOTES_FROM = 3, PHOTOS_FROM = 4, PULSE_FROM = 5, EDU_FROM = 6, SHOW_FROM = 7;
  /* Cel mult atatia copii in modul educator. */
  var KIDS_MAX = 30;
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  /* Fluxul: cate activitati vin o data, cate da serverul cel mult intr-un raspuns (vezi feed in supabase/schema.sql)
     si la cat timp se improspateaza singur cat e pe ecran. */
  var FEED_PAGE = 30, FEED_MAX = 50;
  var FEED_EVERY = Math.max(500, Number(CFG.feedEvery) || 15000);
  /* Cardul "Azi pe plus" se improspateaza mai rar decat fluxul. */
  var PULSE_EVERY = Math.max(4000, FEED_EVERY * 4);
  var FLAME = 'M12 2.6c1 4.5 6.25 7 6.25 13.1a6.25 6.25 0 0 1-12.5 0c0-2.4 1-4.2 2.4-5.6.2 1.7 1.1 2.9 2.2 3.4C9.7 9.7 10.6 5.8 12 2.6z';
  var STAR = 'M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8z';

  /* Textele aplicatiei, pe limbi, stau in src/i18n.js (variabila T). */

  /* Sugestiile cu care porneste un utilizator nou: cheie, fel, puncte. Fara obiceiuri care presupun ceva despre om
     (tigara, alcoolul au iesit in 0.6.3); cine le are le adauga singur. Numele lor raman in dictionar pentru listele vechi. */
  var DEFAULT_FAVS = [
    ['gym', 'plus', 10], ['read', 'plus', 10], ['walk', 'plus', 10], ['meditate', 'plus', 5], ['water', 'plus', 5], ['sleep', 'plus', 10],
    ['junk', 'minus', 5], ['phone', 'minus', 5], ['late', 'minus', 5], ['sweets', 'minus', 5], ['delay', 'minus', 5], ['anger', 'minus', 5]
  ];

  var ICON = {
    flame: '<svg class="ic-flame" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke-linejoin="round"><path d="' + FLAME + '"/></svg>',
    flameFlat: '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24"><path d="' + FLAME + '"/></svg>',
    star: '<svg class="ic-star" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke-linejoin="round"><path d="' + STAR + '"/></svg>',
    starFlat: '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="' + STAR + '"/></svg>',
    starLine: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke-linejoin="round"><path d="' + STAR + '"/></svg>',
    close: '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg>',
    x: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    note: '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h9"/></svg>',
    photo: '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3.5 16.5l5-5 4 4 2.5-2.5 5.5 5.5"/><circle cx="15.5" cy="9.5" r="1.2" fill="currentColor"/></svg>',
    chevron: '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'
  };

  var data, lang, route = 'azi';
  /* Starea contului: local (fara server), loading, out (neautentificat), name (fara nume ales), in. */
  var auth = BACKEND ? 'loading' : 'local';
  /* pic: poza aleasa pentru activitatea noua, deja micsorata ({name, blob, w, h}); picBusy: una e in lucru. */
  var add = { type: 'plus', favId: null, name: '', pts: 10, keep: false, pub: false, note: '', noteOpen: false, pic: null, picBusy: false };
  /* Ecranul pe care se scriu sau se schimba detaliile si poza unei activitati deja notate, si ecranul de pe care s-a ajuns acolo.
     photo: numele pozei pe care activitatea o are acum; pic: una noua, aleasa aici; drop: omul a scos poza. */
  var noteForm = { id: null, value: '', back: 'azi', photo: '', pic: null, drop: false, picBusy: false };
  /* Activitatile din flux ale caror detalii sunt deschise acum. */
  var openNotes = {};
  /* Pozele aduse pentru afisare in sesiunea aceasta: cheie -> { state: 'loading' | 'ok' | 'error', url }.
     Cand se aduna mai mult de SHOTS_MAX, cele mai vechi care nu sunt pe ecran se elibereaza. */
  var shots = {}, SHOTS_MAX = 40;
  /* Formularul pentru care omul alege acum o poza din telefon, si butonul de pe care a pornit alegerea. */
  var picFor = null, picFocus = '';
  /* Pe un telefon sau o tableta se ofera si fotografierea pe loc; pe un calculator butonul ar deschide tot alegerea de fisiere. */
  var TOUCH = false;
  try { TOUCH = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0; } catch (e) { TOUCH = false; }
  /* Ce scrie omul intr-un formular se pastreaza pe dispozitiv (DRAFT_KEY), cel mult DRAFT_FOR, ca sa nu se piarda daca pagina
     este reincarcata intre timp: telefoanele ramase fara memorie inchid aplicatia cat timp e deschisa camera sau galeria. */
  var DRAFT_KEY = 'scor.draft', DRAFT_FOR = 12 * 3600000, draftUsed = false, draftBack = false;
  /* Incarcarea pozelor in cont: una pe rand. pumping tine numele celei aflate pe drum ('*' cat se sterg fisiere);
     pumpSeq numara cererile, ca raspunsul uneia date pierduta sa nu mai fie luat in seama; pumpFails numara incercarile
     cazute la rand. closing: contul se sterge chiar acum. */
  var pumping = '', pumpTimer = null, pumpFails = 0, pumpSeq = 0, closing = false;
  /* Cat se asteapta raspunsul unei cereri catre locul de poze inainte ca ea sa fie data pierduta, si cat de proaspata trebuie
     sa fie starea contului ca sa se stearga fisiere din el. */
  var PUMP_PATIENCE = Math.max(1000, Number(CFG.pumpPatience) || 180000), FRESH = 20000;
  /* Ultimul raspuns de eroare al locului de poze, aratat in Profil ca sa se poata afla de ce nu merge o poza;
     pumpOffline: ultima incercare cazuta a fost din lipsa de legatura, nu dintr-un refuz. */
  var photoErr = '', pumpOffline = false;
  var authForm = { mode: 'in', email: '', busy: false, error: '', info: '', detail: '' };
  var nameForm = { value: '', busy: false, error: '' };
  /* Ecranul pe care se adauga un copil (modul educator) si ecranul de pe care s-a ajuns acolo. */
  var kidForm = { value: '', error: '', back: 'profil' };
  /* Raportul lunar al educatorului: luna aratata ('2026-10'). */
  var report = { month: '' };
  /* feedSeq numara cererile de flux: un raspuns se foloseste doar daca nicio alta cerere nu a pornit dupa a lui.
     shownFeed tine minte ce flux este desenat acum, ca improspatarea sa nu redeseneze degeaba. */
  var feedSeq = 0, shownFeed = '';
  /* Cardul "Azi pe plus": o cerere pe drum, numarul ei (un raspuns vechi nu mai conteaza) si cand s-a incercat ultima data. */
  var pulseBusy = false, pulseSeq = 0, pulseTried = 0;
  /* Punctul de pe butonul Flux: cea mai noua activitate a altcuiva stiuta (feedFresh) fata de cea vazuta ultima data
     in Flux (data.feedSeen). Cat timp alt ecran este deschis, aplicatia trage cu ochiul la flux din cand in cand (peek). */
  var feedFresh = 0, peekBusy = false, peekAt = 0;
  var feed = newFeed();
  var openDays = {};
  var appEl, viewEl, navEl, toastEl, dlg;
  var toastTimer = null, dlgOk = null, dlgExtra = null, dlgLink = null, dlgOpener = null, shownDay = '';
  var syncing = false, syncAgain = false, syncTimer = null, syncErr = '', syncFails = 0, inflight = {};
  /* Creste la fiecare iesire din cont si la fiecare intrare in alt cont: un raspuns pornit intr-o sesiune nu mai are ce
     schimba in urmatoarea, nici daca acelasi om a intrat din nou. */
  var session = 0;

  /* ---------- mici ajutoare ---------- */

  function byId(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function tr(k, vars) {
    var s = T[lang][k];
    if (s == null) s = T.ro[k];
    if (vars) for (var v in vars) s = s.replace('{' + v + '}', vars[v]);
    return s;
  }

  /* "1 zi", "6 zile", "20 de zile" in romana; "1 day", "6 days" in engleza. */
  function count(n, forms) {
    if (lang === 'ro') {
      if (n === 1) return '1 ' + forms[0];
      var r = n % 100;
      return n + ((n === 0 || (r >= 1 && r <= 19)) ? ' ' : ' de ') + forms[1];
    }
    return n + ' ' + (n === 1 ? forms[0] : forms[1]);
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function timeOf(ts) { var d = new Date(ts); return L.pad(d.getHours()) + ':' + L.pad(d.getMinutes()); }
  function longDate(d) { return tr('days')[d.getDay()] + ', ' + d.getDate() + ' ' + tr('months')[d.getMonth()]; }

  /* Acelasi nume, oricum ar fi scris: "sala" si "Sală" sunt aceeasi activitate. */
  function fold(s) {
    s = String(s).trim().toLowerCase();
    return s.normalize ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : s;
  }

  function dayTitle(k, today) {
    var d = L.parseDay(k);
    var year = d.getFullYear() !== L.parseDay(today).getFullYear() ? ' ' + d.getFullYear() : '';
    return (k === today ? tr('today') : cap(tr('days')[d.getDay()])) + ', ' + d.getDate() + ' ' + tr('months')[d.getMonth()] + year;
  }

  /* "acum 20 de minute", "ieri", "9 octombrie". */
  function ago(ts) {
    var s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 60) return tr('now');
    var m = Math.floor(s / 60);
    if (m < 60) return tr('ago', { x: count(m, tr('minute')) });
    var h = Math.floor(m / 60);
    if (h < 24) return tr('ago', { x: count(h, tr('hour')) });
    var d = Math.floor(h / 24);
    if (d === 1) return tr('yesterday');
    if (d < 7) return tr('ago', { x: count(d, tr('day')) });
    var dt = new Date(ts);
    return dt.getDate() + ' ' + tr('months')[dt.getMonth()];
  }

  function favName(f) { return f.key ? (tr('fav')[f.key] || f.key) : f.name; }
  function nameOf(e) { return e.key ? (tr('fav')[e.key] || e.key) : e.name; }
  function tone(n) { return n > 0 ? 'pos' : n < 0 ? 'neg' : ''; }
  function kind(n) { return n > 0 ? 'plus' : n < 0 ? 'minus' : ''; }
  function isAddRoute(r) { return r === 'plus' || r === 'minus'; }
  function newFeed() {
    feedSeq++;
    return { items: [], loading: false, quiet: false, started: 0, ready: false, error: '', done: true, at: 0, tried: 0, fails: 0 };
  }

  function uuid() {
    var b = new Uint8Array(16), h = [], i;
    window.crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    for (i = 0; i < 16; i++) h.push((b[i] + 0x100).toString(16).slice(1));
    return h.slice(0, 4).join('') + '-' + h.slice(4, 6).join('') + '-' + h.slice(6, 8).join('') + '-' +
      h.slice(8, 10).join('') + '-' + h.slice(10).join('');
  }

  /* ---------- date locale ---------- */

  function load() {
    try { var raw = window.localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }

  function persist() {
    try { window.localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* aplicatia merge si fara salvare */ }
  }

  function defaultFavs() {
    return DEFAULT_FAVS.map(function (f) { return { id: 'd-' + f[0], key: f[0], type: f[1], pts: f[2] }; });
  }

  function fresh() {
    return {
      v: 2, lang: null, demo: false, uid: null, name: '', email: '', entries: [], favs: defaultFavs(),
      favsRev: 0, favsSynced: 0, outbox: { del: [], vis: [], note: [], photo: [], gone: [] }, uploads: [],
      lastSync: 0, pubDefault: false, sv: 0, pulse: null, feedSeen: 0,
      /* Modul educator: pornit sau nu, lista copiilor (id, nume) si, doar pe acest dispozitiv, cine este ales acum (who). */
      edu: { on: false, list: [] }, eduRev: 0, eduSynced: 0, who: null, whoSort: 'added',
      /* Scorul zilei la vedere in flux, la alegerea omului; showRev/showSynced ca la favorite. */
      show: false, showRev: 0, showSynced: 0
    };
  }

  function usable(d) { return !!d && (d.v === 1 || d.v === 2) && Array.isArray(d.entries) && Array.isArray(d.favs); }

  function okItem(x) {
    return !!x && (x.type === 'plus' || x.type === 'minus') && x.pts >= 1 && x.pts <= 20 &&
      (typeof x.key === 'string' || typeof x.name === 'string');
  }

  function cleanFavs(list) {
    return (Array.isArray(list) ? list : []).filter(function (f) { return okItem(f) && typeof f.id === 'string'; }).map(function (f) {
      var o = { id: f.id, type: f.type, pts: f.pts };
      if (typeof f.key === 'string') o.key = f.key; else o.name = String(f.name).slice(0, 40);
      return o;
    });
  }

  /* Aduce datele salvate de o versiune mai veche la forma de acum, fara sa piarda nimic. */
  function upgrade(d) {
    d.v = 2;
    d.uid = typeof d.uid === 'string' ? d.uid : null;
    d.name = typeof d.name === 'string' ? d.name : '';
    d.email = typeof d.email === 'string' ? d.email : '';
    d.favsRev = d.favsRev || 0;
    d.favsSynced = d.favsSynced || 0;
    d.outbox = d.outbox && Array.isArray(d.outbox.del) && Array.isArray(d.outbox.vis) ? d.outbox : { del: [], vis: [] };
    if (!Array.isArray(d.outbox.note)) d.outbox.note = [];
    var okName = function (n) { return typeof n === 'string' && PHOTO.NAME.test(n); };
    d.outbox.photo = (Array.isArray(d.outbox.photo) ? d.outbox.photo : []).filter(function (op) {
      return !!op && typeof op.id === 'string' && (op.photo === null || okName(op.photo));
    });
    d.outbox.gone = (Array.isArray(d.outbox.gone) ? d.outbox.gone : []).filter(okName);
    d.uploads = (Array.isArray(d.uploads) ? d.uploads : []).filter(okName);
    d.sv = d.sv > 0 ? d.sv : 0;
    d.lastSync = d.lastSync || 0;
    d.feedSeen = Number(d.feedSeen) || 0;
    d.whoSort = d.whoSort === 'score' ? 'score' : 'added';
    /* Ultimul raspuns al cardului "Azi pe plus", ca sa fie aratat pe loc la deschiderea fluxului. */
    var pz = d.pulse, names = function (list) { return Array.isArray(list) ? list.filter(function (n) { return typeof n === 'string'; }).slice(0, 100) : null; };
    d.pulse = pz && typeof pz === 'object' && typeof pz.day === 'string' && Array.isArray(pz.up)
      ? { day: pz.day, on: !!pz.on, total: pz.total > 0 ? pz.total : 0, up: names(pz.up), others: names(pz.others), you: typeof pz.you === 'boolean' ? pz.you : null, at: pz.at > 0 ? pz.at : 0 }
      : null;
    d.pubDefault = !!d.pubDefault;
    d.entries = d.entries.filter(function (e) { return okItem(e) && /^\d{4}-\d{2}-\d{2}$/.test(e.day) && typeof e.id === 'string'; });
    d.entries.forEach(function (e) {
      if (!UUID.test(e.id)) { e.id = uuid(); e.sync = 1; }
      if (e.sync !== 0) e.sync = 1;
      e.pub = !!e.pub;
      e.cheers = e.cheers > 0 ? e.cheers : 0;
      var note = typeof e.note === 'string' ? L.cleanNote(e.note) : '';
      if (note) e.note = note; else delete e.note;
      if (typeof e.photo !== 'string' || !PHOTO.NAME.test(e.photo)) delete e.photo;
    });
    d.favs = cleanFavs(d.favs);
    d.edu = cleanEdu(d.edu);
    d.eduRev = d.eduRev || 0;
    d.show = !!d.show;
    d.showRev = d.showRev || 0;
    d.showSynced = d.showSynced || 0;
    d.eduSynced = d.eduSynced || 0;
    d.who = typeof d.who === 'string' && findKid(d.who, d.edu) ? d.who : null;
    d.entries.forEach(function (e) {
      if (typeof e.kid !== 'string' || !UUID.test(e.kid)) delete e.kid;
      else e.pub = false;
    });
    return d;
  }

  /* Lista copiilor, curatata: id-uri de forma asteptata si nume scurte. */
  function cleanEdu(edu) {
    var out = { on: !!(edu && edu.on), list: [] }, seen = {};
    (edu && Array.isArray(edu.list) ? edu.list : []).forEach(function (k) {
      if (!k || typeof k.id !== 'string' || !UUID.test(k.id) || typeof k.name !== 'string' || seen[k.id]) return;
      var name = k.name.replace(/\s+/g, ' ').trim().slice(0, 20);
      if (!name || out.list.length >= KIDS_MAX) return;
      seen[k.id] = true;
      out.list.push({ id: k.id, name: name });
    });
    return out;
  }

  function findKid(id, edu) {
    var list = (edu || data.edu).list;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* O saptamana de exemple, doar pentru previzualizare. */
  function seedDemo(d) {
    var now = new Date(), today = L.dayKey(now), start = L.parseDay(today).getTime();
    var plan = [
      [['gym', 'plus', 10], ['read', 'plus', 10], ['walk', 'plus', 10], ['anger', 'minus', 5], ['meditate', 'plus', 5]],
      [['gym', 'plus', 10], ['read', 'plus', 10], ['meditate', 'plus', 5]],
      [['gym', 'plus', 10], ['walk', 'plus', 10], ['sleep', 'plus', 10], ['water', 'plus', 5], ['sweets', 'minus', 5]],
      [['read', 'plus', 10], ['walk', 'plus', 10], ['late', 'minus', 5]],
      [['gym', 'plus', 10], ['read', 'plus', 10], ['sleep', 'plus', 10]],
      [['walk', 'plus', 10], ['meditate', 'plus', 5], ['water', 'plus', 5]],
      [['water', 'plus', 5], ['delay', 'minus', 5]]
    ];
    plan.forEach(function (list, daysAgo) {
      var day = L.addDays(today, -daysAgo), base = L.parseDay(day).getTime();
      list.forEach(function (a, i) {
        /* Azi: ore intre 7 dimineata si acum, ca exemplele sa nu apara in viitor sau in toiul noptii. */
        var from = now.getTime() - (start + 7 * 3600000) > 1800000 ? start + 7 * 3600000 : start;
        var ts = daysAgo === 0
          ? from + Math.round((i + 1) * (now.getTime() - from) / (list.length + 1))
          : base + (8 + i * 3) * 3600000;
        d.entries.push({ id: uuid(), ts: ts, day: day, type: a[1], pts: a[2], key: a[0], pub: false, cheers: 0, sync: 1 });
      });
    });
    d.demo = true;
  }

  function initData() {
    var d = load();
    if (usable(d)) { data = upgrade(d); return; }
    data = fresh();
    if (CFG.demo && !BACKEND) seedDemo(data);
  }

  function pickLang() {
    if (data.lang === 'ro' || data.lang === 'en') return data.lang;
    if (CFG.lang === 'ro' || CFG.lang === 'en') return CFG.lang;
    var n = '';
    try { n = (navigator.language || '').toLowerCase(); } catch (e) { /* ramane engleza */ }
    return n.indexOf('ro') === 0 ? 'ro' : 'en';
  }

  function findFav(id) { for (var i = 0; i < data.favs.length; i++) if (data.favs[i].id === id) return data.favs[i]; return null; }
  function findEntry(id) { for (var i = 0; i < data.entries.length; i++) if (data.entries[i].id === id) return data.entries[i]; return null; }
  function myCheers() { return data.entries.reduce(function (s, e) { return s + (e.kid ? 0 : e.cheers || 0); }, 0); }
  /* Detaliile se pot scrie pe dispozitiv oricand; cu cont, doar daca baza de date a fost adusa la versiunea care le pastreaza. */
  function notesOn() { return !BACKEND || data.sv >= NOTES_FROM; }
  /* Pozele stau in cont, deci exista doar cu cont si cu baza de date adusa la versiunea care le cunoaste. */
  function photosOn() { return BACKEND && data.sv >= PHOTOS_FROM; }
  /* Telul comun "Azi pe plus" cere si el baza de date adusa la versiunea care il cunoaste. */
  function pulseOn() { return BACKEND && data.sv >= PULSE_FROM; }
  /* Modul educator se poate porni fara cont oricand; cu cont, doar daca baza de date stie de copii. */
  function eduAvail() { return !BACKEND || data.sv >= EDU_FROM; }
  function eduOn() { return eduAvail() && data.edu.on; }
  /* Scorul la vedere cere baza de date adusa la versiunea care il stie. */
  function showOn() { return BACKEND && data.sv >= SHOW_FROM; }
  /* Copilul ales acum, sau null pentru adult. O alegere ramasa fara copil (sters, mod oprit) inseamna adultul. */
  function whoNow() { return eduOn() && data.who && findKid(data.who) ? data.who : null; }
  function whoName() { var k = whoNow() ? findKid(whoNow()) : null; return k ? k.name : tr('me'); }
  /* Activitatile celui ales: ale adultului, sau ale copilului ales. */
  function scope() {
    var who = whoNow();
    return data.entries.filter(function (e) { return (e.kid || null) === who; });
  }
  function isKidEntry(e) { return !!e.kid; }

  /* ---------- salvarea in cont ---------- */

  function pendingCount() {
    var n = data.outbox.del.length + data.outbox.vis.length + data.outbox.note.length + data.outbox.photo.length +
      (data.favsRev !== data.favsSynced ? 1 : 0) +
      (data.eduRev !== data.eduSynced && data.sv >= EDU_FROM ? 1 : 0) +
      (data.showRev !== data.showSynced && data.sv >= SHOW_FROM ? 1 : 0);
    for (var i = 0; i < data.entries.length; i++) if (data.entries[i].sync === 1) n++;
    return n;
  }

  /* Schimbarile de poze care pot pleca acum spre cont: fisierul a ajuns deja acolo, iar activitatea este cunoscuta de cont
     sau pleaca in acelasi drum (ids). Fara ids: cele care pot pleca acum sau odata cu activitatea lor. */
  function photoOps(ids) {
    return data.outbox.photo.filter(function (op) {
      var e = findEntry(op.id);
      if (!e || (op.photo && data.uploads.indexOf(op.photo) >= 0)) return false;
      return e.sync !== 1 || !ids || !!ids[e.id];
    });
  }

  /* Mai este ceva care poate pleca chiar acum? O poza al carei fisier inca nu a ajuns in cont asteapta incarcarea,
     nu un drum nou pana la server. */
  function canSend() {
    if (data.outbox.del.length || data.outbox.vis.length || data.outbox.note.length || data.favsRev !== data.favsSynced) return true;
    if (data.eduRev !== data.eduSynced && data.sv >= EDU_FROM) return true;
    if (data.showRev !== data.showSynced && data.sv >= SHOW_FROM) return true;
    for (var i = 0; i < data.entries.length; i++) if (data.entries[i].sync === 1 && canTravel(data.entries[i])) return true;
    return photoOps(null).length > 0;
  }

  function queueSync(delay) {
    if (!BACKEND || auth !== 'in') return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(sync, delay == null ? 700 : delay);
  }

  /* Un singur drum pana la server: trimite ce s-a schimbat aici si primeste inapoi starea contului. */
  function sync() {
    if (!BACKEND || auth !== 'in') return;
    if (syncing) { syncAgain = true; return; }
    clearTimeout(syncTimer);
    /* Un raspuns care soseste dupa iesirea din cont, sau dupa intrarea in altul, nu mai are ce schimba aici. */
    var uid = data.uid, mine = session;
    function late() { return mine !== session || data.uid !== uid; }
    var batch = data.entries.filter(function (e) { return e.sync === 1 && canTravel(e); }).slice(0, 300);
    var sent = {
      ids: {}, del: data.outbox.del.slice(), vis: data.outbox.vis.slice(), note: data.outbox.note.slice(), photo: [],
      rev: data.favsRev, favs: data.favsRev !== data.favsSynced,
      eduRev: data.eduRev, edu: data.eduRev !== data.eduSynced && data.sv >= EDU_FROM,
      showRev: data.showRev, show: data.showRev !== data.showSynced && data.sv >= SHOW_FROM
    };
    batch.forEach(function (e) { sent.ids[e.id] = true; });
    /* Contul afla de o poza abia dupa ce fisierul ei a ajuns acolo, si doar pentru o activitate pe care o are sau o primeste acum. */
    sent.photo = photoOps(sent.ids);
    inflight = sent.ids;
    syncing = true;
    var args = {
      p_add: batch.map(function (e) {
        var o = { id: e.id, day: e.day, ts: e.ts, type: e.type, pts: e.pts, pub: !!e.pub };
        if (e.key) o.key = e.key; else o.name = e.name;
        if (e.note) o.note = e.note;
        if (e.kid) o.kid = e.kid;
        return o;
      }),
      p_del: sent.del,
      p_vis: sent.vis,
      p_favs: sent.favs ? data.favs : null,
      p_lang: lang
    };
    /* Un server ramas la o versiune mai veche nu cunoaste p_note; fara schimbari de detalii nu i se trimite. */
    if (sent.note.length) args.p_note = sent.note;
    if (sent.photo.length) args.p_photo = sent.photo;
    if (sent.edu) args.p_kids = data.edu;
    if (sent.show) args.p_show = !!data.show;
    API.rpc('sync', args).then(function (res) {
      if (late()) return;
      applySync(res, sent);
      syncErr = '';
      syncFails = 0;
      /* Ce tocmai a plecat poate schimba fluxul: se reincarca acum sau la urmatoarea deschidere. */
      if (batch.length || sent.del.length || sent.vis.length || sent.note.length || sent.photo.length) {
        feed.at = 0;
        if (data.pulse && (batch.length || sent.del.length)) data.pulse.at = 0;
        if (route === 'flux') openFeed();
      }
      /* Contul e la zi: pot pleca pozele care asteapta si se pot sterge cele ramase fara activitate.
         Daca incarcarile tocmai au cazut, urmatoarea incercare vine la timpul ei, nu acum. */
      if (!pumpFails || !data.uploads.length) queuePump(0);
    }).then(null, function (err) {
      /* Aici ajunge si un raspuns pe care aplicatia nu l-a putut folosi, nu doar o cerere cazuta. */
      if (!late()) syncFailed(err);
    }).then(function () {
      syncing = false;
      inflight = {};
      if (late()) {
        syncAgain = false;
        if (auth === 'in') queueSync(0);
        return;
      }
      if (auth === 'in') {
        if (route === 'flux') showFeed(); else if (!typing()) render(); else offerMore();
        if (syncErr) queueSync(Math.min(300000, 15000 * Math.pow(2, Math.min(syncFails, 5))));
        else if (syncAgain || canSend()) queueSync(300);
      } else {
        render();
      }
      syncAgain = false;
    });
  }

  /* O activitate a unui copil pleaca spre cont doar daca baza de date stie de copii; altfel ar ajunge pe numele adultului. */
  function canTravel(e) { return !e.kid || data.sv >= EDU_FROM; }

  function applySync(res, sent) {
    if (!res || !Array.isArray(res.entries)) throw new Error('bad_response');
    data.outbox.del = data.outbox.del.filter(function (id) { return sent.del.indexOf(id) < 0; });
    data.outbox.vis = data.outbox.vis.filter(function (op) { return sent.vis.indexOf(op) < 0; });
    data.outbox.note = data.outbox.note.filter(function (op) { return sent.note.indexOf(op) < 0; });
    data.outbox.photo = data.outbox.photo.filter(function (op) { return sent.photo.indexOf(op) < 0; });

    var stillDeleting = {}, onServer = {}, next = [], had = {};
    data.outbox.del.forEach(function (id) { stillDeleting[id] = true; });
    data.entries.forEach(function (e) { if (e.photo) had[e.photo] = true; });
    res.entries.forEach(function (s) {
      onServer[s.id] = true;
      if (stillDeleting[s.id]) return;
      var e = { id: s.id, ts: Number(s.ts), day: s.day, type: s.type, pts: s.pts, pub: !!s.pub, cheers: s.cheers || 0, sync: 0 };
      if (s.key) e.key = s.key; else e.name = s.name;
      if (typeof s.note === 'string' && s.note) e.note = s.note;
      if (typeof s.photo === 'string' && PHOTO.NAME.test(s.photo)) e.photo = s.photo;
      if (typeof s.kid === 'string' && UUID.test(s.kid)) { e.kid = s.kid; e.pub = false; }
      if (okItem(e)) next.push(e);
    });
    /* Ce s-a schimbat aici cat timp cererea era pe drum ramane valabil. */
    data.outbox.vis.forEach(function (op) {
      for (var i = 0; i < next.length; i++) if (next[i].id === op.id) next[i].pub = op.pub;
    });
    data.outbox.note.forEach(function (op) {
      for (var i = 0; i < next.length; i++) {
        if (next[i].id !== op.id) continue;
        if (op.note) next[i].note = op.note; else delete next[i].note;
      }
    });
    /* La fel pentru poze, inclusiv cele care inca asteapta sa li se incarce fisierul. */
    data.outbox.photo.forEach(function (op) {
      for (var i = 0; i < next.length; i++) {
        if (next[i].id !== op.id) continue;
        if (op.photo) next[i].photo = op.photo; else delete next[i].photo;
      }
    });
    data.entries.forEach(function (e) {
      if (e.sync === 1 && !onServer[e.id] && !sent.ids[e.id]) next.push(e);
    });
    data.entries = next;
    /* O schimbare de poza pentru o activitate care nu mai exista nu mai are unde ajunge. */
    data.outbox.photo = data.outbox.photo.filter(function (op) { return !!findEntry(op.id); });

    if (sent.favs) data.favsSynced = sent.rev;
    if (data.favsRev === data.favsSynced) {
      if (Array.isArray(res.favs)) data.favs = cleanFavs(res.favs);
      else data.favsRev++; /* contul nu are inca favoritele: pleaca la drumul urmator */
    }
    /* Copiii, la fel ca favoritele; un server care nu stie de ei nu ii atinge. */
    if (sent.edu) data.eduSynced = sent.eduRev;
    if (data.eduRev === data.eduSynced && Number(res.v) >= EDU_FROM) {
      if (res.kids && typeof res.kids === 'object') data.edu = cleanEdu(res.kids);
      else if (data.edu.on || data.edu.list.length) data.eduRev++; /* contul nu stie inca de copiii de aici: pleaca la drumul urmator */
    }
    /* Scorul la vedere, la fel. */
    if (sent.show) data.showSynced = sent.showRev;
    if (data.showRev === data.showSynced && Number(res.v) >= SHOW_FROM && typeof res.show === 'boolean') data.show = res.show;
    data.sv = Number(res.v) > 0 ? Number(res.v) : 0;
    /* Numele afisat, schimbat poate de pe alt dispozitiv. */
    if (typeof res.name === 'string' && res.name && res.name !== data.name) data.name = res.name;
    /* Pozele stiute aici pe care contul nu le mai are la nicio activitate (scoase ori inlocuite de pe alt dispozitiv, sau
       ramase de la o activitate stearsa acolo) nu mai au de ce sa ocupe loc. Se bazeaza pe faptul ca raspunsul aduce
       tot jurnalul; daca sync va aduce candva doar ce s-a schimbat, regula aceasta trebuie regandita. */
    if (photosOn()) Object.keys(had).forEach(function (name) { if (!photoUsed(name)) releaseFile(name); });
    data.lastSync = Date.now();
    persist();
  }

  /* ---------- pozele: drumul fisierelor pana in cont ---------- */

  /* Tine minte de ce a refuzat locul de poze o cerere. O legatura cazuta nu este un refuz. */
  function notePhotoErr(err) {
    if (!err || err.offline) return;
    var txt = String(err.message || '').slice(0, 160);
    if (err.status && txt.indexOf(String(err.status)) < 0) txt = err.status + ' ' + txt;
    if (txt) photoErr = txt;
  }

  function queuePump(delay) {
    if (!BACKEND || auth !== 'in') return;
    clearTimeout(pumpTimer);
    pumpTimer = setTimeout(pump, delay == null ? 200 : delay);
  }

  function photoUsed(name) {
    for (var i = 0; i < data.entries.length; i++) if (data.entries[i].photo === name) return true;
    return false;
  }

  /* O poza care nu mai e a niciunei activitati: daca nu a apucat sa plece spre cont se arunca de pe dispozitiv, si in
     orice caz va fi stearsa si din cont dupa ce acesta afla de schimbare (putea sa ajunga acolo fara ca raspunsul sa fi
     sosit; stergerea unui fisier care nu exista nu e o eroare). */
  function releaseFile(name) {
    var i = data.uploads.indexOf(name);
    if (i >= 0 && pumping !== name) {
      data.uploads.splice(i, 1);
      PHOTO.del(name, true);
    }
    if (data.outbox.gone.indexOf(name) < 0) data.outbox.gone.push(name);
  }

  /* Poza nu mai poate ajunge in cont (s-a pierdut de pe dispozitiv sau serverul nu o primeste): activitatea ramane fara ea.
     Contul poate avea inca la activitate poza dinainte, pe care aplicatia urmeaza sa o stearga din locul de poze; de aceea
     afla si el ca activitatea nu mai are niciuna, altfel ar ramane cu trimitere la un fisier care nu mai exista. */
  function dropPhoto(name) {
    data.uploads = data.uploads.filter(function (n) { return n !== name; });
    data.outbox.photo = data.outbox.photo.filter(function (op) { return op.photo !== name; });
    data.entries.forEach(function (e) {
      if (e.photo !== name) return;
      delete e.photo;
      data.outbox.photo = data.outbox.photo.filter(function (op) { return op.id !== e.id; });
      data.outbox.photo.push({ id: e.id, photo: null });
    });
    PHOTO.del(name, true);
    persist();
  }

  /* Trimite in cont, una cate una, pozele care asteapta. Cand nu mai are ce trimite si contul e la zi,
     sterge de acolo fisierele care nu mai sunt ale nimanui. */
  function pump() {
    if (!BACKEND || auth !== 'in' || pumping || closing) return;
    clearTimeout(pumpTimer);
    var uid = data.uid, mine = session, my = ++pumpSeq, name = data.uploads[0], guard = null;
    /* Raspunsul nu mai are ce schimba aici: cererea a fost data pierduta intre timp, omul a iesit din cont sau a intrat in altul. */
    function late() { return my !== pumpSeq || mine !== session || auth !== 'in' || data.uid !== uid; }
    function again() { queuePump(Math.min(300000, 4000 * Math.pow(2, Math.min(pumpFails, 6)))); }
    /* O cerere porneste: tine locul ocupat. Daca nu primeste niciun raspuns in PUMP_PATIENCE, se considera cazuta si se reincearca. */
    function begin(what) {
      pumping = what;
      guard = setTimeout(function () {
        if (my !== pumpSeq) return;
        pumpSeq++;
        pumping = '';
        if (mine !== session || auth !== 'in' || data.uid !== uid) return;
        pumpFails++;
        pumpOffline = true;
        if (!typing() && route !== 'flux') render();
        again();
      }, PUMP_PATIENCE);
    }
    /* Cererea s-a incheiat: elibereaza locul, daca mai este al ei. Intoarce false cand raspunsul nu mai are ce schimba. */
    function settle() {
      if (my === pumpSeq) { clearTimeout(guard); pumping = ''; }
      return !late();
    }
    if (name) {
      begin(name);
      PHOTO.get(name).then(function (blob) {
        if (!blob) return 'lost';
        return API.photoUpload(uid + '/' + name, blob);
      }).then(function (r) {
        if (!settle()) return;
        pumpFails = 0;
        if (r !== 'lost') photoErr = '';
        if (r === 'lost') {
          dropPhoto(name);
          toast(tr('photoLost'));
        } else {
          data.uploads = data.uploads.filter(function (n) { return n !== name; });
          PHOTO.del(name);
          if (!photoUsed(name) && data.outbox.gone.indexOf(name) < 0) data.outbox.gone.push(name);
          persist();
        }
        if (!typing() && route !== 'flux') render();
        queueSync(0);
        queuePump(0);
      }, function (err) {
        if (!settle()) return;
        var st = err.offline ? 0 : Number(err.status) || 0;
        pumpOffline = st === 0;
        notePhotoErr(err);
        /* Prea mare, sau alt fel de fisier decat cel primit: raspunsul nu se schimba la a doua incercare, deci se renunta la poza.
           Orice alt raspuns (o legatura cazuta, un server care nu raspunde, un refuz care poate tine de o stare trecatoare a
           contului sau de o baza de date nepregatita) se reincearca oricat, cu motivul aratat in Profil. */
        if (st === 413 || st === 415) {
          /* Poza care bloca randul a iesit din el: ce urmeaza porneste de la zero, fara pauzele adunate de ea. */
          pumpFails = 0;
          dropPhoto(name);
          if (!typing() && route !== 'flux') render();
          toast(tr('photoRejected'));
          queueSync(0);
          queuePump(0);
          return;
        }
        pumpFails++;
        if (!typing() && route !== 'flux') render();
        again();
      });
      return;
    }
    /* O poza pe care o activitate o foloseste nu se sterge, orice ar scrie pe lista de curatenie. Hotararea se ia doar
       cu o stare proaspata a contului: daca ultimul drum e vechi, intai se face unul nou, care porneste din nou de aici. */
    var gone = data.outbox.gone.filter(function (n) { return !photoUsed(n); });
    if (gone.length !== data.outbox.gone.length) { data.outbox.gone = gone.slice(); persist(); }
    if (!gone.length || syncing || pendingCount() > 0) return;
    if (Date.now() - data.lastSync > FRESH) { queueSync(0); return; }
    begin('*');
    API.photoRemove(gone.map(function (n) { return uid + '/' + n; })).then(function () {
      if (!settle()) return;
      pumpFails = 0;
      data.outbox.gone = data.outbox.gone.filter(function (n) { return gone.indexOf(n) < 0; });
      persist();
      /* Ce s-a adunat intre timp porneste acum. */
      if (data.uploads.length || data.outbox.gone.length) queuePump(0);
    }, function (err) {
      if (!settle()) return;
      pumpFails++;
      pumpOffline = !err || !!err.offline || !err.status;
      notePhotoErr(err);
      again();
    });
  }

  function syncFailed(err) {
    err = err || {};
    syncFails++;
    syncErr = err.offline ? 'offline' : (err.message || 'error');
    if (err.message === 'no_profile') {
      data.name = '';
      persist();
      auth = 'name';
      nameForm = { value: '', busy: false, error: '' };
      return;
    }
    if (err.message === 'not_signed_in' || err.status === 401) {
      API.current().then(function (u) { if (!u && auth === 'in') { auth = 'out'; render(); } }, function () { /* fara internet */ });
    }
  }

  /* ---------- cont ---------- */

  function boot() {
    if (data.uid && data.name) auth = 'in'; /* pornire rapida din datele pastrate; sesiunea se verifica in fundal */
    render();
    API.onAuth(function (event) {
      if (event === 'SIGNED_OUT' && (auth === 'in' || auth === 'name')) { auth = 'out'; render(); }
    });
    API.current().then(afterSession, function (err) {
      if (auth === 'in') { queueSync(0); return; }
      auth = 'out';
      authForm.error = err.offline ? 'errOffline' : 'errLib';
      authForm.detail = err.offline ? '' : err.message;
      render();
    });
  }

  /* Intra in aplicatie cu un cont complet: deseneaza, aduce datele din cont si, daca e cazul, fluxul. */
  function signedIn() {
    auth = 'in';
    authForm.busy = false;
    render();
    focusTitle();
    queueSync(0);
    queuePump(600);
    /* Pe dispozitiv raman doar pozele care inca asteapta sa plece spre cont si cele dintr-un formular inca nesalvat. */
    PHOTO.keep(data.uploads.concat(draftPics()));
    if (route === 'flux') openFeed();
  }

  function afterSession(u) {
    if (!u) {
      if (auth !== 'out') { auth = 'out'; render(); }
      return;
    }
    if (data.uid && data.uid !== u.id) {
      var keep = data.lang;
      data = fresh();
      data.lang = keep;
      session++;
      openDays = {};
      feed = newFeed();
      feedFresh = 0;
      peekAt = 0;
      forgetShots();
      PHOTO.clear();
    }
    data.uid = u.id;
    data.email = u.email;
    persist();
    if (data.name) {
      signedIn();
      return;
    }
    API.rpc('me').then(function (p) {
      if (p && p.name) {
        data.name = p.name;
        persist();
        signedIn();
      } else {
        auth = 'name';
        nameForm = { value: '', busy: false, error: '' };
        render();
      }
    }, function (err) {
      auth = 'out';
      authForm.busy = false;
      authForm.error = err.offline ? 'errOffline' : 'errGeneric';
      authForm.detail = err.offline ? '' : err.message;
      render();
    });
  }

  function authErrKey(err) {
    if (err.offline) return 'errOffline';
    var c = err.code, m = err.message || '';
    if (c === 'invalid_credentials' || /invalid login credentials/i.test(m)) return 'errCreds';
    if (c === 'user_already_exists' || c === 'email_exists' || /already registered/i.test(m)) return 'errExists';
    if (c === 'weak_password' || /password should/i.test(m)) return 'errWeak';
    if (c === 'email_not_confirmed' || /not confirmed/i.test(m)) return 'errConfirm';
    if (c === 'email_address_invalid' || c === 'validation_failed' || /invalid.*email|email.*invalid/i.test(m)) return 'errEmail';
    if (c === 'signup_disabled' || /signups? (are )?not allowed|signup is disabled/i.test(m)) return 'errSignupOff';
    if (err.status === 429 || /rate limit/i.test(m)) return 'errRate';
    if (m === 'client_missing' || m === 'backend_off') return 'errLib';
    return 'errGeneric';
  }

  /* Arata starea formularului de cont fara sa il redeseneze, ca sa nu se piarda ce a scris omul. */
  function showAuthState() {
    var err = byId('auth-err'), info = byId('auth-info'), det = byId('auth-detail'), btn = byId('auth-btn');
    if (!btn) { render(); return; }
    err.textContent = authForm.error ? tr(authForm.error) : '';
    err.hidden = !authForm.error;
    info.textContent = authForm.info ? tr(authForm.info) : '';
    info.hidden = !authForm.info;
    det.textContent = authForm.detail || '';
    det.hidden = !authForm.detail;
    btn.disabled = authForm.busy;
    btn.textContent = authForm.busy ? tr('wait') : tr(authForm.mode === 'up' ? 'createAccount' : 'signIn');
  }

  function submitAuth() {
    if (authForm.busy) return;
    var emailEl = byId('auth-email'), passEl = byId('auth-pass');
    var email = (emailEl.value || '').trim(), pass = passEl.value || '';
    authForm.email = email;
    authForm.info = '';
    authForm.detail = '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { authForm.error = 'errEmail'; showAuthState(); emailEl.focus(); return; }
    if (pass.length < 8) { authForm.error = 'errPass'; showAuthState(); passEl.focus(); return; }
    authForm.error = '';
    authForm.busy = true;
    showAuthState();
    (authForm.mode === 'up' ? API.signUp(email, pass) : API.signIn(email, pass)).then(function (r) {
      authForm.busy = false;
      if (r.pending || !r.user) {
        authForm.mode = 'in';
        authForm.info = 'confirmSent';
        render();
        return;
      }
      afterSession(r.user);
    }, function (err) {
      authForm.busy = false;
      authForm.error = authErrKey(err);
      authForm.detail = authForm.error === 'errGeneric' || authForm.error === 'errLib' ? err.message : '';
      showAuthState();
    });
  }

  function showNameState() {
    var err = byId('pname-err'), btn = byId('name-btn');
    if (!btn) { render(); return; }
    err.textContent = nameForm.error ? tr(nameForm.error) : '';
    err.hidden = !nameForm.error;
    btn.disabled = nameForm.busy;
    btn.textContent = nameForm.busy ? tr('wait') : tr(auth === 'name' ? 'next' : 'saveName');
  }

  function submitName() {
    if (nameForm.busy) return;
    var el = byId('name-input');
    var v = (el.value || '').replace(/\s+/g, ' ').trim();
    nameForm.value = v;
    if (v.length < 3 || v.length > 20 || /[<>]/.test(v)) { nameForm.error = 'nameInvalid'; showNameState(); el.focus(); return; }
    nameForm.error = '';
    nameForm.busy = true;
    showNameState();
    API.rpc('set_name', { p_name: v }).then(function (p) {
      nameForm.busy = false;
      data.name = (p && p.name) || v;
      persist();
      if (auth === 'name') {
        route = 'azi';
        signedIn();
      } else {
        navigate('profil', true);
        toast(tr('nameSaved'));
      }
    }, function (err) {
      nameForm.busy = false;
      nameForm.error = err.offline ? 'errOffline' : err.message === 'name_taken' ? 'nameTaken' : err.message === 'name_invalid' ? 'nameInvalid' : 'errGeneric';
      showNameState();
    });
  }

  function doSignOut() {
    var keep = data.lang;
    API.signOut();
    clearTimeout(syncTimer);
    data = fresh();
    data.lang = keep;
    session++;
    persist();
    auth = 'out';
    authForm = { mode: 'in', email: '', busy: false, error: '', info: '', detail: '' };
    feed = newFeed();
    feedFresh = 0;
    peekAt = 0;
    openDays = {};
    openNotes = {};
    noteForm = { id: null, value: '', back: 'azi', photo: '', pic: null, drop: false, picBusy: false };
    kidForm = { value: '', error: '', back: 'profil' };
    clearDraft();
    clearTimeout(pumpTimer);
    pumping = '';
    pumpSeq++;
    pumpFails = 0;
    pumpOffline = false;
    photoErr = '';
    closing = false;
    picFor = null;
    forgetShots();
    PHOTO.clear();
    syncErr = '';
    route = 'azi';
    try { window.history.replaceState(null, '', '#azi'); } catch (e) { /* merge si fara istoric */ }
    render();
    window.scrollTo(0, 0);
  }

  function askSignOut() {
    var n = pendingCount() + data.outbox.gone.length;
    if (!n) { doSignOut(); return; }
    openDialog({
      title: tr('signOutTitle'), body: tr('signOutPending', { x: count(n, tr('changeForms')) }),
      ok: tr('signOutOk'), cancel: tr('cancel'), onOk: doSignOut
    });
  }

  function askDeleteAccount() {
    openDialog({
      title: tr('deleteTitle'), body: tr('deleteBody'), ok: tr('deleteAccount'), cancel: tr('cancel'),
      onOk: function () {
        /* Pozele nu stau in baza de date, deci nu dispar odata cu contul: se sterg intai ele, toate cate sunt in dosarul lui.
           Cat dureaza, nicio poza noua nu mai pleaca spre cont, iar una aflata chiar acum pe drum este asteptata sa ajunga.
           Daca baza de date cunoaste pozele se afla acum, de la ea, nu din ce a retinut dispozitivul. Daca intre timp omul
           a iesit din cont (sau a intrat in altul), nimic din ce urmeaza nu se mai face. Odata pozele sterse, stergerea
           contului se mai incearca de cateva ori, ca sa nu ramana un cont ale carui activitati trimit la poze disparute. */
        if (closing) return;
        var uid = data.uid, mine = session, safety;
        function stale() { return !closing || mine !== session || data.uid !== uid; }
        function wait(ms) { return new Promise(function (done) { setTimeout(done, ms); }); }
        function idle(tries) {
          if (!pumping || tries <= 0) return Promise.resolve();
          return wait(250).then(function () { return idle(tries - 1); });
        }
        function finish(tries) {
          if (stale()) throw new Error('left');
          return API.rpc('delete_my_account').then(null, function (err) {
            if (tries <= 0 || stale()) throw err;
            return wait(2000).then(function () { return finish(tries - 1); });
          });
        }
        function done() {
          clearTimeout(safety);
          closing = false;
        }
        closing = true;
        clearTimeout(pumpTimer);
        /* O cerere ramasa fara raspuns nu poate tine pozele pe loc la nesfarsit. */
        safety = setTimeout(function () { if (closing && mine === session) { closing = false; queuePump(); } }, 5 * 60000);
        toast(tr('wait'));
        idle(80).then(function () {
          if (stale()) throw new Error('left');
          return API.rpc('sync', {});
        }).then(function (res) {
          if (stale()) throw new Error('left');
          if (!(Number(res && res.v) >= PHOTOS_FROM)) return null;
          return API.photoList(uid).then(function (names) {
            if (stale()) throw new Error('left');
            return API.photoRemove(names.map(function (n) { return uid + '/' + n; }));
          });
        }).then(function () { return finish(3); }).then(function () {
          done();
          doSignOut();
          toast(tr('accountDeleted'));
        }, function (err) {
          if (err && err.message === 'left') { clearTimeout(safety); return; }
          done();
          queuePump();
          toast(tr(err.offline ? 'errOffline' : 'errGeneric'));
        });
      }
    });
  }

  /* ---------- flux ---------- */

  /* Argumentele unei cereri de flux. Ziua de pe dispozitiv pleaca doar catre o baza care o cunoaste (scorul la vedere):
     una mai veche nu are parametrul p_day si ar refuza cererea. */
  function feedArgs(before, limit) {
    var args = { p_lang: lang, p_before: before, p_limit: limit };
    if (showOn()) args.p_day = L.dayKey(new Date());
    return args;
  }

  /* O cerere de flux este pe drum. Una ramasa fara raspuns mai mult de jumatate de minut nu mai tine locul ocupat. */
  function feedBusy() { return (feed.loading || feed.quiet) && Date.now() - feed.started < 30000; }

  /* Aduce fluxul la vedere: de la capat (reset) sau pagina urmatoare, mai veche. */
  function loadFeed(reset) {
    if (feed.loading && feedBusy()) return;
    var seq = ++feedSeq, sent = Date.now();
    feed.loading = true;
    feed.quiet = false;
    feed.started = sent;
    if (reset) { feed.error = ''; feed.tried = sent; }
    var before = !reset && feed.items.length ? Number(feed.items[feed.items.length - 1].ts) : null;
    API.rpc('feed', feedArgs(before, FEED_PAGE)).then(function (rows) {
      if (seq !== feedSeq) return;
      rows = Array.isArray(rows) ? rows : [];
      if (reset) {
        applyHead(rows, FEED_PAGE, sent, false);
        feed.at = Date.now();
        feed.fails = 0;
      } else {
        var have = {};
        feed.items.forEach(function (it) { have[it.id] = true; });
        rows.forEach(function (r) { if (!have[r.id]) feed.items.push(r); });
        feed.done = rows.length < FEED_PAGE;
      }
      feed.error = '';
      feed.ready = true;
      noteMine(rows);
      if (reset) noteFresh(rows);
    }, function (err) {
      if (seq !== feedSeq) return;
      feed.error = err.offline ? 'offline' : 'error';
      if (reset) feed.fails++;
    }).then(function () {
      if (seq !== feedSeq) return;
      feed.loading = false;
      if (route === 'flux' && auth === 'in') render();
    });
    if (route === 'flux') render();
  }

  /* Improspatare in liniste: aduce inceputul fluxului si il aseaza peste ce este pe ecran,
     fara "Se incarca" si fara sa stranga paginile deja deschise. Daca nu reuseste, lista ramane cum era. */
  function refreshFeed() {
    if (!feed.ready || feedBusy()) return;
    var seq = ++feedSeq, sent = Date.now();
    var limit = Math.min(FEED_MAX, Math.max(FEED_PAGE, feed.items.length));
    feed.loading = false;
    feed.quiet = true;
    feed.started = sent;
    feed.tried = sent;
    API.rpc('feed', feedArgs(null, limit)).then(function (rows) {
      if (seq !== feedSeq) return;
      feed.quiet = false;
      if (!Array.isArray(rows)) { feed.fails++; return; }
      applyHead(rows, limit, sent, true);
      feed.at = Date.now();
      feed.fails = 0;
      feed.error = '';
      noteMine(rows);
      noteFresh(rows);
      showFeed();
    }, function () {
      if (seq !== feedSeq) return;
      feed.quiet = false;
      feed.fails++;
    });
  }

  /* Aseaza inceputul proaspat al fluxului peste lista de pe ecran. O activitate ramasa isi pastreaza obiectul,
     iar o incurajare data dupa plecarea cererii nu este calcata de raspunsul ei, care e mai vechi.
     tail: pastreaza si activitatile mai vechi decat ce a venit, adica paginile deschise cu "Mai multe".
     Se pastreaza doar daca raspunsul coboara pana la lista veche; dupa o pauza lunga, cu mai multe noutati decat incap
     intr-un raspuns, intre ele ar ramane un gol, asa ca lista porneste din nou de la inceput. */
  function applyHead(rows, limit, sent, tail) {
    var old = {}, seen = {}, out = [];
    var top = feed.items.length ? Number(feed.items[0].ts) : 0;
    var floor = rows.length ? Number(rows[rows.length - 1].ts) : 0;
    feed.items.forEach(function (it) { old[it.id] = it; });
    rows.forEach(function (r) {
      var o = old[r.id];
      seen[r.id] = true;
      if (!o) { out.push(r); return; }
      var local = o.busy || (o.touched && o.touched >= sent), cheers = o.cheers, cheered = o.cheered;
      for (var k in r) o[k] = r[k];
      if (local) { o.cheers = cheers; o.cheered = cheered; }
      out.push(o);
    });
    if (tail && rows.length >= limit && floor <= top) {
      feed.items.forEach(function (it) { if (!seen[it.id] && Number(it.ts) < floor) out.push(it); });
    } else {
      feed.done = rows.length < limit;
    }
    feed.items = out;
  }

  /* Cea mai noua activitate a altcuiva dintr-un raspuns de flux. */
  function newestOther(rows) {
    var t = 0;
    rows.forEach(function (r) { if (!r.mine && Number(r.ts) > t) t = Number(r.ts); });
    return t;
  }

  /* Un raspuns de flux spune ce e mai nou; cand Flux este chiar pe ecran, totul este si vazut. */
  function noteFresh(rows) {
    var t = newestOther(rows);
    if (t > feedFresh) feedFresh = t;
    if (route === 'flux') markFeedSeen();
  }

  function markFeedSeen() {
    if (feedFresh > data.feedSeen) { data.feedSeen = feedFresh; persist(); }
    if (navEl && !navEl.hidden && navEl.querySelector('.nav-dot')) renderNav(false);
  }

  function feedNew() { return BACKEND && auth === 'in' && feedFresh > data.feedSeen; }

  /* Cu alt ecran deschis: o cerere mica, rara, doar ca sa stie daca a aparut ceva nou de la altcineva. */
  function peekFeed() {
    if (peekBusy) return;
    var mine = session;
    peekBusy = true;
    peekAt = Date.now();
    API.rpc('feed', feedArgs(null, 5)).then(function (rows) {
      if (mine !== session || auth !== 'in') return;
      var was = feedNew();
      if (Array.isArray(rows)) noteFresh(rows);
      if (feedNew() !== was && navEl && !navEl.hidden) renderNav(false);
    }, function () { /* data viitoare */ }).then(function () { peekBusy = false; });
  }

  /* Activitatile mele vazute in flux aduc cu ele numarul de incurajari la zi, fara un drum in plus pana la cont. */
  function noteMine(rows) {
    var changed = false;
    rows.forEach(function (r) {
      if (!r.mine) return;
      var e = findEntry(r.id);
      if (e && (e.cheers || 0) !== (r.cheers || 0)) { e.cheers = r.cheers || 0; changed = true; }
    });
    if (changed) persist();
  }

  /* Redeseneaza fluxul doar daca s-a schimbat ceva la vedere. Daca omul a coborat in lista,
     activitatea la care se uita ramane pe loc; cu inceputul listei la vedere, noutatile intra pe ecran. */
  function showFeed() {
    if (route !== 'flux' || auth !== 'in') return;
    if (viewFeed() === shownFeed) return;
    var marks = [], posts = viewEl.querySelectorAll('.post'), i, box;
    for (i = 0; i < posts.length && marks.length < 6; i++) {
      box = posts[i].getBoundingClientRect();
      if (box.bottom <= 0) continue;
      if (i === 0 && box.top >= 0) break;
      marks.push([posts[i].getAttribute('data-post'), box.top]);
    }
    render();
    if (!marks.length) return;
    var now = {};
    posts = viewEl.querySelectorAll('.post');
    for (i = 0; i < posts.length; i++) now[posts[i].getAttribute('data-post')] = posts[i];
    for (i = 0; i < marks.length; i++) {
      if (!now[marks[i][0]]) continue;
      window.scrollBy(0, now[marks[i][0]].getBoundingClientRect().top - marks[i][1]);
      break;
    }
  }

  /* La intrarea pe ecranul Flux: prima data se incarca la vedere, apoi doar se improspateaza. */
  function openFeed() {
    if (!feed.ready) loadFeed(true);
    else if (Date.now() - feed.at > 4000) refreshFeed();
    if (pulseOn() && Date.now() - pulseAt() > 4000) loadPulse(null);
    if (Date.now() - data.lastSync > 30000) queueSync(0);
  }

  /* ---------- telul comun "Azi pe plus" ---------- */

  function pulseAt() { return data.pulse ? data.pulse.at : 0; }

  /* Cardul se arata din ultimul raspuns pastrat, daca este pentru ziua de azi. */
  function pulseToday() {
    return data.pulse && data.pulse.day === L.dayKey(new Date()) ? data.pulse : null;
  }

  /* Aduce starea telului comun; cu join true omul intra, cu false iese. Un raspuns vechi, sosit dupa altul mai nou, nu conteaza. */
  function loadPulse(join) {
    if (!pulseOn() || auth !== 'in') return;
    if (pulseBusy && join == null) return;
    var seq = ++pulseSeq, uid = data.uid, mine = session, args = { p_day: L.dayKey(new Date()) };
    if (join != null) args.p_join = !!join;
    pulseBusy = true;
    pulseTried = Date.now();
    API.rpc('pulse', args).then(function (r) {
      if (seq !== pulseSeq || data.uid !== uid || mine !== session) return;
      if (!r || !Array.isArray(r.up)) throw new Error('bad_response');
      var names = function (list) { return Array.isArray(list) ? list.filter(function (n) { return typeof n === 'string'; }).slice(0, 100) : null; };
      data.pulse = {
        day: typeof r.day === 'string' ? r.day : args.p_day, on: !!r['in'], total: r.total > 0 ? r.total : 0,
        up: names(r.up), others: names(r.others), you: typeof r.you === 'boolean' ? r.you : null, at: Date.now()
      };
      persist();
      if (join != null) toast(tr(join ? 'pulseJoined' : 'pulseLeft'));
    }, function (err) {
      if (seq !== pulseSeq || data.uid !== uid || mine !== session) return;
      if (join != null) toast(tr(err.offline ? 'errOffline' : 'errGeneric'));
    }).then(function () {
      if (seq !== pulseSeq) return;
      pulseBusy = false;
      if (route === 'flux' && auth === 'in') showFeed();
    });
  }

  /* Cei pe plus, impartiti in ceilalti (nume) si "tu". Serverul spune el daca omul este printre ei (you) si ii da pe
     ceilalti separat (others); un raspuns al unui script mai vechi, fara ele, se descurca dupa nume, fara majuscule si diacritice. */
  function pulseSplit(pz) {
    if (pz.others && pz.you != null) return { others: pz.others, you: pz.you };
    var mine = fold(data.name), others = pz.up.filter(function (n) { return fold(n) !== mine; });
    return { others: others, you: others.length !== pz.up.length };
  }

  /* "Ana, Bogdan și tu": numele celor pe plus, cu "tu" la sfarsit. */
  function pulseNames(pz) {
    var sp = pulseSplit(pz), list = sp.others.map(function (n) { return '<b>' + esc(n) + '</b>'; });
    if (sp.you) list.push('<b>' + esc(tr('pulseYou')) + '</b>');
    if (!list.length) return '';
    if (list.length === 1) return list[0];
    return list.slice(0, -1).join(', ') + ' ' + esc(tr('pulseAnd')) + ' ' + list[list.length - 1];
  }

  function viewPulse() {
    if (!pulseOn()) return '';
    var pz = pulseToday();
    if (!pz) return '';
    var sp = pulseSplit(pz), names = pulseNames(pz), n = sp.others.length + (sp.you ? 1 : 0);
    var sub = !pz.total ? esc(tr('pulseNobody')) : names || esc(tr('pulseNoneUp'));
    var acts = pz.on
      ? '<button type="button" class="link" data-act="pulse-leave" data-focus="pulse-leave"' + (pulseBusy ? ' disabled' : '') + '>' + esc(tr('pulseLeave')) + '</button>'
      : '<button type="button" class="pulse-join" data-act="pulse-join" data-focus="pulse-join"' + (pulseBusy ? ' disabled' : '') + '>' + esc(tr('pulseJoin')) + '</button>';
    return '<section class="pulse" id="pulse" aria-label="' + esc(tr('pulseTitle')) + '">' +
      '<div class="pulse-top"><div class="pulse-t">' + esc(tr('pulseTitle')) + '</div>' +
        '<div class="pulse-n' + (n ? '' : ' zero') + '" id="pulse-n">' + esc(pz.total ? tr('pulseOf', { n: n, m: pz.total }) : '0') + '</div></div>' +
      '<p class="pulse-s" id="pulse-s">' + sub + '</p>' +
      (pz.on ? '' : '<p class="pulse-s">' + esc(tr('pulseWhy')) + '</p>') +
      '<div class="pulse-acts">' + acts + '</div>' +
      '</section>';
  }

  /* Cat timp ecranul Flux este deschis si la vedere, se improspateaza singur. Dupa incercari nereusite asteapta tot mai mult. */
  function feedTick() {
    if (auth !== 'in' || document.hidden || navigator.onLine === false) return;
    var now = Date.now(), wait = FEED_EVERY * Math.min(8, Math.pow(2, feed.fails));
    if (route !== 'flux') {
      if (now - peekAt >= PULSE_EVERY) peekFeed();
      return;
    }
    if (!feed.ready) {
      /* Prima incarcare: daca nu a pornit inca porneste acum, iar daca nu a reusit se mai incearca singura. */
      if (!feed.loading && (!feed.error || now - feed.tried >= wait)) loadFeed(true);
      return;
    }
    if (now - Math.max(feed.at, feed.tried) >= wait) refreshFeed();
    /* Cardul "Azi pe plus", mai rar decat fluxul. */
    if (pulseOn() && !pulseBusy && now - Math.max(pulseAt(), pulseTried) >= PULSE_EVERY * Math.min(8, Math.pow(2, feed.fails))) loadPulse(null);
    /* Incurajarile primite la activitati care nu mai sunt in flux vin cu starea contului, mai rar. */
    if (!syncErr && !syncing && now - data.lastSync > 60000) queueSync(0);
  }

  function toggleCheer(id) {
    var it = null;
    for (var i = 0; i < feed.items.length; i++) if (feed.items[i].id === id) it = feed.items[i];
    if (!it || it.mine || it.busy) return;
    var on = !it.cheered;
    it.cheered = on;
    it.cheers = Math.max(0, (it.cheers || 0) + (on ? 1 : -1));
    it.busy = true;
    it.touched = Date.now();
    render();
    API.rpc('cheer', { p_entry: id, p_on: on }).then(function (r) {
      if (r) { it.cheers = r.cheers || 0; it.cheered = !!r.cheered; }
    }, function (err) {
      it.cheered = !on;
      it.cheers = Math.max(0, (it.cheers || 0) + (on ? -1 : 1));
      toast(tr(err.offline ? 'errOffline' : 'errGeneric'));
    }).then(function () {
      it.busy = false;
      it.touched = Date.now();
      if (route === 'flux' && auth === 'in') render();
    });
  }

  /* ---------- ecrane ---------- */

  function demoBanner() {
    if (!data.demo) return '';
    return '<div class="demo"><span>' + esc(tr('demoNote')) + '</span>' +
      '<button type="button" data-act="demo-clear" data-focus="demo-clear">' + esc(tr('demoClear')) + '</button></div>';
  }

  function pendingBanner() {
    if (!BACKEND || !(syncErr || pumpFails)) return '';
    var n = pendingCount();
    if (!n) return '';
    return '<p class="notice" id="pending">' + esc(tr('pendingNote', { x: count(n, tr('changeForms')) })) + '</p>';
  }

  function entrySub(e) {
    var s = timeOf(e.ts);
    if (!BACKEND || isKidEntry(e)) return s;
    if (!e.pub) return s + ' · ' + tr('privateL');
    return s + ' · ' + tr('publicL') + (e.cheers ? ' · ' + count(e.cheers, tr('cheerForms')) : '');
  }

  /* Antetul unui ecran. Cand modul educator e pornit, in dreapta sta butonul cu cel ales (Eu sau un copil), pe orice ecran;
     right este ce mai sta in dreapta (butonul de inchidere al formularelor), altfel randul de sub titlu. */
  function head(title, sub, right) {
    var who = whoPill();
    var end = who || right ? '<div class="head-end">' + who + (right || '') + '</div>' : '';
    return '<header class="head' + (right ? ' head-add' : '') + (who ? ' has-who' : '') + '"><h1 id="title" tabindex="-1">' + title + '</h1>' +
      end + (!right && sub ? '<p class="head-sub">' + sub + '</p>' : '') + '</header>';
  }

  function whoPill() {
    if (!eduOn()) return '';
    var kid = whoNow();
    return '<button type="button" class="who' + (kid ? ' kid' : '') + '" data-act="who-open" data-focus="who" aria-haspopup="dialog" aria-label="' + esc(tr('whoFor')) + '">' +
      esc(whoName()) + ICON.chevron + '</button>';
  }

  /* Semnul mic care arata ca o activitate are detalii; textul ascuns il spune si cititoarelor de ecran.
     Spatiul de dinainte nu se rupe, ca semnul sa nu ajunga singur pe randul urmator. */
  function noteMark() { return '\u00A0<span class="note-ic">' + ICON.note + '<span class="sr">' + esc(tr('hasDetails')) + '</span></span>'; }

  function photoMark() { return '\u00A0<span class="note-ic">' + ICON.photo + '<span class="sr">' + esc(tr('hasPhoto')) + '</span></span>'; }
  function marks(x) { return (x.note ? noteMark() : '') + (x.photo ? photoMark() : ''); }

  /* Porneste aducerea unei poze pentru afisare, o singura data. Pozele proprii se iau de pe dispozitiv cat timp mai sunt acolo. */
  function needShot(key, path) {
    if (shots[key]) return;
    trimShots();
    shots[key] = { state: 'loading', url: '' };
    var name = path.split('/').pop(), mine = path.indexOf(data.uid + '/') === 0;
    (mine ? PHOTO.get(name).then(null, function () { return null; }) : Promise.resolve(null)).then(function (blob) {
      return blob || API.photoGet(path);
    }).then(function (blob) {
      if (!blob) throw new Error('no_photo');
      return { state: 'ok', url: URL.createObjectURL(blob) };
    }).then(null, function () {
      return { state: 'error', url: '' };
    }).then(function (st) {
      /* Intre timp omul a putut iesi din cont: poza nu mai este de aratat. */
      if (!shots[key] || shots[key].state !== 'loading') { if (st.url) URL.revokeObjectURL(st.url); return; }
      shots[key] = st;
      shotReady(key);
    });
  }

  function dropShot(key) {
    if (shots[key] && shots[key].url) { try { URL.revokeObjectURL(shots[key].url); } catch (e) { /* nimic de eliberat */ } }
    delete shots[key];
  }

  function trimShots() {
    var keys = Object.keys(shots), extra = keys.length - SHOTS_MAX + 1, live = {}, i;
    if (extra <= 0) return;
    var boxes = document.querySelectorAll('.shot');
    for (i = 0; i < boxes.length; i++) live[boxes[i].getAttribute('data-shot')] = true;
    feed.items.forEach(function (it) { if (it.photo) live[it.photo] = true; });
    for (i = 0; i < keys.length && extra > 0; i++) {
      if (live[keys[i]] || shots[keys[i]].state === 'loading') continue;
      dropShot(keys[i]);
      extra--;
    }
  }

  /* Poza aleasa intr-un formular a devenit poza unei activitati: imaginea deja pregatita trece la ea. */
  function adoptShot(name) {
    var k = 'pick:' + name;
    if (!shots[k]) return;
    shots[data.uid + '/' + name] = shots[k];
    delete shots[k];
  }

  function shotInner(key) {
    var st = shots[key];
    if (st && st.state === 'ok') return '<img src="' + esc(st.url) + '" alt="' + esc(tr('photoAlt')) + '">';
    if (st && st.state === 'error') {
      return '<span class="shot-msg">' + esc(tr('photoError')) + '</span>' +
        '<button type="button" class="link" data-act="shot-retry" data-key="' + esc(key) + '">' + esc(tr('retry')) + '</button>';
    }
    return '<span class="shot-msg">' + esc(tr('photoLoading')) + '</span>';
  }

  /* Locul unei poze pe ecran. Are de la inceput forma pozei, citita din numele ei, ca pagina sa nu sara cand poza soseste.
     O poza inalta nu trece de inaltimea ingaduita (--shot-max, din CSS): locul ei se ingusteaza, pastrand forma. */
  function shotBox(key, path, cls) {
    var sz = PHOTO.size(path), ratio = sz ? sz.w + ' / ' + sz.h : '4 / 3';
    needShot(key, path);
    return '<div class="shot' + (cls ? ' ' + cls : '') + '" data-shot="' + esc(key) + '" style="aspect-ratio:' + ratio + ';max-width:calc(var(--shot-max) * ' + ratio + ')">' +
      shotInner(key) + '</div>';
  }

  /* Poza a sosit, sau nu a putut fi adusa: locurile ei de pe ecran se completeaza fara sa se redeseneze nimic altceva. */
  function shotReady(key) {
    var boxes = document.querySelectorAll('.shot'), hit = false;
    for (var i = 0; i < boxes.length; i++) {
      if (boxes[i].getAttribute('data-shot') !== key) continue;
      boxes[i].innerHTML = shotInner(key);
      hit = true;
    }
    if (hit && route === 'flux' && auth === 'in') shownFeed = viewFeed();
  }

  function forgetShots() {
    Object.keys(shots).forEach(dropShot);
  }

  /* Randul de poza dintr-un formular: alegerea, apoi o miniatura cu schimbare si scoatere. Butoanele deschid alegerea de
     fisiere a telefonului prin campul pic-file din pagina, care sta in afara ecranelor si nu se redeseneaza niciodata:
     cat omul alege poza, ecranul se poate redesena fara ca alegerea lui sa se piarda. */
  function photoRow(id, key, path, busy) {
    /* Pe telefon: o poza facuta pe loc (deschide direct camera) sau una din telefon. Pe calculator doar a doua. */
    var picks = (TOUCH
      ? '<button type="button" class="link" data-act="pic-pick" data-cam="1" data-form="' + id + '" data-focus="' + id + '-cam">' + esc(tr('photoTake')) + '</button>'
      : '') +
      '<button type="button" class="link" data-act="pic-pick" data-form="' + id + '" data-focus="' + id + '-pick">' + esc(tr('photoPick')) + '</button>';
    if (busy) {
      return '<div class="line" id="' + id + '-pic"><div><div class="line-t">' + esc(tr('photo')) + '</div><div class="line-s" role="status">' + esc(tr('photoBusy')) + '</div></div></div>';
    }
    if (!key) {
      return '<div class="line" id="' + id + '-pic"><div><div class="line-t">' + esc(tr('photo')) + '</div><div class="line-s">' + esc(tr('photoSub')) + '</div></div>' +
        '<div class="pic-acts">' + picks + '</div></div>';
    }
    return '<div class="pic" id="' + id + '-pic">' + shotBox(key, path, 'thumb') +
      '<div class="pic-acts">' + picks +
      '<button type="button" class="link" data-act="pic-drop" data-form="' + id + '" data-focus="' + id + '-drop">' + esc(tr('photoRemove')) + '</button></div></div>';
  }

  /* Poza aratata acum intr-un formular: cea abia aleasa, sau cea pe care activitatea o are deja. */
  function formShot(form) {
    if (form.pic) return ['pick:' + form.pic.name, form.pic.name];
    if (form === noteForm && form.photo && !form.drop) return [data.uid + '/' + form.photo, data.uid + '/' + form.photo];
    return ['', ''];
  }

  /* Redeseneaza doar randul pozei. Cine a ajuns la el cu tastatura ramane pe el, pe butonul de pe care a pornit alegerea. */
  function drawPicRow(id, form) {
    var el = byId(id + '-pic'), sh = formShot(form), act = document.activeElement, key = null;
    if (!el) return;
    if (el.contains(act)) key = act.getAttribute('data-focus') || id + '-pick';
    else if (act === document.body) key = picFocus || id + '-pick';
    el.outerHTML = photoRow(id, sh[0], sh[1], form.picBusy);
    var btn = key ? viewEl.querySelector('[data-focus="' + key + '"]') || viewEl.querySelector('[data-focus="' + id + '-pick"]') : null;
    if (btn) btn.focus({ preventScroll: true });
  }

  /* Formularul acesta mai este cel de pe ecran? */
  function formShown(form) { return form === add ? isAddRoute(route) : form === noteForm && route === 'detalii'; }

  /* Alegerea de fisiere a telefonului: galeria sau, cu capture, aplicatia de camera. Trebuie pornita chiar din apasarea omului. */
  function openChooser(form, focus, cam) {
    var chooser = byId('pic-file');
    picFor = form;
    picFocus = focus || '';
    PHOTO.ready();
    if (cam) chooser.setAttribute('capture', 'environment'); else chooser.removeAttribute('capture');
    chooser.value = '';
    chooser.click();
  }

  /* Camera din aplicatie (src/camera.js). Daca omul alege de acolo camera telefonului, se deschide aceea. */
  function openCamera(form, focus) {
    PHOTO.ready();
    CAM.open({
      close: tr('close'), camShot: tr('camShot'), camFlip: tr('camFlip'), camStarting: tr('camStarting'), camNative: tr('camNative'),
      camDenied: tr('camDenied'), camNone: tr('camNone'), camError: tr('camError')
    }, function () { openChooser(form, focus, true); }).then(function (blob) {
      if (blob) { receivePhoto(form, blob, focus); return; }
      var btn = focus ? viewEl.querySelector('[data-focus="' + focus + '"]') : null;
      if (btn) btn.focus({ preventScroll: true });
    });
  }

  /* Poza aleasa intr-un formular, inlocuita sau lasata in urma: imaginea ei pregatita si copia de pe dispozitiv nu mai trebuie. */
  function forgetPick(pic) {
    dropShot('pick:' + pic.name);
    if (!photoUsed(pic.name) && data.uploads.indexOf(pic.name) < 0) PHOTO.del(pic.name, true);
  }

  function pickPhoto(input) {
    var form = picFor, file = input.files && input.files[0];
    input.value = '';
    picFor = null;
    receivePhoto(form, file, picFocus);
  }

  /* O poza aleasa sau facuta: se micsoreaza, apoi apare in formular. Formularul nu se redeseneaza, ca sa nu se piarda ce e scris in el.
     Poza micsorata se pastreaza pe dispozitiv pana la salvare, odata cu restul formularului. */
  function receivePhoto(form, file, focus) {
    var id = form === add ? 'act' : 'note';
    picFocus = focus || '';
    if (!file || !form || form.picBusy || !formShown(form)) return;
    form.picBusy = true;
    drawPicRow(id, form);
    PHOTO.shrink(file).then(function (r) {
      form.picBusy = false;
      if (!formShown(form)) return;
      if (form.pic) forgetPick(form.pic);
      shots['pick:' + r.name] = { state: 'ok', url: URL.createObjectURL(r.blob) };
      form.pic = r;
      PHOTO.put(r.name, r.blob);
      if (form === noteForm) form.drop = false;
      drawPicRow(id, form);
      saveDraft();
    }, function () {
      form.picBusy = false;
      if (!formShown(form)) return;
      drawPicRow(id, form);
      toast(tr('photoBad'));
    });
  }

  /* ---------- ciorna formularului ---------- */

  function picInfo(pic) { return pic ? { name: pic.name, w: pic.w, h: pic.h } : null; }

  function saveDraft() {
    var d = null;
    if (isAddRoute(route)) {
      d = { route: route, add: { type: add.type, favId: add.favId, name: add.name, pts: add.pts, keep: add.keep, pub: add.pub, note: add.note, noteOpen: add.noteOpen, pic: picInfo(add.pic), kid: add.kid } };
    } else if (route === 'detalii' && noteForm.id) {
      d = { route: route, note: { id: noteForm.id, value: noteForm.value, back: noteForm.back, drop: noteForm.drop, pic: picInfo(noteForm.pic) } };
    }
    if (!d) return;
    d.uid = data.uid;
    d.at = Date.now();
    try { window.localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch (e) { /* merge si fara ciorna */ }
  }

  function clearDraft() {
    try { window.localStorage.removeItem(DRAFT_KEY); } catch (e) { /* nimic de sters */ }
  }

  function rawDraft() {
    try {
      var d = JSON.parse(window.localStorage.getItem(DRAFT_KEY) || 'null');
      return d && typeof d === 'object' ? d : null;
    } catch (e) { return null; }
  }

  /* Ciorna pastrata, daca este a acestui cont si destul de proaspata. */
  function readDraft() {
    var d = rawDraft();
    return d && d.uid === data.uid && Date.now() - d.at < DRAFT_FOR ? d : null;
  }

  function okPic(p) { return !!p && typeof p.name === 'string' && PHOTO.NAME.test(p.name) ? p : null; }

  /* Pozele unei ciorne, care trebuie sa ramana pe dispozitiv odata cu cele care asteapta sa plece. */
  function draftPics() {
    var d = readDraft(), names = [];
    if (d && d.add && okPic(d.add.pic)) names.push(d.add.pic.name);
    if (d && d.note && okPic(d.note.pic)) names.push(d.note.pic.name);
    if (add.pic) names.push(add.pic.name);
    if (noteForm.pic) names.push(noteForm.pic.name);
    return names;
  }

  /* Ciorna nu mai este de folos: dispare, cu tot cu pozele ei nefolosite. */
  function dropDraft(d) {
    clearDraft();
    [d && d.add && okPic(d.add.pic), d && d.note && okPic(d.note.pic)].forEach(function (p) {
      if (p && !photoUsed(p.name) && data.uploads.indexOf(p.name) < 0) PHOTO.del(p.name, true);
    });
  }

  /* Poza unei ciorne se aduce de pe dispozitiv si isi ia locul in formular, cand soseste. */
  function restorePic(form, id, p) {
    PHOTO.get(p.name).then(function (blob) {
      if (!blob || form.pic || form.picBusy) return;
      shots['pick:' + p.name] = { state: 'ok', url: URL.createObjectURL(blob) };
      form.pic = { name: p.name, blob: blob, w: +p.w || 0, h: +p.h || 0 };
      if (form === noteForm) form.drop = false;
      if (formShown(form)) drawPicRow(id, form);
    }, function () { /* poza nu mai este pe dispozitiv */ });
  }

  /* La pornire: pagina a fost reincarcata cu un formular deschis (de exemplu dupa ce telefonul a inchis aplicatia cat era
     deschisa camera). Formularul se umple la loc, cu poza lui cu tot; altfel ciorna veche se arunca. */
  function restoreDraft(hash) {
    var raw = rawDraft(), d = readDraft();
    if (!d) { if (raw) dropDraft(raw); return; }
    if ((d.route === 'plus' || d.route === 'minus') && d.add && hash === d.route) {
      var a = d.add;
      resetAdd(d.route);
      draftUsed = true;
      add.favId = typeof a.favId === 'string' && findFav(a.favId) ? a.favId : null;
      add.name = typeof a.name === 'string' ? a.name.slice(0, 40) : '';
      add.pts = L.clampPts(Number(a.pts) || 10);
      add.keep = !!a.keep;
      add.pub = BACKEND && !!a.pub;
      add.note = notesOn() && typeof a.note === 'string' ? a.note.slice(0, L.NOTE_MAX * 2) : '';
      add.noteOpen = !!a.noteOpen || !!add.note;
      add.kid = typeof a.kid === 'string' && eduOn() && findKid(a.kid) ? a.kid : null;
      if (add.kid) add.pub = false;
      draftBack = !!(add.name || add.note || okPic(a.pic));
      if (okPic(a.pic)) restorePic(add, 'act', a.pic);
      return;
    }
    if (d.route === 'detalii' && d.note && hash === 'detalii') {
      var n = d.note, e = typeof n.id === 'string' ? findEntry(n.id) : null;
      if (e) {
        noteForm = {
          id: e.id, value: typeof n.value === 'string' ? n.value : (e.note || ''), back: MAIN.indexOf(n.back) >= 0 ? n.back : 'azi',
          photo: e.photo || '', pic: null, drop: !!n.drop, picBusy: false
        };
        draftBack = noteForm.value !== (e.note || '') || noteForm.drop || !!okPic(n.pic);
        if (okPic(n.pic)) restorePic(noteForm, 'note', n.pic);
        return;
      }
    }
    dropDraft(d);
  }

  /* Omul a plecat de pe un formular fara sa salveze (sau a salvat): ciorna nu mai trebuie, nici pozele ei nefolosite. */
  function leaveForm(from) {
    if (isAddRoute(from) && add.pic) { forgetPick(add.pic); add.pic = null; }
    if (from === 'detalii' && noteForm.pic) { forgetPick(noteForm.pic); noteForm.pic = null; }
    clearDraft();
  }

  /* Campul de detalii. Randul nou de la inceput este cel pe care pagina il arunca oricum, ca textul sa ramana intreg. */
  function noteField(id, value, hint, plain) {
    return '<div class="field note-field"><label for="' + id + '"' + (plain ? ' class="sr"' : '') + '>' + esc(tr('details')) + '</label>' +
      '<textarea id="' + id + '" name="note" rows="3" maxlength="' + L.NOTE_MAX + '" autocapitalize="sentences" placeholder="' + esc(tr('detailsPh')) + '" aria-describedby="' + id + '-h">\n' + esc(value) + '</textarea>' +
      '<div class="hint-row"><span class="hint" id="' + id + '-h">' + esc(hint) + '</span>' +
      '<span class="hint count" id="' + id + '-n">' + value.length + '/' + L.NOTE_MAX + '</span></div></div>';
  }

  function rowEntry(e) {
    return '<li><button type="button" class="row" data-act="entry" data-id="' + esc(e.id) + '" data-focus="e-' + esc(e.id) + '">' +
      '<span class="row-main"><span class="row-t">' + esc(nameOf(e)) + marks(e) + '</span><span class="row-s">' + esc(entrySub(e)) + '</span></span>' +
      '<span class="pill ' + e.type + '">' + L.fmt(L.signed(e)) + '</span></button></li>';
  }

  function viewToday() {
    var now = new Date(), today = L.dayKey(now), mine = scope(), t = L.totals(mine);
    var total = t[today] || 0;
    var list = mine.filter(function (e) { return e.day === today; }).sort(function (a, b) { return b.ts - a.ts; });
    var week = L.lastDays(today, 7).reduce(function (s, k) { return s + (t[k] || 0); }, 0);
    var streak = L.currentStreak(t, today), best = L.bestStreak(t), got = myCheers();
    /* Copiii nu primesc incurajari (activitatile lor sunt private): pentru ei a treia cifra este recordul. */
    var third = BACKEND && !whoNow()
      ? '<div class="stat"><div class="stat-num" id="cheers">' + ICON.star + got + '</div><div class="stat-label">' + esc(tr('cheerForms')[got === 1 ? 0 : 1]) + '</div></div>'
      : '<div class="stat"><div class="stat-num" id="best">' + esc(count(best, tr('day'))) + '</div><div class="stat-label">' + esc(tr('bestLabel')) + '</div></div>';
    return '' +
      head(esc(tr('today')), esc(longDate(now))) +
      demoBanner() + pendingBanner() +
      '<section class="hero" aria-label="' + esc(tr('pointsToday')) + '">' +
        '<div class="hero-num ' + tone(total) + '" id="score">' + L.fmt(total) + '</div>' +
        '<div class="hero-label">' + esc(tr('pointsToday')) + '</div>' +
      '</section>' +
      '<div class="stats">' +
        '<div class="stat"><div class="stat-num" id="streak">' + ICON.flame + esc(count(streak, tr('day'))) + '</div><div class="stat-label">' + esc(tr('streakLabel')) + '</div></div>' +
        '<div class="stat"><div class="stat-num ' + tone(week) + '" id="week">' + L.fmt(week) + '</div><div class="stat-label">' + esc(tr('days7')) + '</div></div>' +
        third +
      '</div>' +
      '<div class="cta">' +
        '<a class="btn btn-plus" href="#plus" data-route="plus"><span class="btn-sign" aria-hidden="true">+</span>' + esc(tr('addGood')) + '</a>' +
        '<a class="btn btn-minus" href="#minus" data-route="minus"><span class="btn-sign" aria-hidden="true">−</span>' + esc(tr('addBad')) + '</a>' +
      '</div>' +
      '<section class="sect"><h2>' + esc(tr('todayList')) + '</h2>' +
        (list.length
          ? '<ul class="rows" id="today-list">' + list.map(rowEntry).join('') + '</ul>'
          : '<div class="empty"><p class="empty-t">' + esc(tr('emptyToday')) + '</p><p class="empty-s">' + esc(tr('emptyTodayHint')) + '</p></div>') +
      '</section>';
  }

  function keepVisible() {
    var name = fold(add.name);
    if (!name || add.favId) return false;
    return !data.favs.some(function (f) { return f.type === add.type && fold(favName(f)) === name; });
  }

  function saveLabel() { return tr('save') + ' ' + L.fmt(add.type === 'minus' ? -add.pts : add.pts); }

  /* Detaliile din formularul de notare: stranse intr-un rand pana cand omul vrea sa le scrie. */
  function addNote() {
    if (!notesOn()) return '';
    if (add.noteOpen) return noteField('act-note', add.note, BACKEND ? tr('detailsWho') : '');
    return '<div class="line" id="note-row"><div><div class="line-t">' + esc(tr('details')) + '</div><div class="line-s">' + esc(tr('detailsSub')) + '</div></div>' +
      '<button type="button" class="link" data-act="note-open" data-focus="note-open">' + esc(tr('addShort')) + '</button></div>';
  }

  function addPic() {
    var shot = formShot(add);
    return photosOn() ? photoRow('act', shot[0], shot[1], add.picBusy) : '';
  }

  /* Ce stie baza de date sa pastreze se afla la primul drum pana la cont. Daca omul scrie deja o activitate cand soseste
     raspunsul, randurile de detalii si de poza care lipseau apar pe loc, fara ca formularul sa se redeseneze sub degetele lui. */
  function offerMore() {
    var after = byId('keep-row');
    if (!isAddRoute(route) || !after) return;
    if (notesOn() && !byId('note-row') && !byId('act-note')) after.insertAdjacentHTML('beforebegin', addNote());
    if (photosOn() && !byId('act-pic')) after.insertAdjacentHTML('beforebegin', addPic());
  }

  function viewAdd() {
    var favs = data.favs.filter(function (f) { return f.type === add.type; });
    var chips = favs.map(function (f) {
      return '<button type="button" class="chip" aria-pressed="' + (add.favId === f.id) + '" data-act="fav" data-id="' + esc(f.id) + '" data-focus="f-' + esc(f.id) + '">' +
        '<span class="chip-n">' + esc(favName(f)) + '</span><span class="chip-p">' + L.fmt(f.type === 'minus' ? -f.pts : f.pts) + '</span></button>';
    }).join('');
    /* Activitatile copiilor sunt mereu private: fara randul de vizibilitate. */
    var who = !BACKEND ? '' : add.kid
      ? '<p class="note top" id="kid-private">' + esc(tr('eduKidPrivate')) + '</p>' :
      '<div class="line"><div><div class="line-t" id="who-l">' + esc(tr('who')) + '</div><div class="line-s" id="who-s">' + esc(tr(add.pub ? 'inFeed' : 'onlyYou')) + '</div></div>' +
        '<div class="seg small" role="group" aria-labelledby="who-l">' +
          '<button type="button" class="seg-b" aria-pressed="' + !add.pub + '" data-act="pub" data-v="0" data-focus="pub-0">' + esc(tr('priv')) + '</button>' +
          '<button type="button" class="seg-b" aria-pressed="' + !!add.pub + '" data-act="pub" data-v="1" data-focus="pub-1">' + esc(tr('pub')) + '</button>' +
        '</div></div>';
    return '' +
      head(esc(tr('newActivity')), '', '<a class="icon-btn" href="#azi" data-route="azi" data-replace="1" aria-label="' + esc(tr('close')) + '">' + ICON.close + '</a>') +
      '<div class="pad">' +
        (add.kid && findKid(add.kid) ? '<p class="for-kid" id="for-kid">' + esc(tr('forKid', { x: findKid(add.kid).name })) + '</p>' : '') +
        '<div class="seg" role="group" aria-label="' + esc(tr('typeLabel')) + '">' +
          '<button type="button" class="seg-b plus" aria-pressed="' + (add.type === 'plus') + '" data-act="type" data-type="plus" data-focus="type-plus">+ ' + esc(tr('addGood')) + '</button>' +
          '<button type="button" class="seg-b minus" aria-pressed="' + (add.type === 'minus') + '" data-act="type" data-type="minus" data-focus="type-minus">− ' + esc(tr('addBad')) + '</button>' +
        '</div>' +
        '<section class="sect"><h2 id="favs-h">' + esc(tr('favorites')) + '</h2>' +
          (favs.length
            ? '<div class="chips ' + add.type + '" role="group" aria-labelledby="favs-h">' + chips + '</div>'
            : '<p class="note">' + esc(tr('noFavs')) + '</p>') +
        '</section>' +
        '<form id="add-form" novalidate>' +
          '<div class="field"><label for="act-name">' + esc(tr(favs.length ? 'orWrite' : 'writeOne')) + '</label>' +
            '<input id="act-name" name="name" type="text" maxlength="40" autocomplete="off" autocapitalize="sentences" enterkeyhint="done" placeholder="' + esc(tr('namePh')) + '" value="' + esc(add.name) + '" aria-describedby="name-err">' +
            '<p class="err" id="name-err" hidden>' + esc(tr('nameMissing')) + '</p></div>' +
          '<div class="line"><div><div class="line-t" id="pts-l">' + esc(tr('points')) + '</div><div class="line-s">' + esc(tr('pointsRange')) + '</div></div>' +
            '<div class="stepper" role="group" aria-labelledby="pts-l">' +
              '<button type="button" class="round" data-act="step" data-d="-1" data-focus="step-down" aria-label="' + esc(tr('less')) + '">−</button>' +
              '<output class="step-val" id="pts-val" aria-live="polite">' + add.pts + '</output>' +
              '<button type="button" class="round" data-act="step" data-d="1" data-focus="step-up" aria-label="' + esc(tr('more')) + '">+</button>' +
            '</div></div>' +
          who + addNote() + addPic() +
          '<label class="check" id="keep-row"' + (keepVisible() ? '' : ' hidden') + '><input type="checkbox" id="keep-fav"' + (add.keep ? ' checked' : '') + '><span>' + esc(tr('keepFav')) + '</span></label>' +
          '<div class="save-wrap' + (add.noteOpen ? ' flat' : '') + '"><button type="submit" class="save ' + add.type + '" id="save-btn">' + esc(saveLabel()) + '</button></div>' +
        '</form>' +
      '</div>';
  }

  /* Rezumatul saptamanii, sub grafic: cate zile din cele notate pana acum au fost pe plus si care a fost cea mai buna.
     Zilele dinaintea primei notari nu se numara: unui om care a inceput alaltaieri nu i se spune "2 din 7". */
  function weekLine(days, vals, keys, today) {
    if (!keys.length) return '';
    var first = keys[keys.length - 1], from = 0;
    while (from < days.length - 1 && days[from] < first) from++;
    var n = 0, m = days.length - from, best = -1;
    for (var i = from; i < days.length; i++) {
      if (vals[i] > 0) n++;
      if (vals[i] > 0 && (best < 0 || vals[i] > vals[best])) best = i;
    }
    var bestText = best < 0 ? '' : tr('weekBest', {
      d: days[best] === today ? tr('today').toLowerCase() : tr('days')[L.parseDay(days[best]).getDay()], v: L.fmt(vals[best])
    });
    if (m === 1) return '<b>' + esc(tr(n ? 'weekTodayUp' : 'weekTodayNot')) + '</b>';
    return '<b>' + esc(tr('weekOf', { n: n, m: m })) + '</b> · ' + esc(n ? bestText : tr('weekNoPlus'));
  }

  function mixText(p, m) {
    if (p + m === 1) return tr(p ? 'onePlus' : 'oneMinus');
    return m === 0 ? tr('allPlus') : p === 0 ? tr('allMinus') : tr('mix', { p: p, m: m });
  }
  function barH(v, max) { return v === 0 ? 6 : Math.max(8, Math.round(Math.abs(v) / max * 120)); }

  function viewJournal() {
    var today = L.dayKey(new Date()), mine = scope(), t = L.totals(mine);
    var days = L.lastDays(today, 7), vals = days.map(function (k) { return t[k] || 0; });
    var week = vals.reduce(function (a, b) { return a + b; }, 0);
    var max = Math.max.apply(null, [1].concat(vals.map(Math.abs)));
    var streak = L.currentStreak(t, today);
    var byDay = {};
    mine.forEach(function (e) { (byDay[e.day] = byDay[e.day] || []).push(e); });
    var keys = Object.keys(byDay).sort().reverse();

    var aria = tr('chartAria') + ': ' + days.map(function (k, i) {
      return tr('days')[L.parseDay(k).getDay()] + ' ' + L.fmt(vals[i]);
    }).join(', ');
    var cols = days.map(function (k, i) {
      var v = vals[i];
      return '<div class="col"><div class="col-v ' + (v < 0 ? 'neg' : v === 0 ? 'zero' : '') + '">' + L.fmt(v) + '</div>' +
        '<div class="bar ' + (v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero') + '" style="height:' + barH(v, max) + 'px"></div></div>';
    }).join('');
    var labels = days.map(function (k) {
      var short = tr('daysShort')[L.parseDay(k).getDay()];
      return k === today ? '<div class="is-today">' + esc(tr('todayShort') || short) + '</div>' : '<div>' + esc(short) + '</div>';
    }).join('');
    var line = weekLine(days, vals, keys, today);
    var rows = keys.map(function (k) {
      var list = byDay[k].slice().sort(function (a, b) { return b.ts - a.ts; });
      var p = list.filter(function (e) { return e.type === 'plus'; }).length, m = list.length - p;
      var open = !!openDays[k];
      return '<li><button type="button" class="row" data-act="day" data-day="' + k + '" data-focus="d-' + k + '" aria-expanded="' + open + '">' +
        '<span class="row-main"><span class="row-t">' + esc(dayTitle(k, today)) + '</span>' +
        '<span class="row-s">' + esc(count(list.length, tr('activity'))) + ' · ' + esc(mixText(p, m)) + '</span></span>' +
        '<span class="pill ' + kind(t[k]) + '">' + L.fmt(t[k]) + '</span></button>' +
        (open ? '<ul class="sub">' + list.map(rowEntry).join('') + '</ul>' : '') + '</li>';
    }).join('');

    return '' +
      head(esc(tr('journal')), esc(tr('last7'))) +
      '<section class="hero" aria-label="' + esc(tr('last7')) + '">' +
        '<div class="hero-top"><div class="hero-num sm ' + tone(week) + '" id="week-total">' + L.fmt(week) + '</div>' +
          (streak
            ? '<div class="hero-streak on" id="week-streak">' + ICON.flameFlat + esc(tr('streakOf', { x: count(streak, tr('day')) })) + '</div>'
            : '<div class="hero-streak" id="week-streak">' + esc(tr('noStreak')) + '</div>') +
        '</div>' +
        '<div class="chart" role="img" aria-label="' + esc(aria) + '">' + cols + '</div>' +
        '<div class="days" aria-hidden="true">' + labels + '</div>' +
        (line ? '<p class="hero-line" id="week-line">' + line + '</p>' : '') +
      '</section>' +
      '<section class="sect"><h2>' + esc(tr('byDay')) + '</h2>' +
        (keys.length
          ? '<ul class="rows" id="day-list">' + rows + '</ul>'
          : '<div class="empty"><p class="empty-t">' + esc(tr('emptyJournal')) + '</p><p class="empty-s">' + esc(tr('emptyJournalHint')) + '</p></div>') +
      '</section>';
  }

  function cheersText(it) {
    var n = it.cheers || 0;
    if (!n) return tr(it.mine ? 'cheersNone' : it.type === 'minus' ? 'beFirstMinus' : 'beFirst');
    if (it.cheered) return n === 1 ? tr('cheersMine1') : tr('cheersMine', { x: count(n, tr('cheerForms')) });
    return count(n, tr('cheerForms'));
  }

  function postTitle(it) { return it.key ? (tr('fav')[it.key] || it.key) : it.name; }

  function viewFeed() {
    var body;
    if (!feed.ready && feed.error) {
      body = '<div class="empty feed"><p class="empty-t">' + esc(tr(feed.error === 'offline' ? 'feedOffline' : 'feedError')) + '</p>' +
        '<button type="button" class="link" data-act="feed-refresh" data-focus="feed-retry">' + esc(tr('retry')) + '</button></div>';
    } else if (!feed.ready) {
      body = '<p class="note feed" id="feed-loading">' + esc(tr('loading')) + '</p>';
    } else if (!feed.items.length) {
      body = '<div class="empty feed" id="feed-empty"><p class="empty-t">' + esc(tr('feedEmpty')) + '</p><p class="empty-s">' + esc(tr('feedEmptyHint')) + '</p></div>';
    } else {
      body = '<ul class="feed" id="feed-list">' + feed.items.map(function (it) {
        var sign = it.type === 'minus' ? -it.pts : it.pts;
        /* Adresa pozei vine de la server; se foloseste doar daca arata cum trebuie. */
        if (it.photo && !PHOTO.size(it.photo)) it.photo = null;
        return '<li class="post" data-post="' + esc(it.id) + '">' +
          '<div class="post-top"><span class="post-who"><b>' + esc(it.author) + '</b>' +
            (typeof it.score === 'number' ? ' <span class="post-score ' + kind(it.score) + '" title="' + esc(tr('postScoreTitle')) + '">' + esc(tr('postScore', { x: L.fmt(it.score) })) + '</span>' : '') +
            ' · ' + esc(ago(Number(it.ts))) + '</span>' +
            '<span class="pill ' + (it.type === 'minus' ? 'minus' : 'plus') + '">' + L.fmt(sign) + '</span></div>' +
          (it.note || it.photo
            ? '<button type="button" class="post-t post-more" data-act="post-note" data-id="' + esc(it.id) + '" data-focus="n-' + esc(it.id) + '" aria-expanded="' + !!openNotes[it.id] + '">' +
                esc(postTitle(it)) + marks(it) + '</button>' +
              (openNotes[it.id] && it.note ? '<p class="post-note">' + esc(it.note) + '</p>' : '') +
              (openNotes[it.id] && it.photo ? shotBox(it.photo, it.photo) : '')
            : '<div class="post-t">' + esc(postTitle(it)) + '</div>') +
          '<div class="post-bot"><span class="post-n">' + esc(cheersText(it)) + '</span>' +
            (it.mine
              ? '<span class="post-n">' + esc(tr('yours')) + '</span>'
              : '<button type="button" class="cheer" aria-pressed="' + !!it.cheered + '" data-act="cheer" data-id="' + esc(it.id) + '" data-focus="c-' + esc(it.id) + '">' +
                ICON.starLine + esc(tr(it.type === 'minus' ? (it.cheered ? 'cheeredMinus' : 'cheerMinus') : (it.cheered ? 'cheered' : 'cheer'))) + '</button>') +
          '</div></li>';
      }).join('') + '</ul>' +
        (feed.error ? '<p class="note feed">' + esc(tr(feed.error === 'offline' ? 'feedOffline' : 'feedError')) + '</p>' : '') +
        (feed.done ? '' : '<div class="center"><button type="button" class="link" data-act="feed-more" data-focus="feed-more">' + esc(tr(feed.loading ? 'loading' : 'moreFeed')) + '</button></div>');
    }
    return '' +
      head(esc(tr('feed')), esc(tr('feedSub'))) +
      '<section class="gold" aria-label="' + esc(tr('cheersGot')) + '"><div><div class="gold-t">' + esc(tr('cheersGot')) + '</div><div class="gold-s">' + esc(tr('cheersGotSub')) + '</div></div>' +
        '<div class="gold-n" id="cheers-got">' + ICON.starFlat + myCheers() + '</div></section>' +
      viewPulse() +
      /* Fluxul arata doar activitatile in limba aleasa in aplicatie; limba se schimba din Profil. */
      '<div class="feed-bar">' +
        '<button type="button" class="link" data-act="feed-refresh" data-focus="feed-refresh">' + esc(tr(feed.loading && feed.ready ? 'loading' : 'refresh')) + '</button>' +
      '</div>' + body;
  }

  function favList(type) {
    var favs = data.favs.filter(function (f) { return f.type === type; });
    if (!favs.length) return '<p class="note">' + esc(tr('noFavsProfile')) + '</p>';
    return '<ul class="rows">' + favs.map(function (f) {
      var n = favName(f);
      return '<li class="row"><span class="row-main"><span class="row-t">' + esc(n) + '</span></span>' +
        '<span class="row-end"><span class="pill ' + f.type + '">' + L.fmt(f.type === 'minus' ? -f.pts : f.pts) + '</span>' +
        '<button type="button" class="icon-btn" data-act="unfav" data-id="' + esc(f.id) + '" aria-label="' + esc(tr('removeFav', { x: n })) + '">' + ICON.x + '</button></span></li>';
    }).join('') + '</ul>';
  }

  function langButtons() {
    return '<button type="button" class="seg-b" aria-pressed="' + (lang === 'ro') + '" data-act="lang" data-lang="ro" data-focus="lang-ro">Română</button>' +
      '<button type="button" class="seg-b" aria-pressed="' + (lang === 'en') + '" data-act="lang" data-lang="en" data-focus="lang-en">English</button>';
  }

  function syncStatus() {
    var n = pendingCount();
    if (!n) return tr('syncOk');
    if (syncErr === 'offline' || (!syncErr && pumpFails && pumpOffline)) return tr('syncWait', { x: count(n, tr('changeForms')) }) + ' ' + tr('syncOffline');
    if (syncErr || pumpFails) return tr('syncWait', { x: count(n, tr('changeForms')) }) + ' ' + tr('syncProblem');
    return tr('syncWait', { x: count(n, tr('changeForms')) });
  }

  function viewProfile() {
    var top = !BACKEND ? '' :
      '<section class="sect"><h2>' + esc(tr('account')) + '</h2>' +
        '<div class="kv"><span class="kv-k">' + esc(tr('nameRow')) + '</span><span class="kv-end"><span class="kv-v" id="my-name">' + esc(data.name) + '</span>' +
          '<a class="link" href="#nume" data-route="nume">' + esc(tr('change')) + '</a></span></div>' +
        '<div class="kv"><span class="kv-k">' + esc(tr('email')) + '</span><span class="kv-v" id="my-email">' + esc(data.email) + '</span></div>' +
      '</section>';
    var bottom = BACKEND
      ? '<section class="sect"><h2>' + esc(tr('syncTitle')) + '</h2><p class="note" id="sync-status">' + esc(syncStatus()) + '</p>' +
          (syncErr && syncErr !== 'offline' ? '<p class="err-detail">' + esc(syncErr) + '</p>' : '') +
          (photoErr ? '<p class="err-detail" id="photo-err">' + esc(tr('photo') + ': ' + photoErr) + '</p>' : '') +
          '<div class="btns"><button type="button" class="btn-line calm" data-act="sync-now" data-focus="sync-now">' + esc(tr('syncNow')) + '</button></div></section>' +
        '<section class="sect"><div class="btns">' +
          '<button type="button" class="btn-line calm" data-act="signout" data-focus="signout">' + esc(tr('signOut')) + '</button>' +
          '<button type="button" class="btn-line" data-act="delete-account" data-focus="delete-account">' + esc(tr('deleteAccount')) + '</button></div></section>'
      : '<section class="sect"><h2>' + esc(tr('yourData')) + '</h2><p class="note">' + esc(tr('dataNote')) + '</p>' +
          '<button type="button" class="btn-line" data-act="reset" data-focus="reset">' + esc(tr('resetAll')) + '</button></section>';
    return '' +
      head(esc(tr('profile')), esc(tr('version', { x: VERSION }))) +
      top +
      '<section class="sect"><h2 id="lang-h">' + esc(tr('language')) + '</h2>' +
        '<div class="seg" role="group" aria-labelledby="lang-h">' + langButtons() + '</div></section>' +
      showSection() +
      eduSection() +
      '<section class="sect"><h2>' + esc(tr('favsPlus')) + '</h2>' + favList('plus') + '</section>' +
      '<section class="sect"><h2>' + esc(tr('favsMinus')) + '</h2>' + favList('minus') + '</section>' +
      bottom;
  }

  /* Scorul zilei la vedere, in Profil: o bifa, oprita pentru toata lumea pana nu o pune omul. */
  function showSection() {
    if (!showOn()) return '';
    return '<section class="sect" id="show"><h2>' + esc(tr('showTitle')) + '</h2>' +
      '<label class="check"><input type="checkbox" id="show-on"' + (data.show ? ' checked' : '') + '><span>' + esc(tr('showOn')) + '</span></label>' +
      '<p class="note">' + esc(tr('showSub')) + '</p></section>';
  }

  /* Modul educator, in Profil: o bifa si, cand e pornit, lista copiilor. */
  function eduSection() {
    if (!eduAvail()) return '';
    var kids = data.edu.on
      ? '<h3 class="sub-h">' + esc(tr('eduKids')) + '</h3>' +
        (data.edu.list.length
          ? '<ul class="rows" id="kid-list">' + data.edu.list.map(function (k) {
              return '<li class="row"><span class="row-main"><span class="row-t">' + esc(k.name) + '</span></span>' +
                '<button type="button" class="icon-btn" data-act="kid-remove" data-id="' + esc(k.id) + '" data-focus="kr-' + esc(k.id) + '" aria-label="' + esc(tr('kidRemove', { x: k.name })) + '">' + ICON.x + '</button></li>';
            }).join('') + '</ul>'
          : '<p class="note" id="kid-none">' + esc(tr('eduNoKids')) + '</p>') +
        (data.edu.list.length < KIDS_MAX ? '<a class="link" href="#copil" data-route="copil" data-focus="kid-add">' + esc(tr('kidAdd')) + '</a>' : '<p class="note">' + esc(tr('kidsMax')) + '</p>') +
        (data.edu.list.length ? '<p class="rep-link"><a class="link" href="#raport" data-route="raport" data-focus="report">' + esc(tr('reportLink')) + '</a></p>' : '')
      : '';
    return '<section class="sect" id="edu"><h2>' + esc(tr('eduTitle')) + '</h2>' +
      '<label class="check"><input type="checkbox" id="edu-on"' + (data.edu.on ? ' checked' : '') + '><span>' + esc(tr('eduOn')) + '</span></label>' +
      '<p class="note">' + esc(tr('eduSub')) + ' <a class="link" href="ghid.html" target="_blank" rel="noopener" data-focus="guide">' + esc(tr('eduGuide')) + '</a></p>' + kids + '</section>';
  }

  /* ---------- raportul lunar al educatorului ---------- */

  /* Cerut de educatori (0.7.1): pentru fiecare copil, rezumatul lunii si activitatile ei, cu totul calculat din datele de pe
     dispozitiv. Copiii sunt asezati dupa totalul lunii, cel mai mare primul. Se salveaza ca PDF prin tiparirea paginii
     (fiecare copil pe pagina lui) sau se descarca un CSV pentru Excel. */
  function monthLabel(ym) { return tr('months')[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4); }
  function shortDate(day) { var d = L.parseDay(day); return tr('days')[d.getDay()] + ', ' + d.getDate() + ' ' + tr('months')[d.getMonth()]; }

  function reportKids(ym) {
    var kids = data.edu.list.map(function (k, i) {
      return { k: k, i: i, st: L.monthStats(data.entries.filter(function (e) { return e.kid === k.id; }), ym) };
    });
    kids.sort(function (a, b) { return b.st.total - a.st.total || a.i - b.i; });
    return kids;
  }

  function viewReport() {
    var ym = report.month, now = L.monthOf(L.dayKey(new Date())), kids = reportKids(ym), any = false;
    kids.forEach(function (x) { if (x.st.count) any = true; });
    var cards = kids.map(function (x) {
      var st = x.st;
      var sum = st.count
        ? '<p class="rep-line">' + esc(tr('weekOf', { n: st.up, m: st.days })) + '</p>' +
          (st.best ? '<p class="rep-line">' + esc(tr('weekBest', { d: shortDate(st.best), v: L.fmt(st.bestVal) })) + '</p>' : '') +
          (st.streak > 1 ? '<p class="rep-line">' + esc(tr('reportStreak', { x: count(st.streak, tr('day')) })) + '</p>' : '') +
          '<p class="rep-line">' + esc(count(st.count, tr('activity'))) + '</p>'
        : '<p class="rep-line">' + esc(tr('reportEmpty')) + '</p>';
      var rows = st.list.map(function (e) {
        var pts = L.signed(e);
        return '<li class="row"><span class="row-main"><span class="row-s">' + esc(shortDate(e.day)) + ' · ' + esc(timeOf(e.ts)) + '</span>' +
          '<span class="row-t">' + esc(nameOf(e)) + '</span>' + (e.note ? '<span class="rep-note">' + esc(e.note) + '</span>' : '') + '</span>' +
          '<span class="pill ' + kind(pts) + '">' + L.fmt(pts) + '</span></li>';
      }).join('');
      return '<section class="rep-kid"><div class="rep-top"><h2>' + esc(x.k.name) + '</h2><span class="pill big ' + kind(st.total) + '">' + L.fmt(st.total) + '</span></div>' +
        sum + (rows ? '<ul class="rows rep-list">' + rows + '</ul>' : '') + '</section>';
    }).join('');
    return '' +
      head(esc(tr('reportTitle')), '', '<a class="icon-btn" href="#profil" data-route="profil" data-replace="1" aria-label="' + esc(tr('close')) + '">' + ICON.close + '</a>') +
      '<div class="pad">' +
        '<p class="rep-print">' + esc(tr('reportTitle')) + ' · ' + esc(data.name || '') + '</p>' +
        '<div class="month-nav">' +
          '<button type="button" class="round" data-act="rep-prev" data-focus="rep-prev" aria-label="' + esc(tr('reportPrev')) + '">‹</button>' +
          '<span class="month-name" id="rep-month">' + esc(monthLabel(ym)) + '</span>' +
          '<button type="button" class="round" data-act="rep-next" data-focus="rep-next" aria-label="' + esc(tr('reportNext')) + '"' + (ym >= now ? ' disabled' : '') + '>›</button>' +
        '</div>' +
        '<div class="rep-actions">' +
          '<button type="button" class="btn-line calm" data-act="rep-print" data-focus="rep-print">' + esc(tr('reportPdf')) + '</button>' +
          '<button type="button" class="btn-line calm" data-act="rep-csv" data-focus="rep-csv"' + (any ? '' : ' disabled') + '>' + esc(tr('reportCsv')) + '</button>' +
        '</div>' +
        (kids.length ? cards : '<p class="note">' + esc(tr('eduNoKids')) + '</p>') +
      '</div>';
  }

  function csvCell(v) {
    var s = String(v == null ? '' : v);
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function reportCsv(ym) {
    var lines = [tr('csvHead').map(csvCell).join(';')];
    reportKids(ym).forEach(function (x) {
      x.st.list.forEach(function (e) {
        var d = L.parseDay(e.day);
        lines.push([x.k.name, L.pad(d.getDate()) + '.' + L.pad(d.getMonth() + 1) + '.' + d.getFullYear(), timeOf(e.ts),
          tr(e.type === 'minus' ? 'addBad' : 'addGood'), nameOf(e), L.signed(e), e.note || ''].map(csvCell).join(';'));
      });
    });
    return '\ufeff' + lines.join('\r\n') + '\r\n';
  }

  function downloadCsv(ym) {
    try {
      var blob = new Blob([reportCsv(ym)], { type: 'text/csv;charset=utf-8' });
      var url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url;
      link.download = 'raport-' + ym + '.csv';
      document.body.appendChild(link);
      link.click();
      setTimeout(function () { document.body.removeChild(link); URL.revokeObjectURL(url); }, 1000);
    } catch (e) { toast(tr('reportCsvFail')); }
  }

  function shiftMonth(n) {
    var now = L.monthOf(L.dayKey(new Date())), ym = L.addMonths(report.month, n);
    if (ym > now) ym = now;
    report.month = ym;
    render();
    focusTitle();
  }

  /* Ecranul pe care se adauga un copil. */
  function viewKid() {
    return '' +
      head(esc(tr('kidNew')), '', '<a class="icon-btn" href="#' + kidForm.back + '" data-route="' + kidForm.back + '" data-replace="1" aria-label="' + esc(tr('close')) + '">' + ICON.close + '</a>') +
      '<div class="pad"><form id="kid-form" novalidate>' +
        '<div class="field"><label for="kid-input">' + esc(tr('kidNameLabel')) + '</label>' +
          '<input id="kid-input" name="kid" type="text" maxlength="20" autocomplete="off" autocapitalize="words" enterkeyhint="done" value="' + esc(kidForm.value) + '" aria-describedby="kid-hint">' +
          '<p class="hint" id="kid-hint">' + esc(tr('kidNameHint')) + '</p>' +
          '<p class="err" id="kid-err" role="alert"' + (kidForm.error ? '' : ' hidden') + '>' + esc(kidForm.error ? tr(kidForm.error) : '') + '</p></div>' +
        '<div class="go"><button type="submit" class="save" id="kid-btn">' + esc(tr('kidAdd')) + '</button></div>' +
      '</form></div>';
  }

  function submitKid() {
    var el = byId('kid-input');
    var v = (el ? el.value : kidForm.value).replace(/\s+/g, ' ').trim();
    kidForm.value = v;
    var taken = data.edu.list.some(function (k) { return fold(k.name) === fold(v); });
    var bad = !v || v.length > 20 || /[<>]/.test(v) ? 'kidNameInvalid' : taken ? 'kidNameTaken' : data.edu.list.length >= KIDS_MAX ? 'kidsMax' : '';
    if (bad) {
      kidForm.error = bad;
      var err = byId('kid-err');
      if (err) { err.textContent = tr(bad); err.hidden = false; }
      if (el) el.focus();
      return;
    }
    var kid = { id: uuid(), name: v };
    data.edu.list.push(kid);
    data.edu.on = true;
    data.eduRev++;
    data.who = kid.id;
    persist();
    var back = kidForm.back;
    kidForm = { value: '', error: '', back: 'profil' };
    navigate(back, true);
    toast(tr('kidAdded', { x: kid.name }));
    queueSync();
  }

  /* Alegerea celui pentru care se noteaza, din butonul de sus: Eu, copiii, Adauga copil.
     Lista "Pentru cine?" este si privirea de ansamblu: langa fiecare nume, scorul de azi si seria pe plus.
     Ordinea de baza este cea in care au fost adaugati copiii; educatorii au cerut (0.7.1) si asezarea dupa scorul de azi,
     cel mai mare primul, la o apasare pe "dupa scor", tinuta minte pe dispozitiv (data.whoSort). Eu ramane mereu primul. */
  function whoStats(id) {
    var today = L.dayKey(new Date());
    var t = L.totals(data.entries.filter(function (e) { return (e.kid || null) === (id || null); }));
    return { total: t[today] || 0, streak: L.currentStreak(t, today) };
  }

  function whoRow(id, label, on, st) {
    return '<button type="button" class="row" data-act="who-pick" data-id="' + esc(id) + '" aria-pressed="' + on + '">' +
      '<span class="row-main"><span class="row-t">' + esc(label) + (on ? ' <span class="who-on" aria-hidden="true">✓</span>' : '') + '</span>' +
        (st.streak > 0 ? '<span class="row-s who-streak">' + ICON.flameFlat + esc(count(st.streak, tr('day'))) + '</span>' : '') + '</span>' +
      '<span class="pill ' + kind(st.total) + '">' + L.fmt(st.total) + '</span></button>';
  }

  function whoList() {
    var who = whoNow(), byScore = data.whoSort === 'score';
    var kids = data.edu.list.map(function (k, i) { return { k: k, i: i, st: whoStats(k.id) }; });
    if (byScore) kids.sort(function (a, b) { return b.st.total - a.st.total || a.i - b.i; });
    var rows = [whoRow('', tr('me'), !who, whoStats(null))];
    kids.forEach(function (x) { rows.push(whoRow(x.k.id, x.k.name, who === x.k.id, x.st)); });
    return (kids.length > 1
      ? '<div class="who-sort"><button type="button" class="chip-btn" data-act="who-sort" aria-pressed="' + byScore + '">' + esc(tr('whoByScore')) + '</button></div>'
      : '') + rows.join('') +
      (data.edu.list.length < KIDS_MAX ? '<button type="button" class="link dlg-link" data-act="kid-new">' + esc(tr('kidAdd')) + '</button>' : '');
  }

  function openWho() {
    openDialog({ title: tr('whoFor'), cancel: tr('close'), list: whoList() });
  }

  function toggleWhoSort() {
    data.whoSort = data.whoSort === 'score' ? 'added' : 'score';
    persist();
    var list = byId('dlg-l');
    if (list && dlg.open) {
      list.innerHTML = whoList();
      var b = list.querySelector('[data-act="who-sort"]');
      if (b) b.focus({ preventScroll: true });
    }
  }

  function pickWho(id) {
    data.who = id && findKid(id) ? id : null;
    /* Un formular de notare deja deschis trece si el la cel ales. */
    if (isAddRoute(route)) {
      add.kid = whoNow();
      if (add.kid) add.pub = false;
      saveDraft();
    }
    persist();
    render();
    focusTitle();
  }

  /* Un copil scos pleaca din lista cu tot cu activitatile lui, de pe dispozitiv si din cont. */
  function askRemoveKid(id) {
    var kid = findKid(id);
    if (!kid) return;
    openDialog({
      title: tr('kidRemoveTitle', { x: kid.name }), body: tr('kidRemoveBody', { x: kid.name }), ok: tr('kidRemoveOk'), cancel: tr('cancel'),
      onOk: function () {
        data.entries.filter(function (e) { return e.kid === id; }).forEach(function (e) {
          if (BACKEND) {
            data.outbox.note = data.outbox.note.filter(function (op) { return op.id !== e.id; });
            data.outbox.photo = data.outbox.photo.filter(function (op) { return op.id !== e.id; });
            if (e.photo) releaseFile(e.photo);
            data.outbox.del.push(e.id);
          }
        });
        data.entries = data.entries.filter(function (e) { return e.kid !== id; });
        data.edu.list = data.edu.list.filter(function (k) { return k.id !== id; });
        data.eduRev++;
        if (data.who === id) data.who = null;
        persist();
        render();
        focusTitle();
        toast(tr('kidRemoved'));
        queueSync();
      }
    });
  }

  function brand() {
    return '<header class="head head-add"><h1 id="title" tabindex="-1">Scorul zilei</h1>' +
      '<div class="langs" role="group" aria-label="Limbă / Language">' +
        '<button type="button" aria-pressed="' + (lang === 'ro') + '" data-act="lang" data-lang="ro" data-focus="lang-ro">RO</button>' +
        '<button type="button" aria-pressed="' + (lang === 'en') + '" data-act="lang" data-lang="en" data-focus="lang-en">EN</button>' +
      '</div></header>' +
      '<section class="brand"><p class="brand-t">' + esc(tr('tagline')) + '</p><p class="brand-s">' + esc(tr('tagline2')) + '</p></section>';
  }

  function viewLoading() {
    return brand() + '<div class="pad"><p class="note top" id="boot-wait">' + esc(tr('wait')) + '</p></div>';
  }

  function viewAuth() {
    var up = authForm.mode === 'up';
    return brand() +
      '<div class="pad">' +
        '<div class="seg" role="group" aria-label="' + esc(tr('account')) + '">' +
          '<button type="button" class="seg-b" aria-pressed="' + !up + '" data-act="auth-mode" data-mode="in" data-focus="mode-in">' + esc(tr('signIn')) + '</button>' +
          '<button type="button" class="seg-b" aria-pressed="' + up + '" data-act="auth-mode" data-mode="up" data-focus="mode-up">' + esc(tr('signUp')) + '</button>' +
        '</div>' +
        '<form id="auth-form" novalidate>' +
          '<div class="field"><label for="auth-email">' + esc(tr('email')) + '</label>' +
            '<input id="auth-email" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" value="' + esc(authForm.email) + '"></div>' +
          '<div class="field"><label for="auth-pass">' + esc(tr('password')) + '</label>' +
            '<input id="auth-pass" name="password" type="password" autocomplete="' + (up ? 'new-password' : 'current-password') + '"' + (up ? ' aria-describedby="pass-hint"' : '') + '>' +
            (up ? '<p class="hint" id="pass-hint">' + esc(tr('passHint')) + '</p>' : '') + '</div>' +
          '<div class="msgs">' +
            '<p class="info" id="auth-info" role="status"' + (authForm.info ? '' : ' hidden') + '>' + esc(authForm.info ? tr(authForm.info) : '') + '</p>' +
            '<p class="err" id="auth-err" role="alert"' + (authForm.error ? '' : ' hidden') + '>' + esc(authForm.error ? tr(authForm.error) : '') + '</p>' +
            '<p class="err-detail" id="auth-detail"' + (authForm.detail ? '' : ' hidden') + '>' + esc(authForm.detail || '') + '</p>' +
          '</div>' +
          '<div class="go"><button type="submit" class="save" id="auth-btn"' + (authForm.busy ? ' disabled' : '') + '>' +
            esc(authForm.busy ? tr('wait') : tr(up ? 'createAccount' : 'signIn')) + '</button></div>' +
        '</form>' +
        (up ? '<p class="note top">' + esc(tr('privacyNote')) + '</p>' : '') +
      '</div>';
  }

  function viewName(first) {
    return '' +
      '<header class="head head-add"><h1 id="title" tabindex="-1">' + esc(tr(first ? 'chooseName' : 'changeName')) + '</h1>' +
        (first ? '' : '<a class="icon-btn" href="#profil" data-route="profil" data-replace="1" aria-label="' + esc(tr('close')) + '">' + ICON.close + '</a>') +
      '</header>' +
      '<div class="pad"><form id="name-form" novalidate>' +
        '<div class="field"><label for="name-input">' + esc(tr('nameLabel')) + '</label>' +
          '<input id="name-input" name="nickname" type="text" maxlength="20" autocomplete="nickname" autocapitalize="words" enterkeyhint="done" value="' + esc(nameForm.value) + '" aria-describedby="name-hint">' +
          '<p class="hint" id="name-hint">' + esc(tr('nameHint')) + '</p>' +
          '<p class="err" id="pname-err" role="alert"' + (nameForm.error ? '' : ' hidden') + '>' + esc(nameForm.error ? tr(nameForm.error) : '') + '</p></div>' +
        '<div class="go"><button type="submit" class="save" id="name-btn"' + (nameForm.busy ? ' disabled' : '') + '>' +
          esc(nameForm.busy ? tr('wait') : tr(first ? 'next' : 'saveName')) + '</button></div>' +
      '</form>' +
      (first ? '<div class="center"><button type="button" class="link" data-act="signout" data-focus="signout">' + esc(tr('signOut')) + '</button></div>' : '') +
      '</div>';
  }

  function viewNote() {
    var e = findEntry(noteForm.id), today = L.dayKey(new Date());
    if (!e) return '';
    return '' +
      '<header class="head head-add"><h1 id="title" tabindex="-1">' + esc(tr(photosOn() ? 'moreTitle' : 'details')) + '</h1>' +
        '<a class="icon-btn" href="#' + noteForm.back + '" data-route="' + noteForm.back + '" data-replace="1" aria-label="' + esc(tr('close')) + '">' + ICON.close + '</a></header>' +
      '<div class="pad"><form id="note-form" novalidate>' +
        '<p class="note-of"><b>' + esc(nameOf(e)) + '</b> · ' + esc(L.fmt(L.signed(e)) + ' · ' + dayTitle(e.day, today) + ', ' + timeOf(e.ts)) + '</p>' +
        noteField('note-input', noteForm.value, (BACKEND ? tr('detailsWho') + ' ' : '') + tr('detailsEmpty'), true) +
        (photosOn() ? photoRow('note', formShot(noteForm)[0], formShot(noteForm)[1], noteForm.picBusy) : '') +
        '<div class="go"><button type="submit" class="save" id="note-btn">' + esc(tr(photosOn() ? 'save' : 'saveDetails')) + '</button></div>' +
      '</form></div>';
  }

  /* ---------- afisare ---------- */

  function renderNav(hidden) {
    navEl.hidden = hidden;
    navEl.setAttribute('aria-label', tr('sections'));
    var labels = { azi: 'today', jurnal: 'journal', flux: 'feed', profil: 'profile' };
    navEl.innerHTML = '<div class="nav-in">' + MAIN.map(function (r) {
      var dot = r === 'flux' && route !== 'flux' && feedNew();
      return '<a href="#' + r + '" data-route="' + r + '"' + (route === r ? ' aria-current="page"' : '') +
        (dot ? ' aria-label="' + esc(tr(labels[r]) + ', ' + tr('feedNew')) + '"' : '') + '><span>' + esc(tr(labels[r])) +
        (dot ? '<i class="nav-dot" aria-hidden="true"></i>' : '') + '</span></a>';
    }).join('') + '</div>';
  }

  function render() {
    var act = document.activeElement, fkey = null, fid = null, caret = null;
    if (act && viewEl.contains(act)) {
      fkey = act.getAttribute('data-focus');
      if ((act.tagName === 'INPUT' || act.tagName === 'TEXTAREA') && act.id && act.type !== 'checkbox') {
        fid = act.id;
        try { caret = [act.selectionStart, act.selectionEnd]; } catch (e) { caret = null; }
      }
    }
    shownDay = L.dayKey(new Date());
    if (route === 'detalii' && !findEntry(noteForm.id)) {
      route = MAIN.indexOf(noteForm.back) >= 0 ? noteForm.back : 'azi';
      try { window.history.replaceState(null, '', '#' + route); } catch (e) { /* merge si fara istoric */ }
    }
    var gate = BACKEND && auth !== 'in';
    var adding = isAddRoute(route);
    var full = gate || adding || route === 'nume' || route === 'detalii' || route === 'copil' || route === 'raport';
    var html;
    if (gate) html = auth === 'out' ? viewAuth() : auth === 'name' ? viewName(true) : viewLoading();
    else if (adding) html = viewAdd();
    else if (route === 'jurnal') html = viewJournal();
    else if (route === 'flux') html = viewFeed();
    else if (route === 'profil') html = viewProfile();
    else if (route === 'nume') html = viewName(false);
    else if (route === 'copil') html = viewKid();
    else if (route === 'raport') html = viewReport();
    else if (route === 'detalii') html = viewNote();
    else html = viewToday();
    appEl.classList.toggle('is-add', full);
    shownFeed = !gate && route === 'flux' ? html : '';
    viewEl.innerHTML = html;
    renderNav(full);
    var areas = viewEl.querySelectorAll('textarea');
    for (var a = 0; a < areas.length; a++) grow(areas[a]);
    if (fid) {
      var inp = byId(fid);
      if (inp) {
        inp.focus({ preventScroll: true });
        if (caret && caret[0] != null) { try { inp.setSelectionRange(caret[0], caret[1]); } catch (e) { /* fara pozitie */ } }
      }
    } else if (fkey) {
      var el = viewEl.querySelector('[data-focus="' + fkey + '"]');
      if (el) el.focus({ preventScroll: true });
    }
  }

  /* Omul scrie chiar acum intr-un camp de pe ecran. */
  function typing() {
    var el = document.activeElement;
    return !!el && viewEl.contains(el) && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type !== 'checkbox'));
  }

  /* Un camp cu mai multe randuri creste odata cu textul, ca sa nu se deruleze in interiorul lui. */
  function grow(el) {
    el.style.height = 'auto';
    el.style.height = (el.scrollHeight + 3) + 'px';
  }

  function focusEnd(id) {
    var el = byId(id);
    if (!el) return;
    el.focus();
    try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { /* fara pozitie */ }
  }

  function focusTitle() {
    var t = byId('title');
    if (t) t.focus({ preventScroll: true });
  }

  function hideToast() {
    clearTimeout(toastTimer);
    toastEl.hidden = true;
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 2400);
  }

  /* ---------- navigare ---------- */

  function routeFromHash() {
    var h = '';
    try { h = (window.location.hash || '').replace(/^#/, ''); } catch (e) { h = ''; }
    /* Ecranul de detalii are sens doar pentru o activitate aleasa; la o reincarcare a paginii nu mai exista una. */
    if (h === 'detalii' && !findEntry(noteForm.id)) return 'azi';
    return ROUTES.indexOf(h) >= 0 ? h : 'azi';
  }

  function resetAdd(type) {
    var kid = whoNow();
    add = { type: type, favId: null, name: '', pts: 10, keep: false, pub: !kid && type === 'plus' && !!data.pubDefault, note: '', noteOpen: false, pic: null, picBusy: false, kid: kid };
  }

  function enter(r) {
    if (r !== route && (isAddRoute(route) || route === 'detalii')) leaveForm(route);
    if (isAddRoute(r)) resetAdd(r);
    if (r === 'nume') nameForm = { value: data.name, busy: false, error: '' };
    if (r === 'copil') kidForm = { value: '', error: '', back: MAIN.indexOf(route) >= 0 ? route : 'azi' };
    if (r === 'raport') report.month = L.monthOf(L.dayKey(new Date()));
    route = r;
    hideToast();
    if (r === 'flux' && auth === 'in') { openFeed(); if (feed.ready) markFeedSeen(); }
  }

  function navigate(r, replace) {
    if (ROUTES.indexOf(r) < 0 || (r === 'detalii' && !findEntry(noteForm.id)) || ((r === 'copil' || r === 'raport') && !eduAvail())) r = 'azi';
    if (r === route && MAIN.indexOf(r) >= 0) {
      window.scrollTo(0, 0);
      if (r === 'flux' && auth === 'in') loadFeed(true);
      return;
    }
    enter(r);
    try { window.history[replace ? 'replaceState' : 'pushState'](null, '', '#' + r); } catch (e) { /* merge si fara istoric */ }
    render();
    window.scrollTo(0, 0);
    focusTitle();
  }

  function onHistory() {
    var r = routeFromHash();
    if (r === route) return;
    enter(r);
    render();
  }

  /* ---------- dialog ---------- */

  function openDialog(o) {
    dlgOpener = document.activeElement;
    dlgOk = o.onOk;
    dlgExtra = o.extra ? o.extra.fn : null;
    byId('dlg-t').textContent = o.title;
    var body = byId('dlg-b');
    body.textContent = o.body || '';
    body.hidden = !o.body;
    var note = byId('dlg-n');
    note.textContent = o.note || '';
    note.hidden = !o.note;
    var pic = byId('dlg-p');
    pic.innerHTML = o.shot ? shotBox(o.shot, o.shot) : '';
    pic.hidden = !o.shot;
    dlgLink = o.link ? o.link.fn : null;
    var link = byId('dlg-link');
    link.textContent = o.link ? o.link.label : '';
    link.hidden = !o.link;
    var extra = byId('dlg-extra');
    extra.textContent = o.extra ? o.extra.label : '';
    extra.hidden = !o.extra;
    var list = byId('dlg-l');
    list.innerHTML = o.list || '';
    list.hidden = !o.list;
    byId('dlg-ok').textContent = o.ok || '';
    byId('dlg-ok').hidden = !o.ok;
    byId('dlg-cancel').textContent = o.cancel;
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    byId('dlg-cancel').focus();
  }

  function closeDialog() {
    if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
  }

  /* ---------- actiuni ---------- */

  /* Actualizeaza formularul fara sa il redeseneze, ca sa nu se piarda cursorul din campul de text. */
  function syncAdd() {
    var chips = viewEl.querySelectorAll('.chip');
    for (var i = 0; i < chips.length; i++) chips[i].setAttribute('aria-pressed', String(chips[i].getAttribute('data-id') === add.favId));
    var keep = byId('keep-row');
    if (keep) keep.hidden = !keepVisible();
    var val = byId('pts-val');
    if (val) val.textContent = add.pts;
    var save = byId('save-btn');
    if (save) save.textContent = saveLabel();
  }

  function touchFavs() {
    data.favsRev++;
    persist();
    queueSync();
  }

  function saveAdd() {
    var input = byId('act-name'), area = byId('act-note');
    if (add.picBusy) { toast(tr('photoBusy')); return; }
    if (input) add.name = input.value;
    if (area) add.note = area.value;
    var name = add.name.trim(), note = notesOn() ? L.cleanNote(add.note) : '';
    if (!name) {
      var err = byId('name-err');
      if (err) err.hidden = false;
      if (input) input.focus();
      return;
    }
    var fav = add.favId ? findFav(add.favId) : null;
    var entry = {
      id: uuid(), ts: Date.now(), day: L.dayKey(new Date()), type: add.type, pts: L.clampPts(add.pts),
      pub: BACKEND && !add.kid && !!add.pub, cheers: 0, sync: 1
    };
    if (add.kid && findKid(add.kid)) entry.kid = add.kid;
    if (fav && fav.key && favName(fav) === name) entry.key = fav.key; else entry.name = name;
    if (note) entry.note = note;
    if (add.pic && photosOn()) {
      entry.photo = add.pic.name;
      PHOTO.put(add.pic.name, add.pic.blob);
      data.uploads.push(add.pic.name);
      data.outbox.photo.push({ id: entry.id, photo: add.pic.name });
      adoptShot(add.pic.name);
    }
    data.entries.push(entry);
    if (add.keep && keepVisible()) {
      data.favs.push({ id: uuid(), type: add.type, name: name, pts: entry.pts });
      data.favsRev++;
    }
    if (BACKEND && add.type === 'plus' && !add.kid) data.pubDefault = !!add.pub;
    persist();
    navigate('azi', true);
    toast(L.fmt(L.signed(entry)) + ' · ' + nameOf(entry));
    queueSync();
    if (entry.photo) queuePump();
  }

  function removeEntry(id) {
    var e = findEntry(id);
    if (!e) return;
    data.entries = data.entries.filter(function (x) { return x.id !== id; });
    if (BACKEND) {
      data.outbox.vis = data.outbox.vis.filter(function (op) { return op.id !== id; });
      data.outbox.note = data.outbox.note.filter(function (op) { return op.id !== id; });
      data.outbox.photo = data.outbox.photo.filter(function (op) { return op.id !== id; });
      if (e.photo) releaseFile(e.photo);
      /* Stergerea pleaca intotdeauna si spre cont: activitatea poate fi acolo chiar daca raspunsul care o confirma s-a
         pierdut. Pe una necunoscuta contul nu o baga in seama, iar poza ei se sterge abia dupa ce contul a confirmat. */
      data.outbox.del.push(id);
    }
    persist();
    render();
    focusTitle();
    toast(tr('deleted'));
    queueSync();
  }

  function setVisibility(id, pub) {
    var e = findEntry(id);
    if (!e) return;
    e.pub = pub;
    if (e.sync !== 1 || inflight[id]) {
      data.outbox.vis = data.outbox.vis.filter(function (op) { return op.id !== id; });
      data.outbox.vis.push({ id: id, pub: pub });
    }
    persist();
    render();
    toast(tr(pub ? 'nowPublic' : 'nowPrivate'));
    queueSync();
  }

  function askEntry(id) {
    var e = findEntry(id);
    if (!e) return;
    var today = L.dayKey(new Date());
    var o = {
      title: nameOf(e),
      body: L.fmt(L.signed(e)) + ' · ' + dayTitle(e.day, today) + ', ' + timeOf(e.ts),
      ok: tr('del'), cancel: tr('close'),
      onOk: function () { removeEntry(id); }
    };
    if (e.note) o.note = e.note;
    if (e.photo && BACKEND) o.shot = data.uid + '/' + e.photo;
    if (photosOn()) o.link = { label: tr(e.note || e.photo ? 'moreEdit' : 'moreAdd'), fn: function () { openNote(id); } };
    else if (notesOn()) o.link = { label: tr(e.note ? 'editDetails' : 'addDetails'), fn: function () { openNote(id); } };
    if (BACKEND && !isKidEntry(e)) o.extra = { label: tr(e.pub ? 'makePrivate' : 'makePublic'), fn: function () { setVisibility(id, !e.pub); } };
    openDialog(o);
  }

  /* Deschide ecranul pe care se scriu sau se schimba detaliile unei activitati deja notate. */
  function openNote(id) {
    var e = findEntry(id);
    if (!e) return;
    noteForm = { id: id, value: e.note || '', back: MAIN.indexOf(route) >= 0 ? route : 'azi', photo: e.photo || '', pic: null, drop: false, picBusy: false };
    navigate('detalii');
    focusEnd('note-input');
    saveDraft();
  }

  /* Pune, schimba sau scoate poza unei activitati. pic este poza noua, deja micsorata, sau null pentru scoatere. */
  function setPhoto(id, pic) {
    var e = findEntry(id), old = e && e.photo;
    if (!e || (!pic && !old)) return false;
    if (pic) {
      e.photo = pic.name;
      PHOTO.put(pic.name, pic.blob);
      data.uploads.push(pic.name);
      adoptShot(pic.name);
    } else {
      delete e.photo;
    }
    if (old) releaseFile(old);
    data.outbox.photo = data.outbox.photo.filter(function (op) { return op.id !== id; });
    data.outbox.photo.push({ id: id, photo: pic ? pic.name : null });
    persist();
    queuePump();
    queueSync();
    return true;
  }

  /* Pune, schimba sau sterge detaliile unei activitati. Intoarce true daca s-a schimbat ceva. */
  function setNote(id, text) {
    var e = findEntry(id), note = L.cleanNote(text);
    if (!e || (e.note || '') === note) return false;
    if (note) e.note = note; else delete e.note;
    /* Ce a ajuns deja pe server, sau e chiar acum pe drum, primeste schimbarea separat; restul pleaca odata cu activitatea. */
    if (BACKEND && (e.sync !== 1 || inflight[id])) {
      data.outbox.note = data.outbox.note.filter(function (op) { return op.id !== id; });
      data.outbox.note.push({ id: id, note: note || null });
    }
    persist();
    queueSync();
    return true;
  }

  function submitNote() {
    var el = byId('note-input'), back = noteForm.back, id = noteForm.id;
    if (noteForm.picBusy) { toast(tr('photoBusy')); return; }
    var text = L.cleanNote(el ? el.value : noteForm.value);
    var changed = setNote(id, text);
    var pic = !photosOn() ? false : noteForm.pic ? setPhoto(id, noteForm.pic) : noteForm.drop ? setPhoto(id, null) : false;
    if (noteForm.pic && !photosOn()) forgetPick(noteForm.pic);
    noteForm = { id: null, value: '', back: 'azi', photo: '', pic: null, drop: false, picBusy: false };
    navigate(back, true);
    if (pic) toast(tr('changesSaved'));
    else if (changed) toast(tr(text ? 'detailsSaved' : 'detailsRemoved'));
  }

  function onClick(ev) {
    var target = ev.target;
    if (!target || !target.closest) return;
    var link = target.closest('a[data-route]');
    if (link) {
      ev.preventDefault();
      navigate(link.getAttribute('data-route'), link.hasAttribute('data-replace'));
      return;
    }
    var b = target.closest('[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act'), id = b.getAttribute('data-id');

    if (act === 'type') {
      add.type = b.getAttribute('data-type') === 'minus' ? 'minus' : 'plus';
      add.favId = null;
      add.pub = add.type === 'plus' && !!data.pubDefault;
      render();
      saveDraft();
    } else if (act === 'fav') {
      var f = findFav(id);
      if (!f) return;
      if (add.favId === id) { add.favId = null; add.name = ''; }
      else { add.favId = id; add.name = favName(f); add.pts = f.pts; }
      render();
      saveDraft();
    } else if (act === 'step') {
      add.pts = L.clampPts(add.pts + Number(b.getAttribute('data-d')));
      syncAdd();
      saveDraft();
    } else if (act === 'pub') {
      add.pub = b.getAttribute('data-v') === '1';
      render();
      saveDraft();
    } else if (act === 'note-open') {
      add.noteOpen = true;
      render();
      focusEnd('act-note');
      saveDraft();
    } else if (act === 'post-note') {
      openNotes[id] = !openNotes[id];
      render();
    } else if (act === 'pic-pick') {
      /* "Fa o poza": camera din aplicatie, cand browserul o poate porni; altfel, ca si la "Alege o poza", alegerea de
         fisiere a telefonului (cu capture, aceasta deschide aplicatia de camera). */
      var pf = b.getAttribute('data-form') === 'act' ? add : noteForm, cam = b.hasAttribute('data-cam');
      if (cam && CAM.supported()) openCamera(pf, b.getAttribute('data-focus') || '');
      else openChooser(pf, b.getAttribute('data-focus') || '', cam);
    } else if (act === 'pic-drop') {
      var form = b.getAttribute('data-form') === 'act' ? add : noteForm;
      if (form.pic) forgetPick(form.pic);
      form.pic = null;
      if (form === noteForm) form.drop = true;
      drawPicRow(b.getAttribute('data-form'), form);
      saveDraft();
    } else if (act === 'shot-retry') {
      var key = b.getAttribute('data-key');
      delete shots[key];
      needShot(key, key);
      shotReady(key);
    } else if (act === 'who-open') {
      openWho();
    } else if (act === 'who-pick') {
      closeDialog();
      pickWho(id);
    } else if (act === 'who-sort') {
      toggleWhoSort();
    } else if (act === 'rep-prev') {
      shiftMonth(-1);
    } else if (act === 'rep-next') {
      shiftMonth(1);
    } else if (act === 'rep-print') {
      try { window.print(); } catch (e) { /* fara tiparire */ }
    } else if (act === 'rep-csv') {
      downloadCsv(report.month);
    } else if (act === 'kid-new') {
      closeDialog();
      navigate('copil');
      focusEnd('kid-input');
    } else if (act === 'kid-remove') {
      askRemoveKid(id);
    } else if (act === 'entry') {
      askEntry(id);
    } else if (act === 'day') {
      var k = b.getAttribute('data-day');
      openDays[k] = !openDays[k];
      render();
    } else if (act === 'lang') {
      var before = lang;
      lang = b.getAttribute('data-lang') === 'en' ? 'en' : 'ro';
      data.lang = lang;
      persist();
      document.documentElement.lang = lang;
      var mail = byId('auth-email');
      if (mail) authForm.email = mail.value;
      render();
      if (BACKEND && auth === 'in' && before !== lang) { feed = newFeed(); feedFresh = 0; data.feedSeen = 0; peekAt = 0; persist(); }
    } else if (act === 'unfav') {
      data.favs = data.favs.filter(function (x) { return x.id !== id; });
      touchFavs();
      render();
      focusTitle();
      toast(tr('favRemoved'));
    } else if (act === 'reset') {
      openDialog({
        title: tr('resetTitle'), body: tr('resetBody'), ok: tr('resetOk'), cancel: tr('cancel'),
        onOk: function () {
          data = fresh();
          data.lang = lang;
          openDays = {};
          persist();
          render();
          focusTitle();
          toast(tr('resetDone'));
        }
      });
    } else if (act === 'demo-clear') {
      data.entries = [];
      data.demo = false;
      openDays = {};
      persist();
      render();
      focusTitle();
      toast(tr('demoCleared'));
    } else if (act === 'auth-mode') {
      var m = byId('auth-email');
      if (m) authForm.email = m.value;
      authForm.mode = b.getAttribute('data-mode') === 'up' ? 'up' : 'in';
      authForm.error = '';
      authForm.info = '';
      authForm.detail = '';
      render();
    } else if (act === 'signout') {
      askSignOut();
    } else if (act === 'delete-account') {
      askDeleteAccount();
    } else if (act === 'sync-now') {
      syncFails = 0;
      pumpFails = 0;
      queuePump(0);
      sync();
    } else if (act === 'pulse-join' || act === 'pulse-leave') {
      loadPulse(act === 'pulse-join');
      showFeed();
    } else if (act === 'feed-refresh') {
      loadFeed(true);
      if (pulseOn()) loadPulse(null);
      queueSync(0);
    } else if (act === 'feed-more') {
      loadFeed(false);
    } else if (act === 'cheer') {
      toggleCheer(id);
    }
  }

  function onInput(ev) {
    var el = ev.target;
    if (!el) return;
    if (el.id === 'auth-email') { authForm.email = el.value; return; }
    if (el.id === 'name-input') { nameForm.value = el.value; return; }
    if (el.id === 'kid-input') { kidForm.value = el.value; var ke = byId('kid-err'); if (ke) ke.hidden = true; return; }
    if (el.id === 'act-note' || el.id === 'note-input') {
      if (el.id === 'act-note') add.note = el.value; else noteForm.value = el.value;
      var left = byId(el.id + '-n');
      if (left) left.textContent = el.value.length + '/' + L.NOTE_MAX;
      grow(el);
      saveDraft();
      return;
    }
    if (el.id !== 'act-name') return;
    add.name = el.value;
    if (add.favId) {
      var f = findFav(add.favId);
      if (!f || favName(f) !== el.value) add.favId = null;
    }
    var err = byId('name-err');
    if (err) err.hidden = true;
    syncAdd();
    saveDraft();
  }

  function onSubmit(ev) {
    var id = ev.target && ev.target.id;
    if (id !== 'add-form' && id !== 'auth-form' && id !== 'name-form' && id !== 'note-form' && id !== 'kid-form') return;
    ev.preventDefault();
    if (id === 'add-form') saveAdd();
    else if (id === 'auth-form') submitAuth();
    else if (id === 'note-form') submitNote();
    else if (id === 'kid-form') submitKid();
    else submitName();
  }

  function start() {
    appEl = byId('app');
    viewEl = byId('view');
    navEl = byId('nav');
    toastEl = byId('toast');
    dlg = byId('dlg');

    initData();
    lang = pickLang();
    document.documentElement.lang = lang;
    var hash = '';
    try { hash = (window.location.hash || '').replace(/^#/, ''); } catch (e) { hash = ''; }
    restoreDraft(hash);
    route = routeFromHash();
    if (isAddRoute(route) && !draftUsed) resetAdd(route);
    if (route === 'nume') nameForm.value = data.name;

    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('change', function (ev) {
      if (ev.target && ev.target.id === 'keep-fav') { add.keep = ev.target.checked; saveDraft(); }
      if (ev.target && ev.target.id === 'edu-on') {
        data.edu.on = ev.target.checked;
        data.eduRev++;
        if (!data.edu.on) data.who = null;
        persist();
        render();
        queueSync();
      }
      if (ev.target && ev.target.id === 'show-on') {
        data.show = ev.target.checked;
        data.showRev++;
        persist();
        queueSync();
      }
      if (ev.target && ev.target.id === 'pic-file') pickPhoto(ev.target);
    });
    document.addEventListener('submit', onSubmit);
    window.addEventListener('popstate', onHistory);
    window.addEventListener('hashchange', onHistory);
    window.addEventListener('online', function () {
      syncFails = 0;
      pumpFails = 0;
      queueSync(200);
      queuePump(400);
      if (BACKEND && auth === 'in' && route === 'flux') { feed.fails = 0; openFeed(); }
    });
    /* La revenirea in aplicatie se recalculeaza ziua curenta si se aduc noutatile din cont. */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden || (BACKEND && auth !== 'in')) return;
      render();
      if (BACKEND) {
        if (pendingCount() > 0 || Date.now() - data.lastSync > 60000) queueSync(200);
        if (data.uploads.length || data.outbox.gone.length) queuePump(400);
        if (route === 'flux') { feed.fails = 0; openFeed(); } else peekAt = 0;
      }
    });
    if (BACKEND) setInterval(feedTick, Math.min(1000, Math.max(250, Math.round(FEED_EVERY / 3))));
    /* Aplicatia lasata deschisa peste miezul noptii trece singura la ziua noua. */
    setInterval(function () {
      if (BACKEND && auth !== 'in') return;
      if (L.dayKey(new Date()) !== shownDay && !dlg.open) render();
    }, 60000);

    byId('dlg-ok').addEventListener('click', function () {
      var fn = dlgOk;
      closeDialog();
      if (fn) fn();
    });
    byId('dlg-extra').addEventListener('click', function () {
      var fn = dlgExtra;
      closeDialog();
      if (fn) fn();
    });
    byId('dlg-link').addEventListener('click', function () {
      var fn = dlgLink;
      closeDialog();
      if (fn) fn();
    });
    byId('dlg-cancel').addEventListener('click', closeDialog);
    dlg.addEventListener('click', function (ev) { if (ev.target === dlg) closeDialog(); });
    dlg.addEventListener('close', function () {
      dlgOk = null;
      dlgExtra = null;
      dlgLink = null;
      if (dlgOpener && document.contains(dlgOpener)) dlgOpener.focus();
      dlgOpener = null;
    });

    if (BACKEND) {
      boot();
      if (route === 'flux' && auth === 'in') openFeed();
    } else {
      render();
    }
    if (draftBack) toast(tr('draftKept'));

    if (CFG.pwa && 'serviceWorker' in navigator && window.location.protocol === 'https:') {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () { /* aplicatia merge si fara */ });
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
