/* Scorul zilei: face aplicatia sa porneasca si fara internet. */
const CACHE = 'scor-0.7.2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './favicon.svg', './icon-192.png', './icon-512.png'];
/* Fonturile si biblioteca de cont vin din afara si se pastreaza dupa prima incarcare. */
const KEEP = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* Ghidul si PDF-ul lui sunt pagini obisnuite, nu fac parte din aplicatie. */
  if (/[/]ghid[^/]*$/.test(url.pathname)) return;

  /* Pagina: intai de pe internet, ca actualizarile sa ajunga imediat; fara internet, din copia salvata. */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && res.type === 'basic' && !res.redirected) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  /* Fisierele aplicatiei, fonturile si biblioteca: din copia salvata, altfel de pe internet si se pastreaza.
     Cererile catre server (conturi, date) nu trec pe aici niciodata. */
  if (url.origin === self.location.origin || KEEP.includes(url.hostname)) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }))
    );
  }
});
