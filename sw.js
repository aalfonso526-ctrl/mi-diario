/* Service worker del hub "Mi Diario".
   Cachea el armazón y las 4 apps para que abran sin conexión.
   Estrategia: red primero y, si falla, lo guardado en caché.
   No interfiere con el service worker propio de To-do (su ámbito es To-do/). */
var CACHE = "diario-hub-v14";
var CORE = [
  "index.html",
  "manifest.json",
  "firebase-config.js",
  "shared/dates.js",
  "shared/theme.js",
  "shared/store.js",
  "shared/merge.js",
  "shared/sync.js",
  "To-do/index.html",
  "Ejercicio/entrenamientos.html",
  "Movilidad/index.html",
  "plan-ingles/estudio-ingles.html",
  "To-do/icon-192.png",
  "To-do/icon-512.png"
];

self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // Cachea lo que se pueda; si algún recurso falla, no rompe la instalación.
      return Promise.all(CORE.map(function (url) {
        return c.add(url).catch(function () {});
      }));
    })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).then(function (res) {
      // Guarda una copia fresca de los recursos del mismo origen.
      if (res && res.ok && e.request.url.indexOf(self.location.origin) === 0) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (hit) {
        return hit || caches.match("index.html");
      });
    })
  );
});
