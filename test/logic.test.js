const assert = require('assert');
const L = require('../src/logic.js');

// zile: treceri de luna, de an, an bisect si schimbarea orei (29 martie si 25 octombrie 2026 in Romania)
assert.strictEqual(L.dayKey(new Date(2026, 9, 13, 23, 59)), '2026-10-13');
assert.strictEqual(L.dayKey(new Date(2026, 0, 5, 0, 0)), '2026-01-05');
assert.strictEqual(L.addDays('2026-10-31', 1), '2026-11-01');
assert.strictEqual(L.addDays('2026-01-01', -1), '2025-12-31');
assert.strictEqual(L.addDays('2028-02-28', 1), '2028-02-29');
assert.strictEqual(L.addDays('2026-03-28', 1), '2026-03-29');
assert.strictEqual(L.addDays('2026-03-29', 1), '2026-03-30');
assert.strictEqual(L.addDays('2026-10-24', 1), '2026-10-25');
assert.strictEqual(L.addDays('2026-10-25', 1), '2026-10-26');
assert.strictEqual(L.addDays('2026-10-26', -1), '2026-10-25');
assert.deepStrictEqual(L.lastDays('2026-10-13', 3), ['2026-10-11', '2026-10-12', '2026-10-13']);
assert.strictEqual(L.lastDays('2026-10-27', 7)[0], '2026-10-21');

// scorul pe zile
const E = (day, type, pts) => ({ day, type, pts });
assert.deepStrictEqual(
  L.totals([E('2026-10-13', 'plus', 10), E('2026-10-13', 'minus', 10), E('2026-10-12', 'plus', 5)]),
  { '2026-10-13': 0, '2026-10-12': 5 });
assert.deepStrictEqual(L.totals([]), {});

// seria curenta
const week = { '2026-10-13': 25, '2026-10-12': 25, '2026-10-11': 30, '2026-10-10': 15, '2026-10-09': 30, '2026-10-08': 20, '2026-10-07': -5 };
assert.strictEqual(L.currentStreak(week, '2026-10-13'), 6);
const morning = Object.assign({}, week); delete morning['2026-10-13'];
assert.strictEqual(L.currentStreak(morning, '2026-10-13'), 5, 'dimineata, fara nimic notat, seria ramane cea de ieri');
assert.strictEqual(L.currentStreak(Object.assign({}, week, { '2026-10-13': -10 }), '2026-10-13'), 5, 'o zi inca pe minus nu rupe seria pana la sfarsitul ei');
assert.strictEqual(L.currentStreak(Object.assign({}, week, { '2026-10-13': 0 }), '2026-10-13'), 5);
assert.strictEqual(L.currentStreak({ '2026-10-13': 5, '2026-10-11': 5 }, '2026-10-13'), 1, 'o zi lipsa rupe seria');
assert.strictEqual(L.currentStreak({}, '2026-10-13'), 0);
assert.strictEqual(L.currentStreak({ '2026-10-10': 5 }, '2026-10-13'), 0);
assert.strictEqual(L.currentStreak({ '2026-10-12': -5 }, '2026-10-13'), 0);
assert.strictEqual(L.currentStreak({ '2026-11-01': 5, '2026-10-31': 5, '2026-10-30': 5 }, '2026-11-01'), 3, 'peste trecerea de luna');
assert.strictEqual(L.currentStreak({ '2026-10-26': 5, '2026-10-25': 5, '2026-10-24': 5 }, '2026-10-26'), 3, 'peste schimbarea orei');

// recordul
assert.strictEqual(L.bestStreak(week), 6);
assert.strictEqual(L.bestStreak({}), 0);
assert.strictEqual(L.bestStreak({ '2026-01-01': -1 }), 0);
assert.strictEqual(L.bestStreak({ '2026-01-01': 1, '2026-01-02': 1, '2026-01-04': 1, '2026-01-05': 1, '2026-01-06': 1, '2026-01-07': -3, '2026-01-08': 2 }), 3);
assert.strictEqual(L.bestStreak({ '2026-01-30': 1, '2026-01-31': 1, '2026-02-01': 1 }), 3);

// afisare si limite
assert.strictEqual(L.fmt(10), '+10');
assert.strictEqual(L.fmt(-10), '−10');
assert.strictEqual(L.fmt(0), '0');
assert.strictEqual(L.signed({ type: 'minus', pts: 7 }), -7);
assert.strictEqual(L.signed({ type: 'plus', pts: 7 }), 7);
assert.strictEqual(L.clampPts(0), 1);
assert.strictEqual(L.clampPts(21), 20);
assert.strictEqual(L.clampPts('x'), 1);
assert.strictEqual(L.clampPts(7.6), 8);
assert.strictEqual(L.clampPts(-3), 1);

console.log('logic: toate verificarile au trecut');
