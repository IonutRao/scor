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

  /* Luna unei zile ('2026-10-15' -> '2026-10') si luna de dinainte sau de dupa. */
  function monthOf(day) { return day.slice(0, 7); }
  function addMonths(ym, n) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n;
    y += Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    return y + '-' + pad(m + 1);
  }

  /* Rezumatul unei luni pentru un set de activitati (ale unui copil, de pilda): total, zile notate, zile pe plus,
     cea mai buna zi, cea mai lunga serie din luna, numarul de activitati si activitatile lunii in ordinea notarii. */
  function monthStats(entries, ym) {
    var list = entries.filter(function (e) { return monthOf(e.day) === ym; }).sort(function (a, b) { return a.ts - b.ts; });
    var t = totals(list), days = Object.keys(t).sort(), total = 0, up = 0, best = null, run = 0, streak = 0, prev = null;
    days.forEach(function (k) {
      total += t[k];
      if (t[k] > 0) {
        up++;
        if (!best || t[k] > t[best]) best = k;
        run = prev && addDays(prev, 1) === k ? run + 1 : 1;
        if (run > streak) streak = run;
        prev = k;
      } else { run = 0; prev = null; }
    });
    return { total: total, days: days.length, up: up, best: best, bestVal: best ? t[best] : 0, streak: streak, count: list.length, list: list };
  }

  /* Punctele unei activitati raman intre 1 si 20. */
  function clampPts(n) {
    n = Math.round(Number(n));
    if (!isFinite(n)) n = 1;
    return Math.max(1, Math.min(20, n));
  }

  /* Detaliile unei activitati, aduse la forma in care se pastreaza: randuri curate, cel mult NOTE_MAX caractere.
     Aceeasi regula ca functia note_text din supabase/schema.sql. */
  var NOTE_MAX = 300;
  function trimNote(s) { return s.replace(/^[ \n]+|[ \n]+$/g, ''); }
  function cleanNote(s) {
    s = String(s == null ? '' : s)
      .replace(/([\uD800-\uDBFF][\uDC00-\uDFFF])|[\uD800-\uDFFF]/g, '$1') /* jumatati de caracter ramase singure */
      .replace(/\r\n?/g, '\n')
      .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ')
      .replace(/\n{3,}/g, '\n\n');
    return trimNote(Array.from(trimNote(s)).slice(0, NOTE_MAX).join(''));
  }

  return {
    pad: pad, dayKey: dayKey, parseDay: parseDay, addDays: addDays, signed: signed, totals: totals,
    currentStreak: currentStreak, bestStreak: bestStreak, lastDays: lastDays, fmt: fmt, clampPts: clampPts,
    NOTE_MAX: NOTE_MAX, cleanNote: cleanNote, monthOf: monthOf, addMonths: addMonths, monthStats: monthStats
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = L;
