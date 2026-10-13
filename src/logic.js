/* Scorul zilei: reguli de calcul, fara interfata. Aceleasi functii vor fi folosite si cand datele vin de pe server. */
var L = (function () {
  'use strict';

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* Cheia unei zile in ora locala, de forma 2026-10-13. */
  function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  function parseDay(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }

  function addDays(k, n) { var d = parseDay(k); d.setDate(d.getDate() + n); return dayKey(d); }

  /* Punctele unei activitati, cu semn. */
  function signed(e) { return e.type === 'minus' ? -e.pts : e.pts; }

  /* Scorul fiecarei zile care are cel putin o activitate. */
  function totals(entries) {
    var m = {};
    entries.forEach(function (e) { m[e.day] = (m[e.day] || 0) + signed(e); });
    return m;
  }

  /* Seria curenta: zile la rand terminate pe plus. Ziua de azi conteaza doar daca e deja pe plus,
     altfel seria se numara pana ieri, ca sa nu apara zero dimineata. */
  function currentStreak(t, today) {
    var k = (t[today] || 0) > 0 ? today : addDays(today, -1);
    var n = 0;
    while ((t[k] || 0) > 0) { n++; k = addDays(k, -1); }
    return n;
  }

  /* Cea mai lunga serie de pana acum. */
  function bestStreak(t) {
    var keys = Object.keys(t).filter(function (k) { return t[k] > 0; }).sort();
    var best = 0, run = 0, prev = null;
    keys.forEach(function (k) {
      run = (prev && addDays(prev, 1) === k) ? run + 1 : 1;
      if (run > best) best = run;
      prev = k;
    });
    return best;
  }

  /* Ultimele n zile, de la cea mai veche la azi. */
  function lastDays(today, n) {
    var out = [];
    for (var i = n - 1; i >= 0; i--) out.push(addDays(today, -i));
    return out;
  }

  function fmt(n) { return n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0'; }

  /* Punctele unei activitati raman intre 1 si 20. */
  function clampPts(n) {
    n = Math.round(Number(n));
    if (!isFinite(n)) n = 1;
    return Math.max(1, Math.min(20, n));
  }

  return {
    pad: pad, dayKey: dayKey, parseDay: parseDay, addDays: addDays, signed: signed, totals: totals,
    currentStreak: currentStreak, bestStreak: bestStreak, lastDays: lastDays, fmt: fmt, clampPts: clampPts
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = L;
