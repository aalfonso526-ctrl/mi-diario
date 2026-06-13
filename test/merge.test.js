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
