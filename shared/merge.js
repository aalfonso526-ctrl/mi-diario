/* ============================================================
   Motor de fusión de datos entre dispositivos (Mi Diario).

   Reemplaza el "gana la última escritura del documento entero" por una
   fusión por elemento, con la estrategia natural de cada sección. El
   principio rector: NUNCA perder progreso. Ante la duda, conservar de más.

   Cada estrategia recibe (local, remoto[, tsLocal, tsRemoto]) y devuelve el
   estado fusionado. Se usa tanto en la sincronización en la nube como al
   importar un respaldo.

   Expuesto como window.DiarioMerge. Script clásico (file:// y http).
   ============================================================ */
(function () {
  "use strict";

  /* Unión de arrays de objetos por un campo identificador.
     En conflicto (mismo id) gana el que tenga 'updatedAt' más reciente; si no
     hay marca por elemento, gana 'remoto' (criterio estable y predecible). */
  function mergeById(local, remote, idField) {
    idField = idField || "id";
    local = Array.isArray(local) ? local : [];
    remote = Array.isArray(remote) ? remote : [];
    var map = {}, order = [];
    function absorb(list, isRemote) {
      list.forEach(function (item) {
        if (!item || item[idField] == null) return;
        var k = item[idField], prev = map[k];
        if (!prev) { map[k] = item; order.push(k); return; }
        var pT = +prev.updatedAt || 0, iT = +item.updatedAt || 0;
        if (iT > pT) map[k] = item;
        else if (iT === pT && isRemote) map[k] = item;
      });
    }
    absorb(local, false);
    absorb(remote, true);
    return order.map(function (k) { return map[k]; });
  }

  /* Unión de arrays deduplicando por una clave derivada (keyFn).
     Útil para registros sin id (p. ej. sesiones de ejercicio por 'fecha'). */
  function dedupeBy(local, remote, keyFn) {
    local = Array.isArray(local) ? local : [];
    remote = Array.isArray(remote) ? remote : [];
    var seen = {}, out = [];
    [local, remote].forEach(function (list) {
      list.forEach(function (item) {
        var k = keyFn(item);
        if (k == null) k = JSON.stringify(item);
        if (seen[k]) return;
        seen[k] = 1; out.push(item);
      });
    });
    return out;
  }

  /* Mapa fecha -> array: une las claves y, en una fecha común, une los arrays
     sin duplicar (p. ej. Movilidad: vídeos hechos por día en dos dispositivos). */
  function mergeDateMapArrays(local, remote) {
    local = local && typeof local === "object" ? local : {};
    remote = remote && typeof remote === "object" ? remote : {};
    var out = {};
    Object.keys(local).concat(Object.keys(remote)).forEach(function (date) {
      if (out[date]) return;
      var a = Array.isArray(local[date]) ? local[date] : [];
      var b = Array.isArray(remote[date]) ? remote[date] : [];
      var seen = {}, merged = [];
      a.concat(b).forEach(function (v) { var k = JSON.stringify(v); if (!seen[k]) { seen[k] = 1; merged.push(v); } });
      if (merged.length) out[date] = merged;
    });
    return out;
  }

  /* Mapa fecha -> array de booleanos: en una fecha común, OR posición a
     posición. Un bloque marcado en CUALQUIER dispositivo queda marcado
     (Inglés: 6 bloques/día). Es la fusión más conservadora posible. */
  function mergeDateMapBoolArr(local, remote) {
    local = local && typeof local === "object" ? local : {};
    remote = remote && typeof remote === "object" ? remote : {};
    var out = {};
    Object.keys(local).concat(Object.keys(remote)).forEach(function (date) {
      if (out[date]) return;
      var a = Array.isArray(local[date]) ? local[date] : [];
      var b = Array.isArray(remote[date]) ? remote[date] : [];
      var n = Math.max(a.length, b.length), arr = [];
      for (var i = 0; i < n; i++) arr.push(Boolean(a[i]) || Boolean(b[i]));
      out[date] = arr;
    });
    return out;
  }

  /* Último en escribir gana, decidido por marca de tiempo (no por contenido). */
  function lastWrite(local, remote, tsLocal, tsRemote) {
    return (+tsRemote || 0) >= (+tsLocal || 0) ? remote : local;
  }

  /* Registro de estrategias por clave de almacenamiento. */
  var STRATEGIES = {
    "todo-app-v1": function (l, r) {
      l = l || {}; r = r || {};
      var out = { tasks: mergeById(l.tasks, r.tasks, "id"), goals: mergeById(l.goals, r.goals, "id") };
      out.updatedAt = Math.max(+l.updatedAt || 0, +r.updatedAt || 0);
      return out;
    },
    "entreno_historial_v1": function (l, r) {
      return dedupeBy(l, r, function (s) { return s && s.fecha; });
    },
    "entreno_cfg_v1": lastWrite,
    "entreno_draft_v1": lastWrite,
    "movilidad-progress": function (l, r) { return mergeDateMapArrays(l, r); },
    "planIngles_v1": function (l, r, tl, tr) {
      l = l || {}; r = r || {};
      var out = lastWrite(l, r, tl, tr) || {};       // base: campos sueltos (semana, etc.)
      out = Object.assign({}, out);
      out.dias = mergeDateMapBoolArr(l.dias, r.dias); // los días nunca se pierden
      return out;
    }
  };

  /* Punto de entrada: fusiona el valor de una clave. Si la clave no tiene
     estrategia conocida, cae a "última escritura gana" (seguro por defecto). */
  function mergeSection(key, local, remote, tsLocal, tsRemote) {
    var fn = STRATEGIES[key];
    if (!fn) return lastWrite(local, remote, tsLocal, tsRemote);
    return fn(local, remote, tsLocal, tsRemote);
  }

  var API = {
    mergeSection: mergeSection,
    mergeById: mergeById,
    dedupeBy: dedupeBy,
    mergeDateMapArrays: mergeDateMapArrays,
    mergeDateMapBoolArr: mergeDateMapBoolArr,
    lastWrite: lastWrite,
    strategies: STRATEGIES
  };
  /* Disponible como global en el navegador (globalThis === window) y también
     al evaluarse en Node para los tests (globalThis). */
  (typeof globalThis !== "undefined" ? globalThis : window).DiarioMerge = API;
})();
