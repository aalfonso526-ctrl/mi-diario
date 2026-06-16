/* Utilidades de fecha compartidas entre el hub y la sección Tareas.
   Se carga como <script src="shared/dates.js"> (hub) o
   <script src="../shared/dates.js"> (secciones). */

function pad(n) { return n < 10 ? "0" + n : "" + n; }

function todayStr() {
  var d = new Date();
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

function dateStr(d) {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

function isoWeekKey(d) {
  var date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  var dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  var yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  var week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return date.getUTCFullYear() + "-W" + pad(week);
}

function monthKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1); }

function periodKey(repeat) {
  var now = new Date();
  if (repeat === "daily") return todayStr();
  if (repeat === "weekly") return isoWeekKey(now);
  if (repeat === "monthly") return monthKey(now);
  return null;
}

function daysDiff(dateStr) {
  if (!dateStr) return 0;
  var d = new Date(dateStr + "T00:00:00");
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}
