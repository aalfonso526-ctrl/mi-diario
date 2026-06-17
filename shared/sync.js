/* ============================================================
   DiarioSync — sincronización en la nube centralizada (Mi Diario).

   Solo lo carga el HUB (index.html). Autentica una vez con Google y mantiene
   las claves de las 4 secciones en un único documento users/{uid}:

     {
       _v: 2,
       sections: {
         "todo-app-v1":          { data: "<json>", updatedAt: <ms> },
         "entreno_historial_v1": { ... },
         ...
       }
     }

   Migración: el formato anterior solo de Tareas era { data, updatedAt } en la
   raíz del documento. Si se detecta, se interpreta como la sección
   "todo-app-v1" y se conserva antes de escribir nada nuevo (cero pérdida).

   Cada snapshot remoto se FUSIONA con lo local vía DiarioMerge (idempotente y
   conservador: nunca borra progreso) y, si el resultado difiere del remoto, se
   vuelve a subir para que ambos lados converjan.

   Depende de: firebase (compat app/auth/firestore), DiarioStore, DiarioMerge.
   Expuesto como window.DiarioSync. Script clásico (file:// y http).
   ============================================================ */
(function () {
  "use strict";

  var KEYS = [
    "todo-app-v1",
    "entreno_historial_v1",
    "entreno_cfg_v1",
    "entreno_draft_v1",
    "movilidad-progress",
    "planIngles_v1",
    "diario-reflexion-v1"
  ];
  /* "hub-logros-v1" NO se sincroniza a propósito: los logros se RECALCULAN en
     cada dispositivo a partir de los datos ya sincronizados (tareas, ejercicio,
     etc.) en renderDash, así que no necesita viajar por la nube. */

  var state = {
    db: null,
    user: null,
    unsub: null,
    onAuthChange: function () {},
    onApplied: function () {},
    pushTimer: null,
    applying: false   // evita reaccionar a nuestras propias escrituras locales
  };

  function parse(raw) { try { return raw == null ? null : JSON.parse(raw); } catch (e) { return null; } }

  /* Normaliza el documento remoto a un mapa { key: {value, updatedAt} },
     migrando el formato legacy de Tareas si hace falta. */
  function remoteSections(doc) {
    var out = {};
    if (!doc) return out;
    if (doc.sections && typeof doc.sections === "object") {
      Object.keys(doc.sections).forEach(function (k) {
        var s = doc.sections[k] || {};
        out[k] = { value: parse(s.data), updatedAt: +s.updatedAt || 0 };
      });
    } else if (typeof doc.data === "string") {
      /* Formato anterior: documento de Tareas en la raíz. */
      out["todo-app-v1"] = { value: parse(doc.data), updatedAt: +doc.updatedAt || 0 };
    }
    return out;
  }

  /* Construye el payload (solo las claves indicadas) desde localStorage. */
  function buildPayload(keys) {
    var sections = {};
    keys.forEach(function (k) {
      var raw = window.DiarioStore.getRaw(k);
      if (raw == null) return;
      sections[k] = { data: raw, updatedAt: window.DiarioStore.updatedAt(k) || Date.now() };
    });
    return { _v: 2, sections: sections };
  }

  function pushKeys(keys) {
    if (!state.user || !state.db) return;
    var payload = buildPayload(keys);
    if (!Object.keys(payload.sections).length) return;
    /* merge:true preserva las secciones no incluidas en este push. */
    state.db.collection("users").doc(state.user.uid).set(payload, { merge: true }).catch(function () {});
  }

  function handleSnapshot(snap) {
    if (snap.metadata && snap.metadata.hasPendingWrites) return; /* es nuestra propia escritura */
    var rem = remoteSections(snap.exists ? snap.data() : null);
    var changedSections = [], needsPush = false;

    state.applying = true;
    KEYS.forEach(function (key) {
      var localRaw = window.DiarioStore.getRaw(key);
      var localVal = parse(localRaw), localTs = window.DiarioStore.updatedAt(key);
      var r = rem[key] || { value: null, updatedAt: 0 };
      var remoteVal = r.value, remoteTs = r.updatedAt;

      if (remoteVal == null && localVal == null) return;

      var merged = window.DiarioMerge.mergeSection(key, localVal, remoteVal, localTs, remoteTs);
      var mergedStr = JSON.stringify(merged);
      /* Comparaciones por CONTENIDO (orden de claves canónico): así un mismo
         estado serializado con distinto orden de claves no cuenta como cambio
         y no genera reescrituras de ida y vuelta innecesarias (anti-churn). */
      var canon = window.DiarioMerge.canonical;
      var mergedCanon = canon(merged);

      if (mergedCanon !== canon(localVal)) {
        window.DiarioStore.setRaw(key, mergedStr, Math.max(localTs, remoteTs) || Date.now());
        changedSections.push(key);
      }
      /* Si el remoto no coincide con el resultado fusionado, hay que subirlo. */
      if (mergedCanon !== (r.value == null ? canon(null) : canon(remoteVal))) needsPush = true;
    });
    state.applying = false;

    if (changedSections.length) { try { state.onApplied(changedSections); } catch (e) {} }
    if (needsPush) { clearTimeout(state.pushTimer); state.pushTimer = setTimeout(function () { pushKeys(KEYS); }, 400); }
  }

  function startSync() {
    if (!state.user || !state.db) return;
    var ref = state.db.collection("users").doc(state.user.uid);
    state.unsub = ref.onSnapshot(handleSnapshot, function () {});
  }
  function stopSync() { if (state.unsub) { state.unsub(); state.unsub = null; } }

  var DiarioSync = {
    keys: KEYS,

    init: function (opts) {
      opts = opts || {};
      if (opts.onAuthChange) state.onAuthChange = opts.onAuthChange;
      if (opts.onApplied) state.onApplied = opts.onApplied;
      if (!opts.config || typeof firebase === "undefined") return false;

      firebase.initializeApp(opts.config);
      state.db = firebase.firestore();
      try { state.db.enablePersistence({ synchronizeTabs: true }).catch(function () {}); } catch (e) {}

      firebase.auth().onAuthStateChanged(function (u) {
        state.user = u;
        stopSync();
        if (u) startSync();
        try { state.onAuthChange(u); } catch (e) {}
      });
      firebase.auth().getRedirectResult().catch(function () {});
      return true;
    },

    login: function () {
      if (typeof firebase === "undefined") return;
      var provider = new firebase.auth.GoogleAuthProvider();
      firebase.auth().signInWithPopup(provider).catch(function (e) {
        var code = e && e.code ? e.code : "";
        if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
          firebase.auth().signInWithRedirect(provider);
        } else if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
          alert("No se pudo iniciar sesión: " + (e && e.message ? e.message : e));
        }
      });
    },

    logout: function () { if (typeof firebase !== "undefined") firebase.auth().signOut(); },

    isApplying: function () { return state.applying; },
    currentUser: function () { return state.user; },

    /* El hub llama aquí cuando una sección cambió su localStorage. */
    notifyLocalChange: function (key) {
      if (state.applying || !state.user) return;
      if (KEYS.indexOf(key) === -1) return;
      window.DiarioStore.stamp(key);
      clearTimeout(state.pushTimer);
      state.pushTimer = setTimeout(function () { pushKeys(KEYS); }, 600);
    }
  };

  window.DiarioSync = DiarioSync;
})();
