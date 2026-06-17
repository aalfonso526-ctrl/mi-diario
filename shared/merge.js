/* ============================================================
   Motor de fusión de datos entre dispositivos (Mi Diario).

   Reemplaza el "gana la última escritura del documento entero" por una
   fusión por elemento, con la estrategia natural de cada sección. El
   principio rector: NUNCA perder progreso. Ante la duda, conservar de más.

   Sellos por elemento (updatedAt) + tombstones (borrados/desmarcados con su
   propio sello). La regla general: gana el cambio MÁS RECIENTE; ante empate
   real se conserva el local (cambio pendiente de push), no "siempre remoto".
   Un borrado/desmarcado solo vence si su sello es más reciente que la última
   edición del elemento; en caso contrario, el elemento reaparece.

   Cada estrategia recibe (local, remoto[, tsLocal, tsRemoto]) y devuelve el
   estado fusionado. Se usa tanto en la sincronización en la nube como al
   importar un respaldo.

   Expuesto como window.DiarioMerge. Script clásico (file:// y http).
   ============================================================ */
(function () {
  "use strict";

  /* Caducidad de tombstones: pasado este tiempo se purgan en cada fusión.
     90 días es de sobra para que todos los dispositivos hayan sincronizado. */
  var TOMBSTONE_TTL = 90 * 24 * 60 * 60 * 1000;

  /* ---------- Serialización canónica (anti-churn) ----------
     Devuelve el JSON con las claves de los objetos ordenadas recursivamente,
     para poder comparar dos estados por contenido sin que un orden de claves
     distinto provoque reescrituras de ida y vuelta innecesarias. */
  function sortKeys(v) {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === "object") {
      var out = {};
      Object.keys(v).sort().forEach(function (k) { out[k] = sortKeys(v[k]); });
      return out;
    }
    return v;
  }
  function canonical(value) {
    try { return JSON.stringify(sortKeys(value)); } catch (e) { return JSON.stringify(value); }
  }

  /* ---------- Tombstones ----------
     Mapa { clave: sello }. Une dos mapas quedándose con el sello mayor y
     descarta los caducados. */
  function mergeTombstones(a, b, now) {
    a = a && typeof a === "object" ? a : {};
    b = b && typeof b === "object" ? b : {};
    now = now || Date.now();
    var out = {};
    [a, b].forEach(function (m) {
      Object.keys(m).forEach(function (k) {
        var ts = +m[k] || 0;
        if (ts && now - ts > TOMBSTONE_TTL) return; /* purga */
        if (ts > (out[k] || 0)) out[k] = ts;
      });
    });
    return out;
  }

  /* Quita de 'items' aquellos cuyo tombstone sea MÁS RECIENTE que su última
     edición (updatedAt). Si el elemento se editó después del borrado, reaparece. */
  function applyTombstones(items, deleted, idField) {
    if (!deleted) return items;
    return items.filter(function (it) {
      var t = deleted[it[idField]];
      return !(t && t > (+it.updatedAt || 0));
    });
  }

  /* Unión de arrays de objetos por un campo identificador.
     En conflicto (mismo id) gana el de 'updatedAt' más reciente; ante empate
     real se conserva el que ya estaba (local: se absorbe primero), que es el
     cambio pendiente de push. */
  function mergeById(local, remote, idField) {
    idField = idField || "id";
    local = Array.isArray(local) ? local : [];
    remote = Array.isArray(remote) ? remote : [];
    var map = {}, order = [];
    function absorb(list) {
      list.forEach(function (item) {
        if (!item || item[idField] == null) return;
        var k = item[idField], prev = map[k];
        if (!prev) { map[k] = item; order.push(k); return; }
        var pT = +prev.updatedAt || 0, iT = +item.updatedAt || 0;
        if (iT > pT) map[k] = item; /* empate -> se conserva el local ya presente */
      });
    }
    absorb(local);
    absorb(remote);
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

  /* Mapa fecha -> array de claves (Movilidad: vídeos hechos por día), con
     tombstones por celda (date|key) en '__ts'. Cada marcar/desmarcar sella la
     celda con Date.now(); aquí gana el estado del lado con sello mayor, de modo
     que un desmarcado reciente se propaga en vez de "resucitar" por la unión.
     Sin sellos a ambos lados (datos antiguos) cae a la unión conservadora. */
  function mergeDateMapArrays(local, remote, now) {
    local = local && typeof local === "object" ? local : {};
    remote = remote && typeof remote === "object" ? remote : {};
    now = now || Date.now();
    var lts = local.__ts && typeof local.__ts === "object" ? local.__ts : {};
    var rts = remote.__ts && typeof remote.__ts === "object" ? remote.__ts : {};

    function cellsOf(map) {
      var s = {};
      Object.keys(map).forEach(function (date) {
        if (date === "__ts") return;
        (Array.isArray(map[date]) ? map[date] : []).forEach(function (key) { s[date + "|" + key] = 1; });
      });
      return s;
    }
    var lDone = cellsOf(local), rDone = cellsOf(remote);
    var all = {};
    [lDone, rDone, lts, rts].forEach(function (m) { Object.keys(m).forEach(function (c) { all[c] = 1; }); });

    var out = {}, outTs = {};
    Object.keys(all).forEach(function (cell) {
      var lt = +lts[cell] || 0, rt = +rts[cell] || 0;
      var ts = Math.max(lt, rt);
      if (ts && now - ts > TOMBSTONE_TTL) { ts = 0; lt = 0; rt = 0; } /* caducado */
      var done;
      if (lt > rt) done = !!lDone[cell];
      else if (rt > lt) done = !!rDone[cell];
      else done = !!lDone[cell] || !!rDone[cell]; /* empate/legacy -> unión conservadora */
      var sep = cell.lastIndexOf("|");
      var date = cell.slice(0, sep), key = cell.slice(sep + 1);
      if (done) (out[date] = out[date] || []).push(key);
      if (ts) outTs[cell] = ts;
    });
    if (Object.keys(outTs).length) out.__ts = outTs;
    return out;
  }

  /* Mapa fecha -> array de booleanos: en una fecha común, OR posición a
     posición (la fusión más conservadora). Se conserva como helper público;
     la fusión de Inglés con sellos vive en mergeBoolArr. */
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

  /* Inglés: fusión de 'dias' (fecha -> [bool x6]) con sellos por posición en
     'diasTs' (fecha -> [ms x6]). Cada marcar/desmarcar sella la posición; gana
     el lado con sello mayor (así un desmarcado se propaga), y ante empate o
     ausencia de sello (datos antiguos) cae al OR conservador.
     Devuelve { dias, diasTs }. */
  function mergeBoolArr(lDias, rDias, lTs, rTs, now) {
    lDias = lDias && typeof lDias === "object" ? lDias : {};
    rDias = rDias && typeof rDias === "object" ? rDias : {};
    lTs = lTs && typeof lTs === "object" ? lTs : {};
    rTs = rTs && typeof rTs === "object" ? rTs : {};
    now = now || Date.now();
    var dias = {}, diasTs = {}, dates = {};
    [lDias, rDias, lTs, rTs].forEach(function (m) { Object.keys(m).forEach(function (d) { dates[d] = 1; }); });
    Object.keys(dates).forEach(function (date) {
      var a = Array.isArray(lDias[date]) ? lDias[date] : [];
      var b = Array.isArray(rDias[date]) ? rDias[date] : [];
      var at = Array.isArray(lTs[date]) ? lTs[date] : [];
      var bt = Array.isArray(rTs[date]) ? rTs[date] : [];
      var n = Math.max(a.length, b.length, at.length, bt.length), arr = [], tsArr = [], anyTs = false;
      for (var i = 0; i < n; i++) {
        var lt = +at[i] || 0, rt = +bt[i] || 0, ts = Math.max(lt, rt);
        if (ts && now - ts > TOMBSTONE_TTL) { ts = 0; lt = 0; rt = 0; }
        var v;
        if (lt > rt) v = Boolean(a[i]);
        else if (rt > lt) v = Boolean(b[i]);
        else v = Boolean(a[i]) || Boolean(b[i]); /* empate/legacy -> OR */
        arr.push(v); tsArr.push(ts);
        if (ts) anyTs = true;
      }
      dias[date] = arr;
      if (anyTs) diasTs[date] = tsArr;
    });
    return { dias: dias, diasTs: diasTs };
  }

  /* Último en escribir gana, decidido por marca de tiempo (no por contenido). */
  function lastWrite(local, remote, tsLocal, tsRemote) {
    return (+tsRemote || 0) >= (+tsLocal || 0) ? remote : local;
  }

  /* Normaliza el historial de Ejercicio: acepta el formato antiguo (array
     pelado) y el nuevo ({ list, deleted }). */
  function normHist(v) {
    if (Array.isArray(v)) return { list: v, deleted: {} };
    if (v && typeof v === "object") return { list: Array.isArray(v.list) ? v.list : [], deleted: v.deleted || {} };
    return { list: [], deleted: {} };
  }

  /* Registro de estrategias por clave de almacenamiento. */
  var STRATEGIES = {
    "todo-app-v1": function (l, r) {
      l = l || {}; r = r || {};
      var del = mergeTombstones(l.deleted, r.deleted);
      var out = {
        tasks: applyTombstones(mergeById(l.tasks, r.tasks, "id"), del, "id"),
        goals: applyTombstones(mergeById(l.goals, r.goals, "id"), del, "id")
      };
      if (Object.keys(del).length) out.deleted = del;
      out.updatedAt = Math.max(+l.updatedAt || 0, +r.updatedAt || 0);
      return out;
    },
    "entreno_historial_v1": function (l, r) {
      var ln = normHist(l), rn = normHist(r);
      var del = mergeTombstones(ln.deleted, rn.deleted);
      var list = dedupeBy(ln.list, rn.list, function (s) { return s && s.fecha; })
        .filter(function (s) { return !(s && del[s.fecha]); }); /* sesión borrada no resucita */
      /* Sin tombstones devolvemos el array pelado (compatibilidad total). */
      if (!Object.keys(del).length) return list;
      return { list: list, deleted: del };
    },
    "entreno_cfg_v1": lastWrite,
    "entreno_draft_v1": lastWrite,
    "movilidad-progress": function (l, r) { return mergeDateMapArrays(l, r); },
    "planIngles_v1": function (l, r, tl, tr) {
      l = l || {}; r = r || {};
      var base = Object.assign({}, lastWrite(l, r, tl, tr) || {}); /* base: campos sueltos (semana, etc.) */
      var m = mergeBoolArr(l.dias, r.dias, l.diasTs, r.diasTs);
      base.dias = m.dias;                       /* los días nunca se pierden */
      if (Object.keys(m.diasTs).length) base.diasTs = m.diasTs;
      else delete base.diasTs;
      return base;
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
    mergeBoolArr: mergeBoolArr,
    mergeTombstones: mergeTombstones,
    applyTombstones: applyTombstones,
    lastWrite: lastWrite,
    canonical: canonical,
    strategies: STRATEGIES
  };
  /* Disponible como global en el navegador (globalThis === window) y también
     al evaluarse en Node para los tests (globalThis). */
  (typeof globalThis !== "undefined" ? globalThis : window).DiarioMerge = API;
})();
