/* Scorul zilei: pozele, pe dispozitiv. Micsoreaza poza aleasa de om si o pastreaza pana cand ajunge in cont.
   Nimic de aici nu vorbeste cu reteaua. */
var PHOTO = (function () {
  'use strict';

  /* Latura cea mai lunga a pozei pastrate, marimea de fisier dorita si cea peste care serverul refuza. */
  var SIDE = 1280, TARGET = 350 * 1024, LIMIT = 1000 * 1024;
  /* Incercarile de micsorare, pe rand, pana cand fisierul ajunge destul de mic: latura si calitatea. */
  var STEPS = [[1280, 0.82], [1280, 0.7], [1024, 0.7], [800, 0.6]];
  var DB = 'scor-poze', STORE = 'poze';
  var NAME = /^[0-9a-f]{16}-(\d{1,4})x(\d{1,4})\.jpg$/;
  var memory = {}, opening = null, tail = Promise.resolve();

  function token() {
    var b = new Uint8Array(8), s = '';
    window.crypto.getRandomValues(b);
    for (var i = 0; i < b.length; i++) s += (b[i] + 0x100).toString(16).slice(1);
    return s;
  }

  /* Marimea pozei, citita din numele ei: aplicatia ii pastreaza locul pe ecran inainte sa o aiba. */
  function size(name) {
    var m = NAME.exec(String(name || '').split('/').pop());
    return m && +m[1] > 0 && +m[2] > 0 ? { w: +m[1], h: +m[2] } : null;
  }

  function decode(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { resolve({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('photo_unreadable')); };
      img.src = url;
    });
  }

  function encode(img, side, quality) {
    return new Promise(function (resolve, reject) {
      var scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      var w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('photo_unreadable')); return; }
      /* Un fundal alb, pentru pozele cu parti transparente: JPEG nu stie transparenta. */
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(function (blob) {
        if (blob && blob.type === 'image/jpeg') resolve({ blob: blob, w: w, h: h });
        else reject(new Error('photo_unreadable'));
      }, 'image/jpeg', quality);
    });
  }

  /* Poza aleasa de om devine un JPEG mic, fara datele ascunse ale originalului (loc, aparat, ora).
     Intoarce continutul, marimea si numele sub care va fi pastrata. */
  function shrink(file) {
    if (!file || !/^image\//.test(file.type || 'image/')) return Promise.reject(new Error('photo_unreadable'));
    return decode(file).then(function (d) {
      if (!d.img.naturalWidth || !d.img.naturalHeight) { URL.revokeObjectURL(d.url); throw new Error('photo_unreadable'); }
      var i = 0;
      function next() {
        return encode(d.img, Math.min(SIDE, STEPS[i][0]), STEPS[i][1]).then(function (r) {
          if (r.blob.size > TARGET && i < STEPS.length - 1) { i++; return next(); }
          return r;
        });
      }
      return next().then(function (r) {
        URL.revokeObjectURL(d.url);
        if (r.blob.size > LIMIT) throw new Error('photo_too_big');
        return { blob: r.blob, w: r.w, h: r.h, name: token() + '-' + r.w + 'x' + r.h + '.jpg' };
      }, function (err) {
        URL.revokeObjectURL(d.url);
        throw err;
      });
    });
  }

  /* Pozele care asteapta sa ajunga in cont stau in baza de date a browserului, ca sa nu se piarda la inchiderea
     aplicatiei. Daca dispozitivul nu o are, raman doar in memorie, pana la inchidere. */
  function open() {
    if (opening) return opening;
    var mine = opening = new Promise(function (resolve, reject) {
      var req;
      try { req = window.indexedDB.open(DB, 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () {
        var db = req.result;
        /* O legatura inchisa de browser se redeschide la urmatoarea folosire. */
        db.onclose = function () { if (opening === mine) opening = null; };
        db.onversionchange = function () { db.close(); if (opening === mine) opening = null; };
        resolve(db);
      };
      req.onerror = function () { reject(req.error); };
      req.onblocked = function () { reject(new Error('blocked')); };
    });
    mine.then(null, function () { if (opening === mine) opening = null; });
    return mine;
  }

  function run(mode, work) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx, out;
        try { tx = db.transaction(STORE, mode); } catch (e) { opening = null; reject(e); return; }
        tx.oncomplete = function () { resolve(out); };
        tx.onerror = tx.onabort = function () { reject(tx.error); };
        var req = work(tx.objectStore(STORE));
        if (req) req.onsuccess = function () { out = req.result; };
      });
    });
  }

  /* Pe disc se pastreaza continutul brut, nu obiectul Blob: unele browsere de telefon nu stiu sa pastreze Blob. */
  function bytes(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
      r.readAsArrayBuffer(blob);
    });
  }

  /* Scrierile se fac pe rand, in ordinea in care au fost cerute: o stergere ceruta dupa o salvare ajunge dupa ea. */
  function inOrder(work) {
    var p = tail.then(work);
    tail = p.then(null, function () { /* urmatoarea scriere porneste oricum */ });
    return p;
  }

  /* Deschide din timp locul de pastrare, ca prima salvare sa nu mai astepte dupa el. */
  function ready() { return open().then(function () { return true; }, function () { return false; }); }

  function put(name, blob) {
    memory[name] = blob;
    return inOrder(function () {
      return bytes(blob).then(function (buf) {
        return run('readwrite', function (s) { s.put(buf, name); });
      });
    }).then(function () { return true; }, function () { return false; });
  }

  /* Poza cu numele dat: din memorie sau de pe disc. null inseamna ca nu exista; o eroare a bazei de date a browserului
     (se intampla pe telefoane, dupa ce aplicatia a stat mult in fundal) ramane o eroare, nu o poza pierduta. */
  function get(name) {
    if (memory[name]) return Promise.resolve(memory[name]);
    return run('readonly', function (s) { return s.get(name); }).then(function (kept) {
      if (!kept) return null;
      /* Felul fisierului trebuie spus din nou: dupa el hotaraste serverul daca primeste poza. */
      memory[name] = new Blob([kept], { type: 'image/jpeg' });
      return memory[name];
    });
  }

  /* Poza a ajuns in cont, sau nu mai e a nimanui: nu mai trebuie pastrata pe disc. In memorie ramane, pentru afisare. */
  function del(name, all) {
    if (all) delete memory[name];
    return inOrder(function () {
      return run('readwrite', function (s) { s.delete(name); });
    }).then(function () { return true; }, function () { return false; });
  }

  /* Curatenie la pornire: pe disc raman doar pozele care inca asteapta sa plece (names). */
  function keep(names) {
    return inOrder(function () {
      return run('readwrite', function (s) {
        var req = s.getAllKeys();
        req.onsuccess = function () {
          (req.result || []).forEach(function (k) { if (names.indexOf(k) < 0) s.delete(k); });
        };
      });
    }).then(function () { return true; }, function () { return false; });
  }

  function clear() {
    memory = {};
    return inOrder(function () {
      return run('readwrite', function (s) { s.clear(); });
    }).then(function () { return true; }, function () { return false; });
  }

  return { shrink: shrink, size: size, ready: ready, put: put, get: get, del: del, keep: keep, clear: clear, NAME: NAME };
})();
