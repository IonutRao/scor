/* Inlocuieste biblioteca Supabase doar in testele locale. Vorbeste cu test/server.py, care tine locul serverului.
   Intoarce raspunsuri in aceeasi forma ca biblioteca adevarata: { data, error }. */
(function () {
  'use strict';
  var KEY = 'fake-sb-session';

  function createClient(url, key) {
    var listeners = [];

    function read() { try { return JSON.parse(window.localStorage.getItem(KEY)); } catch (e) { return null; } }
    function write(s) {
      try { if (s) window.localStorage.setItem(KEY, JSON.stringify(s)); else window.localStorage.removeItem(KEY); } catch (e) { /* fara stocare */ }
    }
    function emit(ev, s) { listeners.slice().forEach(function (fn) { try { fn(ev, s); } catch (e) { /* ascultatorul greseste singur */ } }); }

    function call(path, body, token) {
      return fetch(url + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + (token || key) },
        body: JSON.stringify(body || {})
      }).then(function (res) {
        return res.text().then(function (t) {
          var j = null;
          try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
          return { ok: res.ok, status: res.status, json: j };
        });
      });
    }

    function authError(r) {
      var j = r.json || {};
      var e = new Error(j.msg || j.message || j.error_description || 'Auth error');
      e.name = 'AuthApiError';
      e.status = r.status;
      e.code = j.error_code;
      return e;
    }

    function netError(err) {
      var e = new Error(String((err && err.message) || err));
      e.name = 'AuthRetryableFetchError';
      e.status = 0;
      return e;
    }

    function session(path, creds) {
      return call(path, creds).then(function (r) {
        if (!r.ok) return { data: { user: null, session: null }, error: authError(r) };
        if (!r.json.access_token) return { data: { user: r.json, session: null }, error: null };
        write(r.json);
        emit('SIGNED_IN', r.json);
        return { data: { user: r.json.user, session: r.json }, error: null };
      }, function (err) {
        return { data: { user: null, session: null }, error: netError(err) };
      });
    }

    return {
      auth: {
        getSession: function () { return Promise.resolve({ data: { session: read() }, error: null }); },
        signUp: function (c) { return session('/auth/v1/signup', c); },
        signInWithPassword: function (c) { return session('/auth/v1/token?grant_type=password', c); },
        signOut: function () {
          var s = read();
          write(null);
          emit('SIGNED_OUT', null);
          if (s) call('/auth/v1/logout', {}, s.access_token).then(null, function () { /* fara retea */ });
          return Promise.resolve({ error: null });
        },
        onAuthStateChange: function (fn) {
          listeners.push(fn);
          setTimeout(function () { fn('INITIAL_SESSION', read()); }, 0);
          return { data: { subscription: { unsubscribe: function () { listeners = listeners.filter(function (x) { return x !== fn; }); } } } };
        }
      },
      /* Fisierele: aceleasi apeluri si aceleasi forme de raspuns ca in biblioteca adevarata, catre serverul de test. */
      storage: {
        from: function (bucket) {
          function headers(extra) {
            var s = read(), h = { apikey: key, Authorization: 'Bearer ' + ((s && s.access_token) || key) };
            for (var k in extra) h[k] = extra[k];
            return h;
          }
          function apiError(status, j) {
            j = j || {};
            return { name: 'StorageApiError', message: j.message || 'HTTP ' + status, status: status, statusCode: j.statusCode || String(status), error: j.error || '' };
          }
          function netError(err) {
            return { name: 'StorageUnknownError', message: String((err && err.message) || err), originalError: err };
          }
          function send(method, path, opts) {
            opts.method = method;
            return fetch(url + '/storage/v1/object/' + path, opts);
          }
          function json(res) {
            return res.text().then(function (t) { try { return t ? JSON.parse(t) : null; } catch (e) { return null; } });
          }
          return {
            upload: function (path, body, o) {
              o = o || {};
              /* Ca biblioteca adevarata: pentru un Blob, felul fisierului este cel al Blob-ului, nu cel din optiuni. */
              var type = body instanceof Blob ? (body.type || 'application/octet-stream') : (o.contentType || 'text/plain;charset=UTF-8');
              return send('POST', bucket + '/' + path, { headers: headers({ 'Content-Type': type }), body: body }).then(function (res) {
                return json(res).then(function (j) {
                  if (!res.ok) return { data: null, error: apiError(res.status, j) };
                  return { data: { path: path, id: j && j.Id, fullPath: bucket + '/' + path }, error: null };
                });
              }, function (err) { return { data: null, error: netError(err) }; });
            },
            download: function (path) {
              return send('GET', bucket + '/' + path, { headers: headers() }).then(function (res) {
                /* Ca biblioteca adevarata: la descarcare, un raspuns de eroare ajunge neschimbat in originalError. */
                if (!res.ok) return { data: null, error: { name: 'StorageUnknownError', message: '{}', originalError: res } };
                return res.blob().then(function (b) { return { data: b, error: null }; });
              }, function (err) { return { data: null, error: netError(err) }; });
            },
            remove: function (paths) {
              return send('DELETE', bucket, { headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prefixes: paths }) }).then(function (res) {
                return json(res).then(function (j) { return res.ok ? { data: j, error: null } : { data: null, error: apiError(res.status, j) }; });
              }, function (err) { return { data: null, error: netError(err) }; });
            },
            list: function (prefix, o) {
              return send('POST', 'list/' + bucket, { headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prefix: prefix || '', limit: (o && o.limit) || 100, offset: (o && o.offset) || 0 }) }).then(function (res) {
                return json(res).then(function (j) { return res.ok ? { data: j, error: null } : { data: null, error: apiError(res.status, j) }; });
              }, function (err) { return { data: null, error: netError(err) }; });
            }
          };
        }
      },
      rpc: function (name, args) {
        var s = read();
        return call('/rest/v1/rpc/' + name, args, s && s.access_token).then(function (r) {
          if (!r.ok) return { data: null, error: r.json || { message: 'HTTP ' + r.status, code: '' }, status: r.status };
          return { data: r.json, error: null, status: r.status };
        }, function (err) {
          return { data: null, error: { message: 'TypeError: Failed to fetch', details: String(err), hint: '', code: '' }, status: 0 };
        });
      }
    };
  }

  window.supabase = { createClient: createClient };
})();
