/* ============================================================
   Receptor de tema compartido por las secciones embebidas
   (Ejercicio, Movilidad, Inglés).

   Comportamiento:
   - Si nadie ha fijado el tema, sigue al del sistema operativo.
   - El hub (index.html) impone el tema efectivo vía postMessage
     ({ type: "set-theme", theme: "light"|"dark" }); a partir de ahí
     queda "bloqueado" y deja de seguir al sistema.

   Se carga como <script src="../shared/theme.js"></script> en el <head>
   (script clásico y síncrono para evitar parpadeo y funcionar en file://).
   La sección "Tareas" NO usa este archivo: es la dueña del tema y tiene
   su propia lógica de selección (auto/claro/oscuro).
   ============================================================ */
(function () {
  var el = document.documentElement, mq = matchMedia("(prefers-color-scheme: dark)");
  if (!el.getAttribute("data-theme")) el.setAttribute("data-theme", mq.matches ? "dark" : "light");
  mq.addEventListener("change", function (e) {
    if (el.getAttribute("data-theme-locked") !== "1") el.setAttribute("data-theme", e.matches ? "dark" : "light");
  });
  window.addEventListener("message", function (ev) {
    if (ev.data && ev.data.type === "set-theme") { el.setAttribute("data-theme", ev.data.theme); el.setAttribute("data-theme-locked", "1"); }
  });
})();
