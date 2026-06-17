/* Tests del motor de fusión (shared/merge.js).

   Se evalúa el archivo real tal cual lo carga el navegador (asigna
   globalThis.DiarioMerge), en vez de importarlo como módulo, para probar
   exactamente el código que corre en producción. El foco son los escenarios
   de PÉRDIDA DE DATOS que esta fusión debe impedir. */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
let M;

beforeAll(() => {
  const src = readFileSync(resolve(here, "../shared/merge.js"), "utf8");
  (0, eval)(src); // ejecuta el IIFE -> globalThis.DiarioMerge
  M = globalThis.DiarioMerge;
});

describe("Inglés (planIngles_v1)", () => {
  it("no pierde un bloque marcado en cualquier dispositivo (OR por posición)", () => {
    const r = M.mergeSection(
      "planIngles_v1",
      { dias: { "2026-06-13": [true, false, false, false, false, false] } },
      { dias: { "2026-06-13": [false, true, false, false, false, false] } },
      1, 2
    );
    expect(r.dias["2026-06-13"]).toEqual([true, true, false, false, false, false]);
  });

  it("une días distintos de cada dispositivo", () => {
    const r = M.mergeSection(
      "planIngles_v1",
      { dias: { "2026-06-10": [true] } },
      { dias: { "2026-06-11": [true] } },
      1, 2
    );
    expect(Object.keys(r.dias).sort()).toEqual(["2026-06-10", "2026-06-11"]);
  });

  it("tolera dias ausente en un lado", () => {
    const r = M.mergeSection("planIngles_v1", {}, { dias: { "2026-06-13": [true] } }, 1, 2);
    expect(r.dias["2026-06-13"]).toEqual([true]);
  });
});

describe("Movilidad (movilidad-progress)", () => {
  it("une los vídeos del mismo día sin duplicar", () => {
    const r = M.mergeSection(
      "movilidad-progress",
      { "2026-06-13": ["v1", "v2"] },
      { "2026-06-13": ["v2", "v3"] }
    );
    expect(r["2026-06-13"]).toEqual(["v1", "v2", "v3"]);
  });

  it("conserva días que solo existen en un dispositivo", () => {
    const r = M.mergeSection("movilidad-progress", { a: ["v1"] }, { b: ["v2"] });
    expect(r).toEqual({ a: ["v1"], b: ["v2"] });
  });
});

describe("Ejercicio historial (entreno_historial_v1)", () => {
  it("deduplica por fecha y conserva sesiones distintas", () => {
    const r = M.mergeSection(
      "entreno_historial_v1",
      [{ fecha: "A", x: 1 }, { fecha: "B" }],
      [{ fecha: "A", x: 1 }, { fecha: "C" }]
    );
    expect(r.map((s) => s.fecha)).toEqual(["A", "B", "C"]);
  });

  it("trata como vacío un historial nulo", () => {
    const r = M.mergeSection("entreno_historial_v1", null, [{ fecha: "A" }]);
    expect(r.map((s) => s.fecha)).toEqual(["A"]);
  });
});

describe("Tareas (todo-app-v1)", () => {
  it("une por id; en conflicto gana el de updatedAt mayor", () => {
    const r = M.mergeSection(
      "todo-app-v1",
      { tasks: [{ id: 1, t: "vieja", updatedAt: 10 }, { id: 2, t: "solo-local" }], goals: [] },
      { tasks: [{ id: 1, t: "nueva", updatedAt: 20 }, { id: 3, t: "solo-remoto" }], goals: [] },
      1, 2
    );
    expect(r.tasks.map((t) => `${t.id}:${t.t}`)).toEqual(["1:nueva", "2:solo-local", "3:solo-remoto"]);
  });

  it("propaga el updatedAt máximo del documento", () => {
    const r = M.mergeSection(
      "todo-app-v1",
      { tasks: [], goals: [], updatedAt: 100 },
      { tasks: [], goals: [], updatedAt: 200 }
    );
    expect(r.updatedAt).toBe(200);
  });
});

describe("Configs por última escritura", () => {
  it("gana el de timestamp mayor", () => {
    expect(M.mergeSection("entreno_cfg_v1", { week: 3 }, { week: 5 }, 100, 200)).toEqual({ week: 5 });
  });
  it("conserva el local si es más nuevo", () => {
    expect(M.mergeSection("entreno_cfg_v1", { week: 3 }, { week: 5 }, 300, 200)).toEqual({ week: 3 });
  });
});

describe("Clave desconocida", () => {
  it("cae a última escritura (seguro por defecto)", () => {
    expect(M.mergeSection("otra", { a: 1 }, { a: 2 }, 1, 2)).toEqual({ a: 2 });
  });
});

describe("M1 — sellos por elemento y regla de empate (Tareas)", () => {
  it("un completado offline (updatedAt mayor) gana sobre el remoto antiguo", () => {
    const local  = { tasks: [{ id: 1, done: true,  updatedAt: 200 }], goals: [] };
    const remote = { tasks: [{ id: 1, done: false, updatedAt: 100 }], goals: [] };
    const r = M.mergeSection("todo-app-v1", local, remote, 200, 100);
    expect(r.tasks[0].done).toBe(true);
    /* El merge difiere del remoto -> handleSnapshot marcará needsPush. */
    expect(M.canonical(r) !== M.canonical(remote)).toBe(true);
  });

  it("ante empate real de updatedAt conserva el local (pendiente de push)", () => {
    const local  = { tasks: [{ id: 1, t: "local",  updatedAt: 50 }], goals: [] };
    const remote = { tasks: [{ id: 1, t: "remoto", updatedAt: 50 }], goals: [] };
    const r = M.mergeSection("todo-app-v1", local, remote, 1, 2);
    expect(r.tasks[0].t).toBe("local");
  });
});

