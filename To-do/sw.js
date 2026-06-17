/* Service worker de Mis Tareas: permite instalar la app y usarla sin internet.
   Estrategia: red primero (para recibir actualizaciones), caché como respaldo offline. */
var CACHE = "mis-tareas-v4";
var ASSETS = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

/* ---------- IndexedDB (mismo almacén que escribe la app) ---------- */
function idbOpen() {
  return new Promise(function (res, rej) {
    var r = indexedDB.open("mis-tareas-db", 1);
    r.onupgradeneeded = function () { r.result.createObjectStore("kv"); };
    r.onsuccess = function () { res(r.result); };
    r.onerror = function () { rej(r.error); };
  });
}
function idbGet(key) {
  return idbOpen().then(function (db) {
    return new Promise(function (res, rej) {
      var tx = db.transaction("kv", "readonly");
      var rq = tx.objectStore("kv").get(key);
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

/* ---------- Recordatorio diario con la app cerrada ---------- */
function checkReminders() {
  return idbGet("reminders").then(function (r) {
    if (!r || !r.enabled) return;
    var now = new Date();
    var hm = pad(now.getHours()) + ":" + pad(now.getMinutes());
    if (hm < r.time) return;
    var today = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
    if (r.lastNotified === today) return;
    return idbGet("state").then(function (s) {
      if (!s || !s.tasks) return;
      var items = s.tasks.filter(function (t) {
        if (t.repeat === "daily") return !(t.history && t.history.indexOf(today) > -1);
        if (t.done) return false;
        return t.due && t.due <= today;
      });
      if (!items.length) return;
      r.lastNotified = today;
      var body = items.slice(0, 4).map(function (t) { return "• " + t.title; }).join("\n");
      if (items.length > 4) body += "\n+" + (items.length - 4) + " más";
      return idbPut("reminders", r).then(function () {
        return self.registration.showNotification(
          "Tienes " + items.length + " " + (items.length === 1 ? "tarea" : "tareas") + " para hoy",
          { body: body, icon: "./icon-192.png", badge: "./icon-192.png", tag: "daily-digest" }
        );
      });
    });
  }).catch(function () {});
}

self.addEventListener("periodicsync", function (e) {
  if (e.tag === "reminders-check") e.waitUntil(checkReminders());
});
self.addEventListener("sync", function (e) {
  if (e.tag === "reminders-check") e.waitUntil(checkReminders());
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window" }).then(function (cl) {
      for (var i = 0; i < cl.length; i++) {
        if ("focus" in cl[i]) return cl[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./");
    })
  );
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        return res;
      })
      .catch(function () {
        return caches.match(e.request).then(function (m) {
          return m || caches.match("./index.html");
        });
      })
  );
});
