/* Scorul zilei: legatura cu serverul (Supabase). Tot ce vorbeste cu reteaua trece pe aici.
   Fara adresa si cheie in configuratie, aplicatia ramane in modul local si acest fisier nu face nimic. */
var API = (function () {
  'use strict';

  var cfg = (window.SCOR_BUILD && window.SCOR_BUILD.backend) || null;
  var client = null, loading = null, onAuth = null;

  function enabled() { return !!(cfg && cfg.url && cfg.key && cfg.lib); }

  /* Aduce erorile de retea, de cont si de baza de date la aceeasi forma. */
  function norm(error, status) {
    var e = error || {};
    var msg = String(e.message || e.msg || e.error_description || e || '');
    var st = e.status || status || 0;
    var offline = e.name === 'AuthRetryableFetchError' || /Failed to fetch|NetworkError|Load failed|network request failed|fetch failed/i.test(msg);
    return { code: String(e.code || e.error_code || ''), message: msg, status: offline ? 0 : st, offline: offline };
  }

  /* Incarca biblioteca Supabase o singura data. Daca nu e internet, promisiunea esueaza si se poate reincerca. */
  function load() {
    if (!enabled()) return Promise.reject(norm({ message: 'backend_off' }));
    if (client) return Promise.resolve(client);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      function make() {
        try {
          client = window.supabase.createClient(cfg.url, cfg.key, {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
          });
          client.auth.onAuthStateChange(function (event, session) {
            /* Biblioteca cere ca aici sa nu se porneasca direct alte apeluri catre ea. */
            setTimeout(function () { if (onAuth) onAuth(event, user(session)); }, 0);
          });
          resolve(client);
        } catch (err) {
          reject(norm(err));
        }
      }
      if (window.supabase && window.supabase.createClient) { make(); return; }
      var s = document.createElement('script');
      s.src = cfg.lib;
      s.async = true;
      if (/^https?:/.test(cfg.lib)) s.crossOrigin = 'anonymous';
      s.onload = function () {
        if (window.supabase && window.supabase.createClient) make();
        else reject(norm({ message: 'client_missing' }));
      };
      s.onerror = function () {
        if (s.parentNode) s.parentNode.removeChild(s);
        reject(norm({ message: 'Failed to fetch' }));
      };
      document.head.appendChild(s);
    });
    loading.then(null, function () { loading = null; });
    return loading;
  }

  function user(session) {
    return session && session.user ? { id: session.user.id, email: session.user.email || '' } : null;
  }

  /* Utilizatorul autentificat pe acest dispozitiv, sau null. */
  function current() {
    return load().then(function (c) { return c.auth.getSession(); }).then(function (r) {
      if (r.error) throw norm(r.error);
      return user(r.data && r.data.session);
    });
  }

  function authCall(method, email, password) {
    return load().then(function (c) { return c.auth[method]({ email: email, password: password }); }).then(function (r) {
      if (r.error) throw norm(r.error);
      var d = r.data || {};
      /* Fara sesiune inseamna ca serverul asteapta confirmarea prin email. */
      return { user: user(d.session), pending: !d.session };
    }, function (err) { throw err && err.offline !== undefined ? err : norm(err); });
  }

  function signUp(email, password) { return authCall('signUp', email, password); }
  function signIn(email, password) { return authCall('signInWithPassword', email, password); }

  function signOut() {
    return load().then(function (c) { return c.auth.signOut({ scope: 'local' }); }).then(function () { return true; }, function () { return false; });
  }

  /* Apeleaza o functie din baza de date. Raspunsul e chiar valoarea intoarsa de functie. */
  function rpc(name, args) {
    return load().then(function (c) { return c.rpc(name, args || {}); }).then(function (r) {
      if (r.error) throw norm(r.error, r.status);
      return r.data;
    }, function (err) { throw err && err.offline !== undefined ? err : norm(err); });
  }

  /* ---------- pozele: locul de fisiere al contului (Supabase Storage) ---------- */

  /* Dosarul de poze din cont si cate fisiere se cer sau se sterg cel mult intr-o cerere. */
  var BUCKET = 'photos', PAGE = 100;

  /* Erorile serviciului de fisiere poarta starea in alt loc decat cele ale bazei de date: in statusCode, cu starea
     adevarata scrisa de server in raspuns, sau, la descarcare, in originalError, care este chiar raspunsul serverului. */
  function normFile(error) {
    var e = error || {}, o = e.originalError, n;
    if (o && typeof o.status === 'number' && !o.message) return { code: '', message: 'HTTP ' + o.status, status: o.status, offline: false };
    n = norm(o && !e.message ? o : e);
    if (!n.offline && o) n = norm(o);
    if (!n.offline) n.status = Number(e.statusCode) || Number(e.status) || n.status;
    n.code = String(e.error || n.code || '');
    return n;
  }

  function files(work) {
    return load().then(function (c) { return work(c.storage.from(BUCKET)); }).then(function (r) {
      if (r.error) throw normFile(r.error);
      return r.data;
    }, function (err) { throw err && err.offline !== undefined ? err : norm(err); });
  }

  /* Incarca o poza. Daca fisierul exista deja, incarcarea de dinainte a reusit de fapt, deci e in regula. */
  function photoUpload(path, blob) {
    return files(function (f) {
      return f.upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
    }).then(function () { return true; }, function (err) {
      if (err.status === 409 || /already exists|duplicate/i.test(err.message + ' ' + err.code)) return true;
      throw err;
    });
  }

  function photoGet(path) { return files(function (f) { return f.download(path); }); }

  /* Sterge pozele cu adresele date. Una care nu mai exista nu este o eroare. */
  function photoRemove(paths) {
    function part(from) {
      if (from >= paths.length) return Promise.resolve(true);
      return files(function (f) { return f.remove(paths.slice(from, from + PAGE)); }).then(function () { return part(from + PAGE); });
    }
    return part(0);
  }

  /* Numele tuturor pozelor din dosarul unui utilizator. */
  function photoList(folder) {
    var all = [];
    function page(offset) {
      return files(function (f) { return f.list(folder, { limit: PAGE, offset: offset, sortBy: { column: 'name', order: 'asc' } }); }).then(function (rows) {
        rows = Array.isArray(rows) ? rows : [];
        rows.forEach(function (r) { if (r && r.name && r.id) all.push(r.name); });
        return rows.length === PAGE ? page(offset + PAGE) : all;
      });
    }
    return page(0);
  }

  return {
    enabled: enabled, load: load, current: current, signUp: signUp, signIn: signIn, signOut: signOut, rpc: rpc,
    photoUpload: photoUpload, photoGet: photoGet, photoRemove: photoRemove, photoList: photoList,
    onAuth: function (fn) { onAuth = fn; }
  };
})();
