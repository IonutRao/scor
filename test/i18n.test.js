const assert = require('assert');
const T = require('../src/i18n.js');

// Fiecare limba are aceleasi texte ca romana: aceleasi chei, acelasi fel, aceleasi locuri de completat.
assert.deepStrictEqual(Object.keys(T), ['ro', 'en']);
const holes = (s) => (s.match(/\{[a-z]+\}/g) || []).sort().join();
const all = { ro: [], en: [] };

function same(a, b, path, lang) {
  if (typeof a === 'string') {
    assert.strictEqual(typeof b, 'string', lang + ': ' + path + ' trebuie sa fie text');
    assert.strictEqual(holes(b), holes(a), lang + ': ' + path + ' are alte locuri de completat decat in romana');
    all[lang].push([path, b]);
    return;
  }
  assert.ok(b && typeof b === 'object', lang + ': lipseste ' + path);
  assert.strictEqual(Array.isArray(b), Array.isArray(a), lang + ': ' + path + ' are alt fel');
  assert.deepStrictEqual(Object.keys(b).sort(), Object.keys(a).sort(), lang + ': ' + path + ' are alte chei decat romana');
  Object.keys(a).forEach((k) => same(a[k], b[k], path ? path + '.' + k : k, lang));
}
Object.keys(T).forEach((lang) => same(T.ro, T[lang], '', lang));

// Curatenie: fara spatii la capete sau duble, iar literele cu semne sunt scrise intr-un singur fel.
Object.keys(all).forEach((lang) => all[lang].forEach(([path, s]) => {
  assert.strictEqual(s, s.trim(), lang + ': ' + path + ' are spatii la capete');
  assert.ok(!/ {2}/.test(s), lang + ': ' + path + ' are spatii duble');
  assert.strictEqual(s, s.normalize('NFC'), lang + ': ' + path + ' nu este in forma compusa');
}));

// Romana: s si t cu virgula dedesubt, niciodata cu sedila.
all.ro.forEach(([path, s]) => {
  assert.ok(!/[ŞşŢţ]/.test(s), 'ro: ' + path + ' foloseste s sau t cu sedila in loc de virgula');
});

// Romana: cuvinte dese care se scriu mereu cu diacritice. Daca apar fara, textul a fost scris in graba.
const BARE = ['in', 'si', 'sa', 'fara', 'pana', 'cand', 'inca', 'intre', 'dupa', 'tau', 'esti', 'iti', 'isi', 'asa', 'catre', 'cateva',
  'incearca', 'sterge', 'salveaza', 'activitati', 'incurajari', 'buna', 'putin', 'romana'];
all.ro.forEach(([path, s]) => {
  s.toLowerCase().split(/[^\p{L}]+/u).forEach((w) => {
    assert.ok(BARE.indexOf(w) < 0, 'ro: ' + path + ' contine "' + w + '" fara diacritice: ' + s);
  });
});

// Zilele si lunile au numarul potrivit de nume, iar favoritele de pornire au nume in fiecare limba.
Object.keys(T).forEach((lang) => {
  assert.strictEqual(T[lang].days.length, 7);
  assert.strictEqual(T[lang].daysShort.length, 7);
  assert.strictEqual(T[lang].months.length, 12);
  ['day', 'activity', 'minute', 'hour', 'cheerForms', 'changeForms'].forEach((k) => assert.strictEqual(T[lang][k].length, 2, lang + ': ' + k));
  assert.strictEqual(Object.keys(T[lang].fav).length, 12);
});

// Cateva texte vazute des, ca dovada ca romana este cea cu diacritice.
assert.strictEqual(T.ro.addGood, 'Faptă bună');
assert.strictEqual(T.ro.addBad, 'Mai puțin bună');
assert.strictEqual(T.ro.fav.smoke, 'Țigară');
assert.strictEqual(T.ro.days[6], 'sâmbătă');

console.log('texte: ' + all.ro.length + ' in romana, ' + all.en.length + ' in engleza, toate verificarile au trecut');
