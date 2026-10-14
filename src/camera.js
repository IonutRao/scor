/* Scorul zilei: camera din aplicatie. Arata imaginea camerei telefonului chiar in pagina si face poza la apasare,
   fara sa treaca prin aplicatia de camera a telefonului: cat timp aceea era deschisa, telefoanele cu memorie putina
   inchideau pagina noastra din fundal, iar poza si ce fusese scris se pierdeau.
   Nimic de aici nu vorbeste cu reteaua si nu stie de restul aplicatiei: primeste textele si un loc in pagina,
   intoarce poza (un Blob JPEG) sau null daca omul a renuntat. */
var CAM = (function () {
  'use strict';

  var root = null, video = null, stream = null, facing = 'environment', done = null, texts = {}, onNative = null;
  var busy = false, cameras = 0, waitTimer = null;
  /* Cat se asteapta primul cadru inainte sa se spuna ca nu merge camera. */
  var FIRST_FRAME = 8000;
  var SVG = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  var ICON_CLOSE = '<svg aria-hidden="true" width="24" height="24" ' + SVG + '><path d="M5 5l14 14M19 5L5 19"/></svg>';
  var ICON_FLIP = '<svg aria-hidden="true" width="24" height="24" ' + SVG + '><path d="M20 12a8 8 0 0 1-14.9 4M4 12a8 8 0 0 1 14.9-4"/><path d="M4 20v-4h4M20 4v4h-4"/></svg>';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function supported() {
    try {
      return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.HTMLCanvasElement && window.URL);
    } catch (e) { return false; }
  }

  function isOpen() { return !!(root && !root.hidden); }

  function byId(id) { return root ? root.querySelector('#' + id) : null; }

  function stopStream() {
    if (stream) stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) { /* oprita deja */ } });
    stream = null;
    if (video) { try { video.pause(); video.srcObject = null; } catch (e) { /* fara imagine */ } }
  }

  function message(key, withNative) {
    var msg = byId('cam-msg'), alt = byId('cam-native'), shot = byId('cam-shot');
    if (!msg) return;
    msg.textContent = key ? texts[key] || key : '';
    msg.hidden = !key;
    if (alt) alt.hidden = !withNative;
    if (shot) shot.disabled = !!key;
  }

  /* Porneste camera ceruta; daca telefonul nu o are pe cea din spate (sau e un calculator), merge orice camera. */
  function constraints(any) {
    var v = { width: { ideal: 1920 }, height: { ideal: 1440 } };
    if (!any) v.facingMode = facing;
    return { audio: false, video: v };
  }

  function start() {
    message('camStarting', false);
    stopStream();
    return navigator.mediaDevices.getUserMedia(constraints(false)).then(null, function (err) {
      var name = err && err.name;
      if (name === 'OverconstrainedError' || name === 'NotFoundError' || name === 'ConstraintNotSatisfiedError') {
        return navigator.mediaDevices.getUserMedia(constraints(true));
      }
      throw err;
    }).then(function (s) {
      if (!isOpen()) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
      stream = s;
      var track = s.getVideoTracks()[0], settings = track && track.getSettings ? track.getSettings() : {};
      /* Camera din fata se arata in oglinda, ca intr-o oglinda; poza facuta nu este intoarsa. */
      video.classList.toggle('mirror', settings.facingMode === 'user' || (facing === 'user' && !settings.facingMode));
      video.srcObject = s;
      var p = video.play();
      if (p && p.then) p.then(null, function () { /* porneste singur la primul cadru */ });
      /* Butonul de fotografiere se deschide abia cand exista un cadru de fotografiat. */
      clearTimeout(waitTimer);
      waitTimer = setTimeout(function () { if (isOpen() && !(video.videoWidth > 0)) message('camError', true); }, FIRST_FRAME);
      video.onloadeddata = function () {
        clearTimeout(waitTimer);
        if (isOpen() && stream === s) message('', false);
      };
      countCameras();
    }, function (err) {
      if (!isOpen()) return;
      var name = (err && err.name) || '';
      var key = name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError' ? 'camDenied'
        : name === 'NotFoundError' || name === 'DevicesNotFoundError' ? 'camNone' : 'camError';
      message(key, true);
    });
  }

  /* Butonul de schimbare a camerei apare doar daca exista cel putin doua. */
  function countCameras() {
    if (!navigator.mediaDevices.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then(function (list) {
      cameras = list.filter(function (d) { return d.kind === 'videoinput'; }).length;
      var flip = byId('cam-flip');
      if (flip) flip.hidden = cameras < 2;
    }, function () { /* ramane cum e */ });
  }

  /* Poza este chiar cadrul de pe ecran, asa cum il arata browserul: cu orientarea corecta, oricum ar fi tinut telefonul.
     (Pozele cerute direct camerei, prin ImageCapture, vin pe unele telefoane intoarse pe o parte.) */
  function snap() {
    if (!stream || !stream.getVideoTracks()[0]) return Promise.reject(new Error('no_stream'));
    var w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) return Promise.reject(new Error('no_frame'));
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    if (!ctx) return Promise.reject(new Error('no_canvas'));
    ctx.drawImage(video, 0, 0, w, h);
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        canvas.width = 0;
        if (blob) resolve(blob); else reject(new Error('no_blob'));
      }, 'image/jpeg', 0.92);
    });
  }

  function finish(result) {
    var fn = done;
    done = null;
    busy = false;
    clearTimeout(waitTimer);
    stopStream();
    if (root) { root.hidden = true; root.innerHTML = ''; }
    document.documentElement.classList.remove('cam-open');
    /* Pasul pus in istoric la deschidere se scoate, ca butonul Inapoi sa nu il mai gaseasca. */
    try { if (window.history.state && window.history.state.cam) window.history.back(); } catch (e) { /* fara istoric */ }
    if (fn) fn(result || null);
  }

  function onClick(ev) {
    var b = ev.target.closest ? ev.target.closest('button') : null;
    if (!b || busy) return;
    if (b.id === 'cam-close') {
      finish(null);
    } else if (b.id === 'cam-flip') {
      facing = facing === 'user' ? 'environment' : 'user';
      start();
    } else if (b.id === 'cam-native') {
      /* Camera telefonului, prin alegerea de fisiere: trebuie pornita chiar din apasarea omului. */
      var fn = onNative;
      finish(null);
      if (fn) fn();
    } else if (b.id === 'cam-shot') {
      busy = true;
      b.disabled = true;
      snap().then(function (blob) {
        finish(blob);
      }, function () {
        busy = false;
        b.disabled = false;
        message('camError', true);
      });
    }
  }

  function onKey(ev) {
    if (ev.key === 'Escape' && isOpen() && !busy) finish(null);
  }

  function onPop() {
    /* Butonul Inapoi al telefonului inchide camera, nu paraseste ecranul. */
    if (isOpen() && !busy) {
      var fn = done;
      done = null;
      busy = false;
      clearTimeout(waitTimer);
      stopStream();
      root.hidden = true;
      root.innerHTML = '';
      document.documentElement.classList.remove('cam-open');
      if (fn) fn(null);
    }
  }

  function onVisibility() {
    if (!isOpen()) return;
    /* Cat pagina sta in fundal camera se opreste; la intoarcere porneste din nou. */
    if (document.hidden) stopStream(); else start();
  }

  /* Deschide camera. t: textele afisate; native: ce se face cand omul alege camera telefonului in loc.
     Promisiunea se incheie cu poza (Blob) sau cu null. */
  function open(t, native) {
    if (!supported()) return Promise.resolve(null);
    if (isOpen()) finish(null);
    texts = t || {};
    onNative = native || null;
    if (!root) {
      root = document.getElementById('cam');
      if (!root) return Promise.resolve(null);
      root.addEventListener('click', onClick);
      document.addEventListener('keydown', onKey);
      window.addEventListener('popstate', onPop);
      document.addEventListener('visibilitychange', onVisibility);
    }
    root.innerHTML = '' +
      '<video class="cam-view" id="cam-view" autoplay playsinline muted></video>' +
      '<p class="cam-msg" id="cam-msg" hidden></p>' +
      '<div class="cam-top"><button type="button" class="cam-btn" id="cam-close" aria-label="' + esc(texts.close || '') + '">' + ICON_CLOSE + '</button></div>' +
      '<div class="cam-bar">' +
        '<button type="button" class="cam-btn" id="cam-flip" aria-label="' + esc(texts.camFlip || '') + '" hidden>' + ICON_FLIP + '</button>' +
        '<button type="button" class="cam-shutter" id="cam-shot" aria-label="' + esc(texts.camShot || '') + '"></button>' +
        '<button type="button" class="cam-native" id="cam-native" hidden>' + esc(texts.camNative || '') + '</button>' +
      '</div>';
    video = root.querySelector('video');
    root.hidden = false;
    document.documentElement.classList.add('cam-open');
    try { window.history.pushState({ cam: true }, '', window.location.href); } catch (e) { /* fara istoric */ }
    busy = false;
    var p = new Promise(function (resolve) { done = resolve; });
    start();
    var shot = byId('cam-shot');
    if (shot) shot.focus({ preventScroll: true });
    return p;
  }

  return { supported: supported, open: open, isOpen: isOpen };
})();
