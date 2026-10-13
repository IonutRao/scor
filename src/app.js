/* Scorul zilei: interfata.
   Doua moduri: local (fara server, datele raman pe dispozitiv) si cu cont (datele se salveaza si pe server).
   In ambele, ecranele se deseneaza din datele locale; serverul le aduce la zi in fundal. */
(function () {
  'use strict';

  var CFG = window.SCOR_BUILD || {};
  var VERSION = '0.2';
  var KEY = 'scor.v1';
  var BACKEND = API.enabled();
  var MAIN = BACKEND ? ['azi', 'jurnal', 'flux', 'profil'] : ['azi', 'jurnal', 'profil'];
  var ROUTES = MAIN.concat(BACKEND ? ['plus', 'minus', 'nume'] : ['plus', 'minus']);
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  var FLAME = 'M12 2.6c1 4.5 6.25 7 6.25 13.1a6.25 6.25 0 0 1-12.5 0c0-2.4 1-4.2 2.4-5.6.2 1.7 1.1 2.9 2.2 3.4C9.7 9.7 10.6 5.8 12 2.6z';
  var STAR = 'M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8z';

  /* Toate textele aplicatiei, pe limbi. O limba noua inseamna un bloc nou aici. */
  var T = {
    ro: {
      sections: 'Sectiuni', today: 'Azi', todayShort: 'Azi', journal: 'Jurnal', profile: 'Profil', feed: 'Flux',
      pointsToday: 'puncte azi', streakLabel: 'serie pe plus', days7: 'pe 7 zile', bestLabel: 'record', cheersLabel: 'incurajari',
      day: ['zi', 'zile'], activity: ['activitate', 'activitati'], minute: ['minut', 'minute'], hour: ['ora', 'ore'],
      cheerForms: ['incurajare', 'incurajari'], changeForms: ['modificare', 'modificari'],
      addGood: 'Fapta buna', addBad: 'Mai putin buna',
      todayList: 'Activitatile de azi', emptyToday: 'Nimic notat azi.', emptyTodayHint: 'Incepe cu o fapta buna.',
      newActivity: 'Activitate noua', close: 'Inchide', typeLabel: 'Felul activitatii',
      favorites: 'Favorite', noFavs: 'Nicio favorita aici. Scrie o activitate mai jos.',
      orWrite: 'Sau scrie una noua', writeOne: 'Scrie activitatea', namePh: 'De exemplu: 20 de flotari',
      points: 'Puncte', pointsRange: 'intre 1 si 20', less: 'Scade un punct', more: 'Adauga un punct',
      keepFav: 'Pastreaza in favorite', save: 'Salveaza', nameMissing: 'Scrie un nume sau alege din favorite.',
      who: 'Cine vede', onlyYou: 'doar tu', inFeed: 'apare in flux, cu numele tau', priv: 'Privat', pub: 'Public',
      privateL: 'privat', publicL: 'public',
      last7: 'ultimele 7 zile', streakOf: 'serie de {x}', noStreak: 'nicio serie inca', chartAria: 'Scorul pe ultimele 7 zile',
      byDay: 'Pe zile', emptyJournal: 'Jurnalul e gol.', emptyJournalHint: 'Activitatile notate apar aici, pe zile.',
      allPlus: 'toate pe plus', allMinus: 'toate pe minus', mix: '{p} pe plus, {m} pe minus',
      del: 'Sterge', cancel: 'Renunta', deleted: 'Activitate stearsa',
      makePublic: 'Arata in flux', makePrivate: 'Scoate din flux', nowPublic: 'Apare in flux', nowPrivate: 'Scoasa din flux',
      language: 'Limba', favsPlus: 'Favorite pe plus', favsMinus: 'Favorite pe minus',
      removeFav: 'Scoate din favorite: {x}', favRemoved: 'Scoasa din favorite', noFavsProfile: 'Nicio favorita.',
      yourData: 'Datele tale',
      dataNote: 'Datele raman doar pe acest dispozitiv. Conturile si fluxul public vin in etapa urmatoare.',
      resetAll: 'Sterge toate datele', resetTitle: 'Stergi toate datele?',
      resetBody: 'Activitatile si favoritele tale se pierd si nu pot fi recuperate.',
      resetOk: 'Sterge tot', resetDone: 'Datele au fost sterse', version: 'Versiunea {x}',
      demoNote: 'Vezi date de exemplu.', demoClear: 'Incepe de la zero', demoCleared: 'Exemplele au fost sterse',
      tagline: 'Tine scorul zilei tale.', tagline2: 'Faptele bune pe plus, cele mai putin bune pe minus.',
      signIn: 'Intra in cont', signUp: 'Cont nou', email: 'Email', password: 'Parola', passHint: 'Cel putin 8 caractere.',
      createAccount: 'Creeaza contul', wait: 'Un moment...',
      privacyNote: 'Activitatile tale raman private pana alegi tu sa le arati in flux.',
      errEmail: 'Scrie o adresa de email corecta.', errPass: 'Parola trebuie sa aiba cel putin 8 caractere.',
      errCreds: 'Email sau parola gresita.', errExists: 'Exista deja un cont cu acest email. Intra in cont.',
      errWeak: 'Parola e prea usor de ghicit. Alege una mai lunga.',
      errRate: 'Prea multe incercari. Incearca din nou peste cateva minute.',
      errOffline: 'Nu exista conexiune la internet.',
      errConfirm: 'Contul asteapta confirmarea prin email. Verifica mesajele primite.',
      errSignupOff: 'Crearea de conturi este oprita momentan.', errGeneric: 'Ceva nu a mers. Incearca din nou.',
      errLib: 'Partea de cont nu a putut porni. Verifica internetul si incearca din nou.',
      confirmSent: 'Am trimis un email de confirmare. Deschide linkul din el, apoi intra in cont.',
      chooseName: 'Alege un nume', changeName: 'Schimba numele', nameLabel: 'Numele afisat',
      nameHint: 'Intre 3 si 20 de caractere. Cu el apari in flux la activitatile publice.',
      nameTaken: 'Numele e deja luat. Incearca altul.', nameInvalid: 'Numele trebuie sa aiba intre 3 si 20 de caractere.',
      nameSaved: 'Numele a fost salvat', next: 'Continua', saveName: 'Salveaza numele',
      account: 'Cont', nameRow: 'Nume', change: 'Schimba',
      signOut: 'Iesi din cont', signOutTitle: 'Iesi din cont?',
      signOutPending: 'Ai modificari care nu au ajuns inca in cont ({x}). Daca iesi acum, se pierd.', signOutOk: 'Iesi',
      deleteAccount: 'Sterge contul', deleteTitle: 'Stergi contul?',
      deleteBody: 'Se sterg definitiv contul, activitatile, favoritele si incurajarile tale. Nu se poate anula.',
      accountDeleted: 'Contul a fost sters',
      syncTitle: 'Salvare in cont', syncOk: 'Totul e salvat in cont.', syncWait: 'In asteptare: {x}.',
      syncOffline: 'Fara internet. Modificarile se trimit singure cand revine conexiunea.',
      syncProblem: 'Salvarea nu a reusit. Se reincearca automat.', syncNow: 'Trimite acum',
      pendingNote: 'In asteptare: {x}. Se trimit cand revine internetul.',
      feedSub: 'ce fac ceilalti', cheersGot: 'Incurajari primite de tine', cheersGotSub: 'se numara separat, nu intra in scor',
      feedLang: 'Limba activitatilor', myLang: 'Limba mea', allLangs: 'Toate limbile',
      refresh: 'Actualizeaza', moreFeed: 'Mai multe', loading: 'Se incarca...',
      feedEmpty: 'Inca nu a aparut nimic aici.', feedEmptyHint: 'Arata in flux o fapta buna si va fi prima.',
      feedOffline: 'Fluxul are nevoie de internet.', feedError: 'Fluxul nu a putut fi incarcat.', retry: 'Incearca din nou',
      cheer: 'Incurajeaza', cheered: 'Incurajat', yours: 'activitatea ta', beFirst: 'Fii primul care incurajeaza',
      cheersMine1: 'o incurajare, de la tine', cheersMine: '{x}, una de la tine', cheersNone: 'nicio incurajare inca',
      now: 'chiar acum', ago: 'acum {x}', yesterday: 'ieri',
      days: ['duminica', 'luni', 'marti', 'miercuri', 'joi', 'vineri', 'sambata'],
      daysShort: ['Du', 'Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sa'],
      months: ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'],
      fav: {
        gym: 'Sala', read: 'Citit', walk: 'Mers pe jos', meditate: 'Meditatie', water: 'Apa 2 litri', sleep: 'Somn la timp',
        smoke: 'Tigara', junk: 'Fast food', alcohol: 'Alcool', phone: 'Prea mult pe telefon', late: 'Culcat tarziu', sweets: 'Dulciuri'
      }
    },
    en: {
      sections: 'Sections', today: 'Today', todayShort: '', journal: 'Journal', profile: 'Profile', feed: 'Feed',
      pointsToday: 'points today', streakLabel: 'day streak', days7: 'in 7 days', bestLabel: 'best streak', cheersLabel: 'cheers',
      day: ['day', 'days'], activity: ['activity', 'activities'], minute: ['minute', 'minutes'], hour: ['hour', 'hours'],
      cheerForms: ['cheer', 'cheers'], changeForms: ['change', 'changes'],
      addGood: 'Good deed', addBad: 'Not so good',
      todayList: 'Today’s activities', emptyToday: 'Nothing logged today.', emptyTodayHint: 'Start with a good deed.',
      newActivity: 'New activity', close: 'Close', typeLabel: 'Kind of activity',
      favorites: 'Favorites', noFavs: 'No favorites here. Write an activity below.',
      orWrite: 'Or write a new one', writeOne: 'Write the activity', namePh: 'For example: 20 pushups',
      points: 'Points', pointsRange: 'from 1 to 20', less: 'One point less', more: 'One point more',
      keepFav: 'Keep in favorites', save: 'Save', nameMissing: 'Write a name or pick a favorite.',
      who: 'Who sees it', onlyYou: 'only you', inFeed: 'shown in the feed with your name', priv: 'Private', pub: 'Public',
      privateL: 'private', publicL: 'public',
      last7: 'last 7 days', streakOf: 'streak: {x}', noStreak: 'no streak yet', chartAria: 'Score for the last 7 days',
      byDay: 'By day', emptyJournal: 'The journal is empty.', emptyJournalHint: 'Logged activities show up here, day by day.',
      allPlus: 'all plus', allMinus: 'all minus', mix: '{p} plus, {m} minus',
      del: 'Delete', cancel: 'Cancel', deleted: 'Activity deleted',
      makePublic: 'Show in feed', makePrivate: 'Remove from feed', nowPublic: 'Shown in the feed', nowPrivate: 'Removed from the feed',
      language: 'Language', favsPlus: 'Plus favorites', favsMinus: 'Minus favorites',
      removeFav: 'Remove from favorites: {x}', favRemoved: 'Removed from favorites', noFavsProfile: 'No favorites.',
      yourData: 'Your data',
      dataNote: 'Your data stays on this device only. Accounts and the public feed come in the next stage.',
      resetAll: 'Delete all data', resetTitle: 'Delete all data?',
      resetBody: 'Your activities and favorites will be lost and cannot be recovered.',
      resetOk: 'Delete everything', resetDone: 'Data deleted', version: 'Version {x}',
      demoNote: 'You are viewing example data.', demoClear: 'Start from zero', demoCleared: 'Examples deleted',
      tagline: 'Keep score of your day.', tagline2: 'Good deeds add points, the not so good ones take them away.',
      signIn: 'Sign in', signUp: 'New account', email: 'Email', password: 'Password', passHint: 'At least 8 characters.',
      createAccount: 'Create account', wait: 'One moment...',
      privacyNote: 'Your activities stay private until you choose to show them in the feed.',
      errEmail: 'Enter a valid email address.', errPass: 'The password needs at least 8 characters.',
      errCreds: 'Wrong email or password.', errExists: 'An account with this email already exists. Sign in instead.',
      errWeak: 'That password is too easy to guess. Pick a longer one.',
      errRate: 'Too many attempts. Try again in a few minutes.',
      errOffline: 'No internet connection.',
      errConfirm: 'This account is waiting for email confirmation. Check your inbox.',
      errSignupOff: 'Creating accounts is turned off for now.', errGeneric: 'Something went wrong. Try again.',
      errLib: 'The account part could not start. Check your connection and try again.',
      confirmSent: 'We sent a confirmation email. Open the link in it, then sign in.',
      chooseName: 'Choose a name', changeName: 'Change name', nameLabel: 'Display name',
      nameHint: 'Between 3 and 20 characters. It appears in the feed next to your public activities.',
      nameTaken: 'That name is taken. Try another.', nameInvalid: 'The name needs between 3 and 20 characters.',
      nameSaved: 'Name saved', next: 'Continue', saveName: 'Save name',
      account: 'Account', nameRow: 'Name', change: 'Change',
      signOut: 'Sign out', signOutTitle: 'Sign out?',
      signOutPending: 'Some changes have not reached your account yet ({x}). If you sign out now, they are lost.', signOutOk: 'Sign out',
      deleteAccount: 'Delete account', deleteTitle: 'Delete your account?',
      deleteBody: 'Your account, activities, favorites and cheers are deleted for good. This cannot be undone.',
      accountDeleted: 'Account deleted',
      syncTitle: 'Saving to your account', syncOk: 'Everything is saved to your account.', syncWait: 'Waiting: {x}.',
      syncOffline: 'No internet. Changes are sent on their own once the connection is back.',
      syncProblem: 'Saving failed. It will retry automatically.', syncNow: 'Send now',
      pendingNote: 'Waiting: {x}. They are sent once the internet is back.',
      feedSub: 'what others are doing', cheersGot: 'Cheers you received', cheersGotSub: 'counted separately, not part of your score',
      feedLang: 'Activity language', myLang: 'My language', allLangs: 'All languages',
      refresh: 'Refresh', moreFeed: 'More', loading: 'Loading...',
      feedEmpty: 'Nothing here yet.', feedEmptyHint: 'Show a good deed in the feed and it will be the first.',
      feedOffline: 'The feed needs an internet connection.', feedError: 'The feed could not be loaded.', retry: 'Try again',
      cheer: 'Cheer', cheered: 'Cheered', yours: 'your activity', beFirst: 'Be the first to cheer',
      cheersMine1: '1 cheer, from you', cheersMine: '{x}, one from you', cheersNone: 'no cheers yet',
      now: 'just now', ago: '{x} ago', yesterday: 'yesterday',
      days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      daysShort: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
      months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
      fav: {
        gym: 'Gym', read: 'Reading', walk: 'Walk', meditate: 'Meditation', water: '2 l of water', sleep: 'Sleep on time',
        smoke: 'Cigarette', junk: 'Fast food', alcohol: 'Alcohol', phone: 'Too much phone', late: 'Late to bed', sweets: 'Sweets'
      }
    }
  };

  /* Sugestiile cu care porneste un utilizator nou: cheie, fel, puncte. */
  var DEFAULT_FAVS = [
    ['gym', 'plus', 10], ['read', 'plus', 10], ['walk', 'plus', 10], ['meditate', 'plus', 5], ['water', 'plus', 5], ['sleep', 'plus', 10],
    ['smoke', 'minus', 10], ['junk', 'minus', 5], ['alcohol', 'minus', 10], ['phone', 'minus', 5], ['late', 'minus', 5], ['sweets', 'minus', 5]
  ];

  var ICON = {
    flame: '<svg class="ic-flame" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke-linejoin="round"><path d="' + FLAME + '"/></svg>',
    flameFlat: '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24"><path d="' + FLAME + '"/></svg>',
    star: '<svg class="ic-star" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" stroke-linejoin="round"><path d="' + STAR + '"/></svg>',
    starFlat: '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="' + STAR + '"/></svg>',
    starLine: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke-linejoin="round"><path d="' + STAR + '"/></svg>',
    close: '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg>',
    x: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };

  var data, lang, route = 'azi';
  /* Starea contului: local (fara server), loading, out (neautentificat), name (fara nume ales), in. */
  var auth = BACKEND ? 'loading' : 'local';
  var add = { type: 'plus', favId: null, name: '', pts: 10, keep: false, pub: false };
  var authForm = { mode: 'in', email: '', busy: false, error: '', info: '', detail: '' };
  var nameForm = { value: '', busy: false, error: '' };
  var feed = newFeed();
  var openDays = {};
  var appEl, viewEl, navEl, toastEl, dlg;
  var toastTimer = null, dlgOk = null, dlgExtra = null, dlgOpener = null, shownDay = '';
  var syncing = false, syncAgain = false, syncTimer = null, syncErr = '', syncFails = 0, inflight = {};

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
  function newFeed() { return { items: [], loading: false, ready: false, error: '', all: false, done: true, at: 0 }; }

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
      favsRev: 0, favsSynced: 0, outbox: { del: [], vis: [] }, lastSync: 0, pubDefault: false
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
    d.lastSync = d.lastSync || 0;
    d.pubDefault = !!d.pubDefault;
    d.entries = d.entries.filter(function (e) { return okItem(e) && /^\d{4}-\d{2}-\d{2}$/.test(e.day) && typeof e.id === 'string'; });
    d.entries.forEach(function (e) {
      if (!UUID.test(e.id)) { e.id = uuid(); e.sync = 1; }
      if (e.sync !== 0) e.sync = 1;
      e.pub = !!e.pub;
      e.cheers = e.cheers > 0 ? e.cheers : 0;
    });
    d.favs = cleanFavs(d.favs);
    return d;
  }

  /* O saptamana de exemple, doar pentru previzualizare. */
  function seedDemo(d) {
    var now = new Date(), today = L.dayKey(now), start = L.parseDay(today).getTime();
    var plan = [
      [['gym', 'plus', 10], ['read', 'plus', 10], ['walk', 'plus', 10], ['smoke', 'minus', 10], ['meditate', 'plus', 5]],
      [['gym', 'plus', 10], ['read', 'plus', 10], ['meditate', 'plus', 5]],
      [['gym', 'plus', 10], ['walk', 'plus', 10], ['sleep', 'plus', 10], ['water', 'plus', 5], ['sweets', 'minus', 5]],
      [['read', 'plus', 10], ['walk', 'plus', 10], ['late', 'minus', 5]],
      [['gym', 'plus', 10], ['read', 'plus', 10], ['sleep', 'plus', 10]],
      [['walk', 'plus', 10], ['meditate', 'plus', 5], ['water', 'plus', 5]],
      [['water', 'plus', 5], ['smoke', 'minus', 10]]
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
  function myCheers() { return data.entries.reduce(function (s, e) { return s + (e.cheers || 0); }, 0); }

  /* ---------- salvarea in cont ---------- */

  function pendingCount() {
    var n = data.outbox.del.length + data.outbox.vis.length + (data.favsRev !== data.favsSynced ? 1 : 0);
    for (var i = 0; i < data.entries.length; i++) if (data.entries[i].sync === 1) n++;
    return n;
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
    var batch = data.entries.filter(function (e) { return e.sync === 1; }).slice(0, 300);
    var sent = { ids: {}, del: data.outbox.del.slice(), vis: data.outbox.vis.slice(), rev: data.favsRev, favs: data.favsRev !== data.favsSynced };
    batch.forEach(function (e) { sent.ids[e.id] = true; });
    inflight = sent.ids;
    syncing = true;
    API.rpc('sync', {
      p_add: batch.map(function (e) {
        var o = { id: e.id, day: e.day, ts: e.ts, type: e.type, pts: e.pts, pub: !!e.pub };
        if (e.key) o.key = e.key; else o.name = e.name;
        return o;
      }),
      p_del: sent.del,
      p_vis: sent.vis,
      p_favs: sent.favs ? data.favs : null,
      p_lang: lang
    }).then(function (res) {
      applySync(res, sent);
      syncErr = '';
      syncFails = 0;
      /* Ce tocmai a plecat poate schimba fluxul: se reincarca acum sau la urmatoarea deschidere. */
      if (batch.length || sent.del.length || sent.vis.length) {
        feed.at = 0;
        if (route === 'flux') loadFeed(true);
      }
    }, function (err) {
      syncFailed(err);
    }).then(function () {
      syncing = false;
      inflight = {};
      if (auth === 'in') {
        render();
        if (syncErr) queueSync(Math.min(300000, 15000 * Math.pow(2, Math.min(syncFails, 5))));
        else if (syncAgain || pendingCount() > 0) queueSync(300);
      } else {
        render();
      }
      syncAgain = false;
    });
  }

  function applySync(res, sent) {
    if (!res || !Array.isArray(res.entries)) throw new Error('bad_response');
    data.outbox.del = data.outbox.del.filter(function (id) { return sent.del.indexOf(id) < 0; });
    data.outbox.vis = data.outbox.vis.filter(function (op) { return sent.vis.indexOf(op) < 0; });

    var stillDeleting = {}, onServer = {}, next = [];
    data.outbox.del.forEach(function (id) { stillDeleting[id] = true; });
    res.entries.forEach(function (s) {
      onServer[s.id] = true;
      if (stillDeleting[s.id]) return;
      var e = { id: s.id, ts: Number(s.ts), day: s.day, type: s.type, pts: s.pts, pub: !!s.pub, cheers: s.cheers || 0, sync: 0 };
      if (s.key) e.key = s.key; else e.name = s.name;
      if (okItem(e)) next.push(e);
    });
    /* Ce s-a schimbat aici cat timp cererea era pe drum ramane valabil. */
    data.outbox.vis.forEach(function (op) {
      for (var i = 0; i < next.length; i++) if (next[i].id === op.id) next[i].pub = op.pub;
    });
    data.entries.forEach(function (e) {
      if (e.sync === 1 && !onServer[e.id] && !sent.ids[e.id]) next.push(e);
    });
    data.entries = next;

    if (sent.favs) data.favsSynced = sent.rev;
    if (data.favsRev === data.favsSynced) {
      if (Array.isArray(res.favs)) data.favs = cleanFavs(res.favs);
      else data.favsRev++; /* contul nu are inca favoritele: pleaca la drumul urmator */
    }
    data.lastSync = Date.now();
    persist();
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
      openDays = {};
      feed = newFeed();
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
    persist();
    auth = 'out';
    authForm = { mode: 'in', email: '', busy: false, error: '', info: '', detail: '' };
    feed = newFeed();
    openDays = {};
    syncErr = '';
    route = 'azi';
    try { window.history.replaceState(null, '', '#azi'); } catch (e) { /* merge si fara istoric */ }
    render();
    window.scrollTo(0, 0);
  }

  function askSignOut() {
    var n = pendingCount();
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
        API.rpc('delete_my_account').then(function () {
          doSignOut();
          toast(tr('accountDeleted'));
        }, function (err) {
          toast(tr(err.offline ? 'errOffline' : 'errGeneric'));
        });
      }
    });
  }

  /* ---------- flux ---------- */

  function loadFeed(reset) {
    if (feed.loading) return;
    feed.loading = true;
    if (reset) feed.error = '';
    var before = !reset && feed.items.length ? feed.items[feed.items.length - 1].ts : null;
    API.rpc('feed', { p_lang: feed.all ? null : lang, p_before: before, p_limit: 30 }).then(function (rows) {
      rows = Array.isArray(rows) ? rows : [];
      feed.items = reset ? rows : feed.items.concat(rows);
      feed.done = rows.length < 30;
      feed.error = '';
      feed.ready = true;
      feed.at = Date.now();
    }, function (err) {
      feed.error = err.offline ? 'offline' : 'error';
    }).then(function () {
      feed.loading = false;
      if (route === 'flux' && auth === 'in') render();
    });
    if (route === 'flux') render();
  }

  function openFeed() {
    if (!feed.ready || Date.now() - feed.at > 30000) loadFeed(true);
    if (Date.now() - data.lastSync > 30000) queueSync(0);
  }

  function toggleCheer(id) {
    var it = null;
    for (var i = 0; i < feed.items.length; i++) if (feed.items[i].id === id) it = feed.items[i];
    if (!it || it.mine || it.busy) return;
    var on = !it.cheered;
    it.cheered = on;
    it.cheers = Math.max(0, (it.cheers || 0) + (on ? 1 : -1));
    it.busy = true;
    render();
    API.rpc('cheer', { p_entry: id, p_on: on }).then(function (r) {
      if (r) { it.cheers = r.cheers || 0; it.cheered = !!r.cheered; }
    }, function (err) {
      it.cheered = !on;
      it.cheers = Math.max(0, (it.cheers || 0) + (on ? -1 : 1));
      toast(tr(err.offline ? 'errOffline' : 'errGeneric'));
    }).then(function () {
      it.busy = false;
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
    if (!BACKEND || !syncErr) return '';
    var n = pendingCount();
    if (!n) return '';
    return '<p class="notice" id="pending">' + esc(tr('pendingNote', { x: count(n, tr('changeForms')) })) + '</p>';
  }

  function entrySub(e) {
    var s = timeOf(e.ts);
    if (!BACKEND) return s;
    if (!e.pub) return s + ' · ' + tr('privateL');
    return s + ' · ' + tr('publicL') + (e.cheers ? ' · ' + count(e.cheers, tr('cheerForms')) : '');
  }

  function rowEntry(e) {
    return '<li><button type="button" class="row" data-act="entry" data-id="' + esc(e.id) + '" data-focus="e-' + esc(e.id) + '">' +
      '<span class="row-main"><span class="row-t">' + esc(nameOf(e)) + '</span><span class="row-s">' + esc(entrySub(e)) + '</span></span>' +
      '<span class="pill ' + e.type + '">' + L.fmt(L.signed(e)) + '</span></button></li>';
  }

  function viewToday() {
    var now = new Date(), today = L.dayKey(now), t = L.totals(data.entries);
    var total = t[today] || 0;
    var list = data.entries.filter(function (e) { return e.day === today; }).sort(function (a, b) { return b.ts - a.ts; });
    var week = L.lastDays(today, 7).reduce(function (s, k) { return s + (t[k] || 0); }, 0);
    var streak = L.currentStreak(t, today), best = L.bestStreak(t);
    var third = BACKEND
      ? '<div class="stat"><div class="stat-num" id="cheers">' + ICON.star + myCheers() + '</div><div class="stat-label">' + esc(tr('cheersLabel')) + '</div></div>'
      : '<div class="stat"><div class="stat-num" id="best">' + esc(count(best, tr('day'))) + '</div><div class="stat-label">' + esc(tr('bestLabel')) + '</div></div>';
    return '' +
      '<header class="head"><h1 id="title" tabindex="-1">' + esc(tr('today')) + '</h1><p class="head-sub">' + esc(longDate(now)) + '</p></header>' +
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
    var name = add.name.trim().toLowerCase();
    if (!name || add.favId) return false;
    return !data.favs.some(function (f) { return f.type === add.type && favName(f).toLowerCase() === name; });
  }

  function saveLabel() { return tr('save') + ' ' + L.fmt(add.type === 'minus' ? -add.pts : add.pts); }

  function viewAdd() {
    var favs = data.favs.filter(function (f) { return f.type === add.type; });
    var chips = favs.map(function (f) {
      return '<button type="button" class="chip" aria-pressed="' + (add.favId === f.id) + '" data-act="fav" data-id="' + esc(f.id) + '" data-focus="f-' + esc(f.id) + '">' +
        '<span class="chip-n">' + esc(favName(f)) + '</span><span class="chip-p">' + L.fmt(f.type === 'minus' ? -f.pts : f.pts) + '</span></button>';
    }).join('');
    var who = !BACKEND ? '' :
      '<div class="line"><div><div class="line-t" id="who-l">' + esc(tr('who')) + '</div><div class="line-s" id="who-s">' + esc(tr(add.pub ? 'inFeed' : 'onlyYou')) + '</div></div>' +
        '<div class="seg small" role="group" aria-labelledby="who-l">' +
          '<button type="button" class="seg-b" aria-pressed="' + !add.pub + '" data-act="pub" data-v="0" data-focus="pub-0">' + esc(tr('priv')) + '</button>' +
          '<button type="button" class="seg-b" aria-pressed="' + !!add.pub + '" data-act="pub" data-v="1" data-focus="pub-1">' + esc(tr('pub')) + '</button>' +
        '</div></div>';
    return '' +
      '<header class="head head-add"><h1 id="title" tabindex="-1">' + esc(tr('newActivity')) + '</h1>' +
        '<a class="icon-btn" href="#azi" data-route="azi" data-replace="1" aria-label="' + esc(tr('close')) + '">' + ICON.close + '</a></header>' +
      '<div class="pad">' +
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
          who +
          '<label class="check" id="keep-row"' + (keepVisible() ? '' : ' hidden') + '><input type="checkbox" id="keep-fav"' + (add.keep ? ' checked' : '') + '><span>' + esc(tr('keepFav')) + '</span></label>' +
          '<div class="save-wrap"><button type="submit" class="save ' + add.type + '" id="save-btn">' + esc(saveLabel()) + '</button></div>' +
        '</form>' +
      '</div>';
  }

  function mixText(p, m) { return m === 0 ? tr('allPlus') : p === 0 ? tr('allMinus') : tr('mix', { p: p, m: m }); }
  function barH(v, max) { return v === 0 ? 6 : Math.max(8, Math.round(Math.abs(v) / max * 120)); }

  function viewJournal() {
    var today = L.dayKey(new Date()), t = L.totals(data.entries);
    var days = L.lastDays(today, 7), vals = days.map(function (k) { return t[k] || 0; });
    var week = vals.reduce(function (a, b) { return a + b; }, 0);
    var max = Math.max.apply(null, [1].concat(vals.map(Math.abs)));
    var streak = L.currentStreak(t, today);
    var byDay = {};
    data.entries.forEach(function (e) { (byDay[e.day] = byDay[e.day] || []).push(e); });
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
      '<header class="head"><h1 id="title" tabindex="-1">' + esc(tr('journal')) + '</h1><p class="head-sub">' + esc(tr('last7')) + '</p></header>' +
      '<section class="hero" aria-label="' + esc(tr('last7')) + '">' +
        '<div class="hero-top"><div class="hero-num sm ' + tone(week) + '" id="week-total">' + L.fmt(week) + '</div>' +
          (streak
            ? '<div class="hero-streak on" id="week-streak">' + ICON.flameFlat + esc(tr('streakOf', { x: count(streak, tr('day')) })) + '</div>'
            : '<div class="hero-streak" id="week-streak">' + esc(tr('noStreak')) + '</div>') +
        '</div>' +
        '<div class="chart" role="img" aria-label="' + esc(aria) + '">' + cols + '</div>' +
        '<div class="days" aria-hidden="true">' + labels + '</div>' +
      '</section>' +
      '<section class="sect"><h2>' + esc(tr('byDay')) + '</h2>' +
        (keys.length
          ? '<ul class="rows" id="day-list">' + rows + '</ul>'
          : '<div class="empty"><p class="empty-t">' + esc(tr('emptyJournal')) + '</p><p class="empty-s">' + esc(tr('emptyJournalHint')) + '</p></div>') +
      '</section>';
  }

  function cheersText(it) {
    var n = it.cheers || 0;
    if (!n) return tr(it.mine ? 'cheersNone' : 'beFirst');
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
        return '<li class="post">' +
          '<div class="post-top"><span class="post-who"><b>' + esc(it.author) + '</b> · ' + esc(ago(Number(it.ts))) + '</span>' +
            '<span class="pill ' + (it.type === 'minus' ? 'minus' : 'plus') + '">' + L.fmt(sign) + '</span></div>' +
          '<div class="post-t">' + esc(postTitle(it)) + '</div>' +
          '<div class="post-bot"><span class="post-n">' + esc(cheersText(it)) + '</span>' +
            (it.mine
              ? '<span class="post-n">' + esc(tr('yours')) + '</span>'
              : '<button type="button" class="cheer" aria-pressed="' + !!it.cheered + '" data-act="cheer" data-id="' + esc(it.id) + '" data-focus="c-' + esc(it.id) + '">' +
                ICON.starLine + esc(tr(it.cheered ? 'cheered' : 'cheer')) + '</button>') +
          '</div></li>';
      }).join('') + '</ul>' +
        (feed.error ? '<p class="note feed">' + esc(tr(feed.error === 'offline' ? 'feedOffline' : 'feedError')) + '</p>' : '') +
        (feed.done ? '' : '<div class="center"><button type="button" class="link" data-act="feed-more" data-focus="feed-more">' + esc(tr(feed.loading ? 'loading' : 'moreFeed')) + '</button></div>');
    }
    return '' +
      '<header class="head"><h1 id="title" tabindex="-1">' + esc(tr('feed')) + '</h1><p class="head-sub">' + esc(tr('feedSub')) + '</p></header>' +
      '<section class="gold" aria-label="' + esc(tr('cheersGot')) + '"><div><div class="gold-t">' + esc(tr('cheersGot')) + '</div><div class="gold-s">' + esc(tr('cheersGotSub')) + '</div></div>' +
        '<div class="gold-n" id="cheers-got">' + ICON.starFlat + myCheers() + '</div></section>' +
      '<div class="feed-bar">' +
        '<div class="seg small" role="group" aria-label="' + esc(tr('feedLang')) + '">' +
          '<button type="button" class="seg-b" aria-pressed="' + !feed.all + '" data-act="feed-lang" data-all="0" data-focus="fl-0">' + esc(tr('myLang')) + '</button>' +
          '<button type="button" class="seg-b" aria-pressed="' + !!feed.all + '" data-act="feed-lang" data-all="1" data-focus="fl-1">' + esc(tr('allLangs')) + '</button>' +
        '</div>' +
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
    return '<button type="button" class="seg-b" aria-pressed="' + (lang === 'ro') + '" data-act="lang" data-lang="ro" data-focus="lang-ro">Romana</button>' +
      '<button type="button" class="seg-b" aria-pressed="' + (lang === 'en') + '" data-act="lang" data-lang="en" data-focus="lang-en">English</button>';
  }

  function syncStatus() {
    var n = pendingCount();
    if (!n) return tr('syncOk');
    if (syncErr === 'offline') return tr('syncWait', { x: count(n, tr('changeForms')) }) + ' ' + tr('syncOffline');
    if (syncErr) return tr('syncWait', { x: count(n, tr('changeForms')) }) + ' ' + tr('syncProblem');
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
          '<div class="btns"><button type="button" class="btn-line calm" data-act="sync-now" data-focus="sync-now">' + esc(tr('syncNow')) + '</button></div></section>' +
        '<section class="sect"><div class="btns">' +
          '<button type="button" class="btn-line calm" data-act="signout" data-focus="signout">' + esc(tr('signOut')) + '</button>' +
          '<button type="button" class="btn-line" data-act="delete-account" data-focus="delete-account">' + esc(tr('deleteAccount')) + '</button></div></section>'
      : '<section class="sect"><h2>' + esc(tr('yourData')) + '</h2><p class="note">' + esc(tr('dataNote')) + '</p>' +
          '<button type="button" class="btn-line" data-act="reset" data-focus="reset">' + esc(tr('resetAll')) + '</button></section>';
    return '' +
      '<header class="head"><h1 id="title" tabindex="-1">' + esc(tr('profile')) + '</h1><p class="head-sub">' + esc(tr('version', { x: VERSION })) + '</p></header>' +
      top +
      '<section class="sect"><h2 id="lang-h">' + esc(tr('language')) + '</h2>' +
        '<div class="seg" role="group" aria-labelledby="lang-h">' + langButtons() + '</div></section>' +
      '<section class="sect"><h2>' + esc(tr('favsPlus')) + '</h2>' + favList('plus') + '</section>' +
      '<section class="sect"><h2>' + esc(tr('favsMinus')) + '</h2>' + favList('minus') + '</section>' +
      bottom;
  }

  function brand() {
    return '<header class="head head-add"><h1 id="title" tabindex="-1">Scorul zilei</h1>' +
      '<div class="langs" role="group" aria-label="Limba / Language">' +
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

  /* ---------- afisare ---------- */

  function renderNav(hidden) {
    navEl.hidden = hidden;
    navEl.setAttribute('aria-label', tr('sections'));
    var labels = { azi: 'today', jurnal: 'journal', flux: 'feed', profil: 'profile' };
    navEl.innerHTML = '<div class="nav-in">' + MAIN.map(function (r) {
      return '<a href="#' + r + '" data-route="' + r + '"' + (route === r ? ' aria-current="page"' : '') + '><span>' + esc(tr(labels[r])) + '</span></a>';
    }).join('') + '</div>';
  }

  function render() {
    var act = document.activeElement, fkey = null, fid = null, caret = null;
    if (act && viewEl.contains(act)) {
      fkey = act.getAttribute('data-focus');
      if (act.tagName === 'INPUT' && act.id && act.type !== 'checkbox') {
        fid = act.id;
        try { caret = [act.selectionStart, act.selectionEnd]; } catch (e) { caret = null; }
      }
    }
    shownDay = L.dayKey(new Date());
    var gate = BACKEND && auth !== 'in';
    var adding = isAddRoute(route);
    var full = gate || adding || route === 'nume';
    var html;
    if (gate) html = auth === 'out' ? viewAuth() : auth === 'name' ? viewName(true) : viewLoading();
    else if (adding) html = viewAdd();
    else if (route === 'jurnal') html = viewJournal();
    else if (route === 'flux') html = viewFeed();
    else if (route === 'profil') html = viewProfile();
    else if (route === 'nume') html = viewName(false);
    else html = viewToday();
    appEl.classList.toggle('is-add', full);
    viewEl.innerHTML = html;
    renderNav(full);
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
    return ROUTES.indexOf(h) >= 0 ? h : 'azi';
  }

  function resetAdd(type) {
    add = { type: type, favId: null, name: '', pts: 10, keep: false, pub: type === 'plus' && !!data.pubDefault };
  }

  function enter(r) {
    if (isAddRoute(r)) resetAdd(r);
    if (r === 'nume') nameForm = { value: data.name, busy: false, error: '' };
    route = r;
    hideToast();
    if (r === 'flux' && auth === 'in') openFeed();
  }

  function navigate(r, replace) {
    if (ROUTES.indexOf(r) < 0) r = 'azi';
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
    var extra = byId('dlg-extra');
    extra.textContent = o.extra ? o.extra.label : '';
    extra.hidden = !o.extra;
    byId('dlg-ok').textContent = o.ok;
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
    var input = byId('act-name');
    if (input) add.name = input.value;
    var name = add.name.trim();
    if (!name) {
      var err = byId('name-err');
      if (err) err.hidden = false;
      if (input) input.focus();
      return;
    }
    var fav = add.favId ? findFav(add.favId) : null;
    var entry = {
      id: uuid(), ts: Date.now(), day: L.dayKey(new Date()), type: add.type, pts: L.clampPts(add.pts),
      pub: BACKEND && !!add.pub, cheers: 0, sync: 1
    };
    if (fav && fav.key && favName(fav) === name) entry.key = fav.key; else entry.name = name;
    data.entries.push(entry);
    if (add.keep && keepVisible()) {
      data.favs.push({ id: uuid(), type: add.type, name: name, pts: entry.pts });
      data.favsRev++;
    }
    if (BACKEND && add.type === 'plus') data.pubDefault = !!add.pub;
    persist();
    navigate('azi', true);
    toast(L.fmt(L.signed(entry)) + ' · ' + nameOf(entry));
    queueSync();
  }

  function removeEntry(id) {
    var e = findEntry(id);
    if (!e) return;
    data.entries = data.entries.filter(function (x) { return x.id !== id; });
    if (BACKEND) {
      data.outbox.vis = data.outbox.vis.filter(function (op) { return op.id !== id; });
      /* Ce a ajuns deja pe server, sau e chiar acum pe drum, trebuie sters si acolo. */
      if (e.sync !== 1 || inflight[id]) data.outbox.del.push(id);
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
    if (BACKEND) o.extra = { label: tr(e.pub ? 'makePrivate' : 'makePublic'), fn: function () { setVisibility(id, !e.pub); } };
    openDialog(o);
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
    } else if (act === 'fav') {
      var f = findFav(id);
      if (!f) return;
      if (add.favId === id) { add.favId = null; add.name = ''; }
      else { add.favId = id; add.name = favName(f); add.pts = f.pts; }
      render();
    } else if (act === 'step') {
      add.pts = L.clampPts(add.pts + Number(b.getAttribute('data-d')));
      syncAdd();
    } else if (act === 'pub') {
      add.pub = b.getAttribute('data-v') === '1';
      render();
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
      if (BACKEND && auth === 'in' && before !== lang) feed = newFeed();
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
      sync();
    } else if (act === 'feed-lang') {
      feed.all = b.getAttribute('data-all') === '1';
      feed.ready = false;
      feed.items = [];
      loadFeed(true);
    } else if (act === 'feed-refresh') {
      loadFeed(true);
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
    if (el.id !== 'act-name') return;
    add.name = el.value;
    if (add.favId) {
      var f = findFav(add.favId);
      if (!f || favName(f) !== el.value) add.favId = null;
    }
    var err = byId('name-err');
    if (err) err.hidden = true;
    syncAdd();
  }

  function onSubmit(ev) {
    var id = ev.target && ev.target.id;
    if (id !== 'add-form' && id !== 'auth-form' && id !== 'name-form') return;
    ev.preventDefault();
    if (id === 'add-form') saveAdd();
    else if (id === 'auth-form') submitAuth();
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
    route = routeFromHash();
    if (isAddRoute(route)) resetAdd(route);
    if (route === 'nume') nameForm.value = data.name;

    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('change', function (ev) {
      if (ev.target && ev.target.id === 'keep-fav') add.keep = ev.target.checked;
    });
    document.addEventListener('submit', onSubmit);
    window.addEventListener('popstate', onHistory);
    window.addEventListener('hashchange', onHistory);
    window.addEventListener('online', function () { syncFails = 0; queueSync(200); });
    /* La revenirea in aplicatie se recalculeaza ziua curenta si se aduc noutatile din cont. */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden || (BACKEND && auth !== 'in')) return;
      render();
      if (BACKEND) {
        if (pendingCount() > 0 || Date.now() - data.lastSync > 60000) queueSync(200);
        if (route === 'flux') openFeed();
      }
    });
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
    byId('dlg-cancel').addEventListener('click', closeDialog);
    dlg.addEventListener('click', function (ev) { if (ev.target === dlg) closeDialog(); });
    dlg.addEventListener('close', function () {
      dlgOk = null;
      dlgExtra = null;
      if (dlgOpener && document.contains(dlgOpener)) dlgOpener.focus();
      dlgOpener = null;
    });

    if (BACKEND) {
      boot();
      if (route === 'flux' && auth === 'in') openFeed();
    } else {
      render();
    }

    if (CFG.pwa && 'serviceWorker' in navigator && window.location.protocol === 'https:') {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () { /* aplicatia merge si fara */ });
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
