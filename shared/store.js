/* ============================================================
   DiarioStore — API única de persistencia (Mi Diario).

   Una sola puerta para leer/escribir el localStorage del origen y llevar una
   marca de tiempo por clave (en "__diario_meta"). Esa marca es la que usa la
   fusión (shared/merge.js) para desempatar configs y para no marcar como
   "nuevo" lo que en realidad llega de la nube.

   No reemplaza el localStorage que ya escriben las secciones dentro de sus
   iframes; es la capa que usa el hub para sincronizar de forma consistente.

   Expuesto como window.DiarioStore. Script clásico (file:// y http).
   ============================================================ */
(function () {
  "use strict";
  var META_KEY = "__diario_meta";

  function readMeta() { try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch (e) { return {}; } }
  function writeMeta(m) { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {} }

  var DiarioStore = {
    /* Cadena cruda tal cual está en localStorage (o null). */
    getRaw: function (key) { try { return localStorage.getItem(key); } catch (e) { return null; } },

    /* Valor parseado (o 'fallback' si no existe / está corrupto). */
    get: function (key, fallback) {
      try { var r = localStorage.getItem(key); return r == null ? fallback : JSON.parse(r); }
      catch (e) { return fallback; }
    },

    /* Escribe una cadena ya serializada y sella la marca de tiempo.
       Al aplicar datos venidos de la nube se pasa 'ts' = marca remota, para
       no inflar artificialmente la antigüedad local. */
    setRaw: function (key, raw, ts) {
      try { localStorage.setItem(key, raw); } catch (e) {}
      this.stamp(key, ts);
    },

    /* Igual que setRaw pero serializando un valor. */
    set: function (key, value, ts) { this.setRaw(key, JSON.stringify(value), ts); },

    /* Marca de tiempo de la última modificación conocida de 'key'. */
    stamp: function (key, ts) { var m = readMeta(); m[key] = ts || Date.now(); writeMeta(m); },
    updatedAt: function (key) { return readMeta()[key] || 0; },

    META_KEY: META_KEY
  };

  window.DiarioStore = DiarioStore;
})();