/* Sellos recientes: los tombstones caducan a los 90 días, así que las pruebas
   usan instantes próximos a ahora (NEW > OLD). */
const NEW = Date.now() - 1000;
const OLD = Date.now() - 60000;

describe("M1 — tombstones de borrado (Tareas)", () => {
  it("una tarea borrada en A no resucita al fusionar con B", () => {
    const A = { tasks: [], goals: [], deleted: { 1: NEW } };
    const B = { tasks: [{ id: 1, t: "x", updatedAt: OLD }], goals: [] };
    const r = M.mergeSection("todo-app-v1", A, B);
    expect(r.tasks.map((t) => t.id)).toEqual([]);
    expect(r.deleted[1]).toBe(NEW);
  });

  it("si la tarea se editó DESPUÉS del borrado, reaparece", () => {
    const A = { tasks: [], goals: [], deleted: { 1: OLD } };
    const B = { tasks: [{ id: 1, t: "x", updatedAt: NEW }], goals: [] };
    const r = M.mergeSection("todo-app-v1", A, B);
    expect(r.tasks.map((t) => t.id)).toEqual([1]);
  });
});

describe("M1 — borrado de sesiones (Ejercicio)", () => {
  it("una sesión borrada en A no resucita al fusionar con B", () => {
    const A = { list: [], deleted: { "F1": NEW } };
    const B = [{ fecha: "F1" }, { fecha: "F2" }];
    const r = M.mergeSection("entreno_historial_v1", A, B);
    expect(r.list.map((s) => s.fecha)).toEqual(["F2"]);
  });
});

describe("M1 — desmarcar se propaga entre dispositivos", () => {
  it("Movilidad: un desmarcado reciente gana sobre la marca antigua", () => {
    const A = { "2026-06-13": [],     __ts: { "2026-06-13|v1": NEW } };
    const B = { "2026-06-13": ["v1"], __ts: { "2026-06-13|v1": OLD } };
    const r = M.mergeSection("movilidad-progress", A, B);
    expect(r["2026-06-13"] || []).toEqual([]);
  });

  it("Inglés: un desmarcado reciente gana sobre la marca antigua", () => {
    const A = { dias: { d: [false] }, diasTs: { d: [NEW] } };
    const B = { dias: { d: [true] },  diasTs: { d: [OLD] } };
    const r = M.mergeSection("planIngles_v1", A, B, 2, 1);
    expect(r.dias.d[0]).toBe(false);
  });
});

describe("Diario (diario-reflexion-v1)", () => {
  it("une entradas de días distintos sin perder ninguna", () => {
    const r = M.mergeSection(
      "diario-reflexion-v1",
      { "2026-06-10": { mood: 2, text: "lunes", updatedAt: 100 } },
      { "2026-06-11": { mood: 1, text: "martes", updatedAt: 100 } }
    );
    expect(Object.keys(r).sort()).toEqual(["2026-06-10", "2026-06-11"]);
    expect(r["2026-06-10"].text).toBe("lunes");
    expect(r["2026-06-11"].text).toBe("martes");
  });

  it("en conflicto el mismo día gana la de updatedAt mayor", () => {
    const r = M.mergeSection(
      "diario-reflexion-v1",
      { "2026-06-10": { mood: 0, text: "vieja", updatedAt: 100 } },
      { "2026-06-10": { mood: 3, text: "nueva", updatedAt: 200 } }
    );
    expect(r["2026-06-10"].text).toBe("nueva");
  });

  it("sin updatedAt gana el texto más largo (más conservador)", () => {
    const r = M.mergeSection(
      "diario-reflexion-v1",
      { "2026-06-10": { mood: 0, text: "corto" } },
      { "2026-06-10": { mood: 1, text: "un texto bastante más largo" } }
    );
    expect(r["2026-06-10"].text).toBe("un texto bastante más largo");
  });

  it("conserva la entrada que solo existe en un lado", () => {
    const r = M.mergeSection("diario-reflexion-v1", {}, { "2026-06-10": { mood: 2, text: "" } });
    expect(r["2026-06-10"].mood).toBe(2);
  });
});

describe("M1 — serialización canónica (anti-churn)", () => {
  it("dos estados con distinto orden de claves son iguales canónicamente", () => {
    const a = { b: 1, a: 2, c: { y: 1, x: 2 } };
    const b = { c: { x: 2, y: 1 }, a: 2, b: 1 };
    expect(M.canonical(a)).toBe(M.canonical(b));
    /* mismo contenido reordenado -> NO se considera cambio -> no genera push */
  });
});

describe("Helpers de fusión", () => {
  it("mergeById ignora elementos sin id", () => {
    const r = M.mergeById([{ id: 1 }, { sinId: true }], [{ id: 2 }], "id");
    expect(r.map((x) => x.id)).toEqual([1, 2]);
  });
  it("mergeDateMapBoolArr respeta longitudes distintas", () => {
    const r = M.mergeDateMapBoolArr({ d: [true] }, { d: [false, true] });
    expect(r.d).toEqual([true, true]);
  });
});
