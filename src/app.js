/* Scorul zilei: interfata. Etapa 1, datele raman pe dispozitiv (localStorage). */
(function () {
  'use strict';

  var CFG = window.SCOR_BUILD || {};
  var VERSION = '0.1';
  var KEY = 'scor.v1';
  var ROUTES = ['azi', 'jurnal', 'profil', 'plus', 'minus'];
  var FLAME = 'M12 2.6c1 4.5 6.25 7 6.25 13.1a6.25 6.25 0 0 1-12.5 0c0-2.4 1-4.2 2.4-5.6.2 1.7 1.1 2.9 2.2 3.4C9.7 9.7 10.6 5.8 12 2.6z';

  /* Toate textele aplicatiei, pe limbi. O limba noua inseamna un bloc nou aici. */
  var T = {
    ro: {
      sections: 'Sectiuni', today: 'Azi', todayShort: 'Azi', journal: 'Jurnal', profile: 'Profil',
      pointsToday: 'puncte azi', streakLabel: 'serie pe plus', days7: 'pe 7 zile', bestLabel: 'record',
      day: ['zi', 'zile'], activity: ['activitate', 'activitati'],
      addGood: 'Fapta buna', addBad: 'Mai putin buna',
      todayList: 'Activitatile de azi', emptyToday: 'Nimic notat azi.', emptyTodayHint: 'Incepe cu o fapta buna.',
      newActivity: 'Activitate noua', close: 'Inchide', typeLabel: 'Felul activitatii',
      favorites: 'Favorite', noFavs: 'Nicio favorita aici. Scrie o activitate mai jos.',
      orWrite: 'Sau scrie una noua', writeOne: 'Scrie activitatea', namePh: 'De exemplu: 20 de flotari',
      points: 'Puncte', pointsRange: 'intre 1 si 20', less: 'Scade un punct', more: 'Adauga un punct',
      keepFav: 'Pastreaza in favorite', save: 'Salveaza', nameMissing: 'Scrie un nume sau alege din favorite.',
      last7: 'ultimele 7 zile', streakOf: 'serie de {x}', noStreak: 'nicio serie inca', chartAria: 'Scorul pe ultimele 7 zile',
      byDay: 'Pe zile', emptyJournal: 'Jurnalul e gol.', emptyJournalHint: 'Activitatile notate apar aici, pe zile.',
      allPlus: 'toate pe plus', allMinus: 'toate pe minus', mix: '{p} pe plus, {m} pe minus',
      del: 'Sterge', cancel: 'Renunta', deleted: 'Activitate stearsa',
      language: 'Limba', favsPlus: 'Favorite pe plus', favsMinus: 'Favorite pe minus',
      removeFav: 'Scoate din favorite: {x}', favRemoved: 'Scoasa din favorite', noFavsProfile: 'Nicio favorita.',
      yourData: 'Datele tale',
      dataNote: 'Datele raman doar pe acest dispozitiv. Conturile si fluxul public vin in etapa urmatoare.',
      resetAll: 'Sterge toate datele', resetTitle: 'Stergi toate datele?',
      resetBody: 'Activitatile si favoritele tale se pierd si nu pot fi recuperate.',
      resetOk: 'Sterge tot', resetDone: 'Datele au fost sterse', version: 'Versiunea {x}',
      demoNote: 'Vezi date de exemplu.', demoClear: 'Incepe de la zero', demoCleared: 'Exemplele au fost sterse',
      days: ['duminica', 'luni', 'marti', 'miercuri', 'joi', 'vineri', 'sambata'],
      daysShort: ['Du', 'Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sa'],
      months: ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'],
      fav: {
        gym: 'Sala', read: 'Citit', walk: 'Mers pe jos', meditate: 'Meditatie', water: 'Apa 2 litri', sleep: 'Somn la timp',
        smoke: 'Tigara', junk: 'Fast food', alcohol: 'Alcool', phone: 'Prea mult pe telefon', late: 'Culcat tarziu', sweets: 'Dulciuri'
      }
    },
    en: {
      sections: 'Sections', today: 'Today', todayShort: '', journal: 'Journal', profile: 'Profile',
      pointsToday: 'points today', streakLabel: 'day streak', days7: 'in 7 days', bestLabel: 'best streak',
      day: ['day', 'days'], activity: ['activity', 'activities'],
      addGood: 'Good deed', addBad: 'Not so good',
      todayList: 'Today’s activities', emptyToday: 'Nothing logged today.', emptyTodayHint: 'Start with a good deed.',
      newActivity: 'New activity', close: 'Close', typeLabel: 'Kind of activity',
      favorites: 'Favorites', noFavs: 'No favorites here. Write an activity below.',
      orWrite: 'Or write a new one', writeOne: 'Write the activity', namePh: 'For example: 20 pushups',
      points: 'Points', pointsRange: 'from 1 to 20', less: 'One point less', more: 'One point more',
      keepFav: 'Keep in favorites', save: 'Save', nameMissing: 'Write a name or pick a favorite.',
      last7: 'last 7 days', streakOf: 'streak: {x}', noStreak: 'no streak yet', chartAria: 'Score for the last 7 days',
      byDay: 'By day', emptyJournal: 'The journal is empty.', emptyJournalHint: 'Logged activities show up here, day by day.',
      allPlus: 'all plus', allMinus: 'all minus', mix: '{p} plus, {m} minus',
      del: 'Delete', cancel: 'Cancel', deleted: 'Activity deleted',
      language: 'Language', favsPlus: 'Plus favorites', favsMinus: 'Minus favorites',
      removeFav: 'Remove from favorites: {x}', favRemoved: 'Removed from favorites', noFavsProfile: 'No favorites.',
      yourData: 'Your data',
      dataNote: 'Your data stays on this device only. Accounts and the public feed come in the next stage.',
      resetAll: 'Delete all data', resetTitle: 'Delete all data?',
      resetBody: 'Your activities and favorites will be lost and cannot be recovered.',
      resetOk: 'Delete everything', resetDone: 'Data deleted', version: 'Version {x}',
      demoNote: 'You are viewing example data.', demoClear: 'Start from zero', demoCleared: 'Examples deleted',
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
    close: '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg>',
    x: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };

  var data, lang, route = 'azi';
  var add = { type: 'plus', favId: null, name: '', pts: 10, keep: false };
  var openDays = {};
  var appEl, viewEl, navEl, toastEl, dlg;
  var toastTimer = null, dlgOk = null, dlgOpener = null, shownDay = '';

  /* ---------- mici ajutoare ---------- */

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

  function favName(f) { return f.key ? (tr('fav')[f.key] || f.key) : f.name; }
  function nameOf(e) { return e.key ? (tr('fav')[e.key] || e.key) : e.name; }
  function tone(n) { return n > 0 ? 'pos' : n < 0 ? 'neg' : ''; }
  function kind(n) { return n > 0 ? 'plus' : n < 0 ? 'minus' : ''; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function isAddRoute(r) { return r === 'plus' || r === 'minus'; }

  /* ---------- date ---------- */

  function load() {
    try { var raw = window.localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }

  function persist() {
    try { window.localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* aplicatia merge si fara salvare */ }
  }

  function fresh() {
    return {
      v: 1, lang: null, demo: false, entries: [],
      favs: DEFAULT_FAVS.map(function (f) { return { id: 'd-' + f[0], key: f[0], type: f[1], pts: f[2] }; })
    };
  }

  function usable(d) { return !!d && d.v === 1 && Array.isArray(d.entries) && Array.isArray(d.favs); }

  function okItem(x) {
    return !!x && (x.type === 'plus' || x.type === 'minus') && x.pts >= 1 && x.pts <= 20 &&
      (typeof x.key === 'string' || typeof x.name === 'string');
  }

  function clean(d) {
    d.entries = d.entries.filter(function (e) { return okItem(e) && /^\d{4}-\d{2}-\d{2}$/.test(e.day) && typeof e.id === 'string'; });
    d.favs = d.favs.filter(function (f) { return okItem(f) && typeof f.id === 'string'; });
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
    plan.forEach(function (list, ago) {
      var day = L.addDays(today, -ago), base = L.parseDay(day).getTime();
      list.forEach(function (a, i) {
        /* Azi: ore intre 7 dimineata si acum, ca exemplele sa nu apara in viitor sau in toiul noptii. */
        var from = now.getTime() - (start + 7 * 3600000) > 1800000 ? start + 7 * 3600000 : start;
        var ts = ago === 0
          ? from + Math.round((i + 1) * (now.getTime() - from) / (list.length + 1))
          : base + (8 + i * 3) * 3600000;
        d.entries.push({ id: 'x' + ago + '-' + i, ts: ts, day: day, type: a[1], pts: a[2], key: a[0] });
      });
    });
    d.demo = true;
  }

  function initData() {
    var d = load();
    if (usable(d)) { data = clean(d); return; }
    data = fresh();
    if (CFG.demo) seedDemo(data);
  }

  function pickLang() {
    if (data.lang === 'ro' || data.lang === 'en') return data.lang;
    if (CFG.lang === 'ro' || CFG.lang === 'en') return CFG.lang;
    var n = '';
    try { n = (navigator.language || '').toLowerCase(); } catch (e) { /* ramane engleza */ }
    return n.indexOf('ro') === 0 ? 'ro' : 'en';
  }

  /* ---------- ecrane ---------- */

  function demoBanner() {
    if (!data.demo) return '';
    return '<div class="demo"><span>' + esc(tr('demoNote')) + '</span>' +
      '<button type="button" data-act="demo-clear" data-focus="demo-clear">' + esc(tr('demoClear')) + '</button></div>';
  }

  function rowEntry(e) {
    return '<li><button type="button" class="row" data-act="entry" data-id="' + esc(e.id) + '" data-focus="e-' + esc(e.id) + '">' +
      '<span class="row-main"><span class="row-t">' + esc(nameOf(e)) + '</span><span class="row-s">' + timeOf(e.ts) + '</span></span>' +
      '<span class="pill ' + e.type + '">' + L.fmt(L.signed(e)) + '</span></button></li>';
  }

  function viewToday() {
    var now = new Date(), today = L.dayKey(now), t = L.totals(data.entries);
    var total = t[today] || 0;
    var list = data.entries.filter(function (e) { return e.day === today; }).sort(function (a, b) { return b.ts - a.ts; });
    var week = L.lastDays(today, 7).reduce(function (s, k) { return s + (t[k] || 0); }, 0);
    var streak = L.currentStreak(t, today), best = L.bestStreak(t);
    return '' +
      '<header class="head"><h1 id="title" tabindex="-1">' + esc(tr('today')) + '</h1><p class="head-sub">' + esc(longDate(now)) + '</p></header>' +
      demoBanner() +
      '<section class="hero" aria-label="' + esc(tr('pointsToday')) + '">' +
        '<div class="hero-num ' + tone(total) + '" id="score">' + L.fmt(total) + '</div>' +
        '<div class="hero-label">' + esc(tr('pointsToday')) + '</div>' +
      '</section>' +
      '<div class="stats">' +
        '<div class="stat"><div class="stat-num" id="streak">' + ICON.flame + esc(count(streak, tr('day'))) + '</div><div class="stat-label">' + esc(tr('streakLabel')) + '</div></div>' +
        '<div class="stat"><div class="stat-num ' + tone(week) + '" id="week">' + L.fmt(week) + '</div><div class="stat-label">' + esc(tr('days7')) + '</div></div>' +
        '<div class="stat"><div class="stat-num" id="best">' + esc(count(best, tr('day'))) + '</div><div class="stat-label">' + esc(tr('bestLabel')) + '</div></div>' +
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

  function viewProfile() {
    return '' +
      '<header class="head"><h1 id="title" tabindex="-1">' + esc(tr('profile')) + '</h1><p class="head-sub">' + esc(tr('version', { x: VERSION })) + '</p></header>' +
      '<section class="sect"><h2 id="lang-h">' + esc(tr('language')) + '</h2>' +
        '<div class="seg" role="group" aria-labelledby="lang-h">' +
          '<button type="button" class="seg-b" aria-pressed="' + (lang === 'ro') + '" data-act="lang" data-lang="ro" data-focus="lang-ro">Romana</button>' +
          '<button type="button" class="seg-b" aria-pressed="' + (lang === 'en') + '" data-act="lang" data-lang="en" data-focus="lang-en">English</button>' +
        '</div></section>' +
      '<section class="sect"><h2>' + esc(tr('favsPlus')) + '</h2>' + favList('plus') + '</section>' +
      '<section class="sect"><h2>' + esc(tr('favsMinus')) + '</h2>' + favList('minus') + '</section>' +
      '<section class="sect"><h2>' + esc(tr('yourData')) + '</h2><p class="note">' + esc(tr('dataNote')) + '</p>' +
        '<button type="button" class="btn-line" data-act="reset" data-focus="reset">' + esc(tr('resetAll')) + '</button></section>';
  }

  /* ---------- afisare ---------- */

  function renderNav(hidden) {
    navEl.hidden = hidden;
    navEl.setAttribute('aria-label', tr('sections'));
    navEl.innerHTML = '<div class="nav-in">' + [['azi', 'today'], ['jurnal', 'journal'], ['profil', 'profile']].map(function (r) {
      return '<a href="#' + r[0] + '" data-route="' + r[0] + '"' + (route === r[0] ? ' aria-current="page"' : '') + '><span>' + esc(tr(r[1])) + '</span></a>';
    }).join('') + '</div>';
  }

  function render() {
    var act = document.activeElement, fkey = null, caret = null;
    if (act && viewEl.contains(act)) {
      fkey = act.getAttribute('data-focus');
      if (act.id === 'act-name') {
        fkey = '#name';
        try { caret = [act.selectionStart, act.selectionEnd]; } catch (e) { caret = null; }
      }
    }
    var adding = isAddRoute(route);
    shownDay = L.dayKey(new Date());
    appEl.classList.toggle('is-add', adding);
    viewEl.innerHTML = (route === 'jurnal' ? viewJournal : route === 'profil' ? viewProfile : adding ? viewAdd : viewToday)();
    renderNav(adding);
    if (fkey === '#name') {
      var inp = document.getElementById('act-name');
      if (inp) {
        inp.focus({ preventScroll: true });
        if (caret) { try { inp.setSelectionRange(caret[0], caret[1]); } catch (e) { /* fara pozitie */ } }
      }
    } else if (fkey) {
      var el = viewEl.querySelector('[data-focus="' + fkey + '"]');
      if (el) el.focus({ preventScroll: true });
    }
  }

  function focusTitle() {
    var t = document.getElementById('title');
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

  function resetAdd(type) { add = { type: type, favId: null, name: '', pts: 10, keep: false }; }

  function navigate(r, replace) {
    if (ROUTES.indexOf(r) < 0) r = 'azi';
    if (r === route && !isAddRoute(r)) { window.scrollTo(0, 0); return; }
    if (isAddRoute(r)) resetAdd(r);
    route = r;
    hideToast();
    try { window.history[replace ? 'replaceState' : 'pushState'](null, '', '#' + r); } catch (e) { /* merge si fara istoric */ }
    render();
    window.scrollTo(0, 0);
    focusTitle();
  }

  function onHistory() {
    var r = routeFromHash();
    if (r === route) return;
    if (isAddRoute(r)) resetAdd(r);
    route = r;
    hideToast();
    render();
  }

  /* ---------- dialog ---------- */

  function openDialog(o) {
    dlgOpener = document.activeElement;
    dlgOk = o.onOk;
    document.getElementById('dlg-t').textContent = o.title;
    var body = document.getElementById('dlg-b');
    body.textContent = o.body || '';
    body.hidden = !o.body;
    document.getElementById('dlg-ok').textContent = o.ok;
    document.getElementById('dlg-cancel').textContent = o.cancel;
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    document.getElementById('dlg-cancel').focus();
  }

  function closeDialog() {
    if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
  }

  /* ---------- actiuni ---------- */

  function findFav(id) { for (var i = 0; i < data.favs.length; i++) if (data.favs[i].id === id) return data.favs[i]; return null; }
  function findEntry(id) { for (var i = 0; i < data.entries.length; i++) if (data.entries[i].id === id) return data.entries[i]; return null; }

  /* Actualizeaza formularul fara sa il redeseneze, ca sa nu se piarda cursorul din campul de text. */
  function syncAdd() {
    var chips = viewEl.querySelectorAll('.chip');
    for (var i = 0; i < chips.length; i++) chips[i].setAttribute('aria-pressed', String(chips[i].getAttribute('data-id') === add.favId));
    var keep = document.getElementById('keep-row');
    if (keep) keep.hidden = !keepVisible();
    var val = document.getElementById('pts-val');
    if (val) val.textContent = add.pts;
    var save = document.getElementById('save-btn');
    if (save) save.textContent = saveLabel();
  }

  function saveAdd() {
    var input = document.getElementById('act-name');
    if (input) add.name = input.value;
    var name = add.name.trim();
    if (!name) {
      var err = document.getElementById('name-err');
      if (err) err.hidden = false;
      if (input) input.focus();
      return;
    }
    var fav = add.favId ? findFav(add.favId) : null;
    var entry = { id: uid(), ts: Date.now(), day: L.dayKey(new Date()), type: add.type, pts: L.clampPts(add.pts) };
    if (fav && fav.key && favName(fav) === name) entry.key = fav.key; else entry.name = name;
    data.entries.push(entry);
    if (add.keep && keepVisible()) data.favs.push({ id: uid(), type: add.type, name: name, pts: entry.pts });
    persist();
    navigate('azi', true);
    toast(L.fmt(L.signed(entry)) + ' · ' + nameOf(entry));
  }

  function askEntry(id) {
    var e = findEntry(id);
    if (!e) return;
    var today = L.dayKey(new Date());
    openDialog({
      title: nameOf(e),
      body: L.fmt(L.signed(e)) + ' · ' + dayTitle(e.day, today) + ', ' + timeOf(e.ts),
      ok: tr('del'), cancel: tr('close'),
      onOk: function () {
        data.entries = data.entries.filter(function (x) { return x.id !== id; });
        persist();
        render();
        focusTitle();
        toast(tr('deleted'));
      }
    });
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
    } else if (act === 'entry') {
      askEntry(id);
    } else if (act === 'day') {
      var k = b.getAttribute('data-day');
      openDays[k] = !openDays[k];
      render();
    } else if (act === 'lang') {
      lang = b.getAttribute('data-lang') === 'en' ? 'en' : 'ro';
      data.lang = lang;
      persist();
      document.documentElement.lang = lang;
      render();
    } else if (act === 'unfav') {
      data.favs = data.favs.filter(function (x) { return x.id !== id; });
      persist();
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
    }
  }

  function onInput(ev) {
    var el = ev.target;
    if (!el || el.id !== 'act-name') return;
    add.name = el.value;
    if (add.favId) {
      var f = findFav(add.favId);
      if (!f || favName(f) !== el.value) add.favId = null;
    }
    var err = document.getElementById('name-err');
    if (err) err.hidden = true;
    syncAdd();
  }

  function start() {
    appEl = document.getElementById('app');
    viewEl = document.getElementById('view');
    navEl = document.getElementById('nav');
    toastEl = document.getElementById('toast');
    dlg = document.getElementById('dlg');

    initData();
    lang = pickLang();
    document.documentElement.lang = lang;
    route = routeFromHash();
    if (isAddRoute(route)) resetAdd(route);
    render();

    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('change', function (ev) {
      if (ev.target && ev.target.id === 'keep-fav') add.keep = ev.target.checked;
    });
    document.addEventListener('submit', function (ev) {
      if (ev.target && ev.target.id === 'add-form') { ev.preventDefault(); saveAdd(); }
    });
    window.addEventListener('popstate', onHistory);
    window.addEventListener('hashchange', onHistory);
    /* La revenirea in aplicatie se recalculeaza ziua curenta. */
    document.addEventListener('visibilitychange', function () { if (!document.hidden) render(); });
    /* Aplicatia lasata deschisa peste miezul noptii trece singura la ziua noua. */
    setInterval(function () { if (L.dayKey(new Date()) !== shownDay && !dlg.open) render(); }, 60000);

    document.getElementById('dlg-ok').addEventListener('click', function () {
      var fn = dlgOk;
      closeDialog();
      if (fn) fn();
    });
    document.getElementById('dlg-cancel').addEventListener('click', closeDialog);
    dlg.addEventListener('click', function (ev) { if (ev.target === dlg) closeDialog(); });
    dlg.addEventListener('close', function () {
      dlgOk = null;
      if (dlgOpener && document.contains(dlgOpener)) dlgOpener.focus();
      dlgOpener = null;
    });

    if (CFG.pwa && 'serviceWorker' in navigator && window.location.protocol === 'https:') {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () { /* aplicatia merge si fara */ });
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
