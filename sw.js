/* Service worker del hub "Mi Diario".
   Cachea el armazón y las 4 apps para que abran sin conexión.
   Estrategia: red primero y, si falla, lo guardado en caché.
   No interfiere con el service worker propio de To-do (su ámbito es To-do/). */
/* Ámbito / (hub): este SW cachea el armazón del hub, los shared/ y las apps que
   NO tienen su propio service worker (Ejercicio, Movilidad, Inglés). Los recursos
   bajo /To-do/ los cachea el SW de Tareas (To-do/sw.js, ámbito más específico),
   así que aquí NO se duplican. Los iconos de las notificaciones del hub apuntan a
   To-do/icon-*.png, que sirve ese otro SW. */
var CACHE = "diario-hub-v27";
var CORE = [
  "index.html",
  "manifest.json",
  "firebase-config.js",
  "shared/dates.js",
  "shared/theme.js",
  "shared/store.js",
  "shared/merge.js",
  "shared/sync.js",
  "Ejercicio/entrenamientos.html",
  "Movilidad/index.html",
  "plan-ingles/estudio-ingles.html"
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

/* ---------- Recordatorio de Inglés con la app cerrada ----------
   El SW no puede leer localStorage, así que el hub y el iframe de Inglés espejan
   a IndexedDB (mi-diario-db / kv) el estado del recordatorio ("ingles-rem":
   {on,hora,lastNotif}) y el progreso del día ("ingles-dias": el mapa state.dias).
   Aquí se calcula el aviso con la misma lógica que checkRecordatorio del iframe,
   pero funcionando con la pestaña cerrada (periodicsync/sync). */
function idbOpen() {
  return new Promise(function (res, rej) {
    var r = indexedDB.open("mi-diario-db", 1);
    r.onupgradeneeded = function () { try { r.result.createObjectStore("kv"); } catch (e) {} };
    r.onsuccess = function () { res(r.result); };
    r.onerror = function () { rej(r.error); };
  });
}
function idbGet(key) {
  return idbOpen().then(function (db) {
    return new Promise(function (res, rej) {
      var rq = db.transaction("kv", "readonly").objectStore("kv").get(key);
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { rej(rq.error); };
    });
  });
}
function idbPut(key, val) {
  return idbOpen().then(function (db) {
    return new Promise(function (res, rej) {
      var tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").put(val, key);
      tx.oncomplete = function () { res(); };
      tx.onerror = function () { rej(tx.error); };
    });
  });
}
function pad(n) { return n < 10 ? "0" + n : "" + n; }

function checkInglesReminder() {
  return idbGet("ingles-rem").then(function (r) {
    if (!r || !r.on) return;
    var now = new Date();
    var hm = pad(now.getHours()) + ":" + pad(now.getMinutes());
    if (hm < (r.hora || "19:00")) return;
    var today = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
    if (r.lastNotif === today) return;
    return idbGet("ingles-dias").then(function (dias) {
      var checks = (dias && dias[today]) || [];
      var done = checks.filter(Boolean).length;
      if (done >= 6) return; /* día completo: no molestar */
      r.lastNotif = today;
      return idbPut("ingles-rem", r).then(function () {
        return self.registration.showNotification("🇬🇧 Tu inglés de hoy", {
          body: "Te faltan " + (6 - done) + " bloque(s) por hacer hoy.",
          icon: "To-do/icon-192.png", badge: "To-do/icon-192.png", tag: "ingles-daily"
        });
      });
    });
  }).catch(function () {});
}

self.addEventListener("periodicsync", function (e) {
  if (e.tag === "ingles-reminder-check") e.waitUntil(checkInglesReminder());
});
self.addEventListener("sync", function (e) {
  if (e.tag === "ingles-reminder-check") e.waitUntil(checkInglesReminder());
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window" }).then(function (cl) {
      for (var i = 0; i < cl.length; i++) { if ("focus" in cl[i]) return cl[i].focus(); }
      if (self.clients.openWindow) return self.clients.openWindow("./");
    })
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
