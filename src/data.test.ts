// Checks de frontera. No se re-implementa ninguna regla del pipeline: se comprueba que el
// archivo recibido es el prometido.

import { describe, expect, it } from "vitest";
import {
  SUPPORTED_SCHEMA_VERSION,
  SchemaContractError,
  bundleFor,
  bundles,
  checkBundle,
  checkSchema,
  rowOf,
  schema,
} from "./data";
import type { Bundle, Schema } from "./types";

describe("la frontera del dump", () => {
  it("acepta el dump que trae el repo", () => {
    expect(schema.schema_version).toBe(SUPPORTED_SCHEMA_VERSION);
    expect(schema.pipeline_git_sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it("rechaza una versión que esta app no entiende, en vez de dibujar a medias", () => {
    const future = { ...schema, schema_version: SUPPORTED_SCHEMA_VERSION + 1 };
    expect(() => checkSchema(future as Schema)).toThrow(SchemaContractError);
  });

  it("rechaza un dump sin pipeline_git_sha: sin él nada es trazable", () => {
    expect(() => checkSchema({ ...schema, pipeline_git_sha: "" } as Schema)).toThrow(
      SchemaContractError,
    );
  });

  it("rechaza una arista hacia una máquina que el dump no trae", () => {
    const broken = {
      ...schema,
      level_transitions: [
        { ...schema.level_transitions[0], target_machine: "InventedState" },
      ],
    };
    expect(() => checkSchema(broken as Schema)).toThrow(SchemaContractError);
  });
});

describe("la frontera del bundle", () => {
  it("`runs` es una LISTA aunque venga vacía — es lo que se colapsa a objeto sin querer", () => {
    for (const bundle of bundles) expect(Array.isArray(bundle.runs)).toBe(true);
    expect(() => checkBundle({ ...bundles[0], runs: {} } as unknown as Bundle)).toThrow(
      SchemaContractError,
    );
  });

  it("toda sección ausente está justificada por el estado: MODELED sin structural es un hueco", () => {
    expect(() => checkBundle({ ...bundles[0], stage_state: "MODELED" })).toThrow(
      SchemaContractError,
    );
  });

  it("`blocked` poblado sin UNAVAILABLE es incoherente", () => {
    const blocked = { stage: "§2", reason: "CLONE_FAILED", message: "x", permanent: false };
    expect(() => checkBundle({ ...bundles[0], blocked })).toThrow(SchemaContractError);
  });

  it("las secciones que ninguna etapa produce viajan PRESENTES y en null", () => {
    // Omitirlas haría indistinguible «el caso no llegó ahí» de «esta versión no la traía».
    for (const bundle of bundles) {
      for (const section of ["dynamic", "structural", "warning"] as const) {
        expect(section in bundle, section).toBe(true);
        expect(bundle[section]).toBeNull();
      }
      // `catalog_origin` y `licence` son la excepción y por eso van aparte: no son etapas, son
      // procedencia. Están pobladas desde el momento en que el caso viene del catálogo.
      expect("catalog_origin" in bundle).toBe(true);
    }
  });
});

describe("la guarda del aviso experimental — probada rompiéndola", () => {
  // Hoy NO puede dispararse: ningún bundle trae `synthesis`. Por eso hace falta perturbarla —
  // una guarda que no se prueba es decoración, y ésta no avisaría de un error de tipeo en el
  // camino de acceso hasta el paso 7, que es cuando ya no serviría.
  const withPatch = (warning: unknown) =>
    ({
      ...bundles[0],
      warning,
      runs: [{ attempts: [{ synthesis: { diff: "--- a\n+++ b" } }] }],
    }) as unknown as Bundle;

  it("rechaza un parche generado sin su aviso", () => {
    expect(() => checkBundle(withPatch(null))).toThrow(SchemaContractError);
  });

  it("y lo acepta con él — si rechazara los dos, no comprobaría nada", () => {
    expect(() => checkBundle(withPatch({ experimental_only: true }))).not.toThrow();
  });

  it("hoy ningún bundle trae synthesis, así que la guarda no dispara sola", () => {
    for (const bundle of bundles) expect(bundle.warning).toBeNull();
  });
});

describe("los cinco ejecutados de verdad", () => {
  // **Todo lo que se afirma acá es sobre evidencia medida.** Antes convivían dos fixtures con
  // `ScriptedRunner`, un caso ad-hoc y los 94 con §1 sola; se fueron a propósito. Lo que se pierde
  // —§1 sobre los 94, y el contraste ad-hoc contra catálogo— sigue comprobado en el pipeline.

  it("son cinco, los cinco del catálogo, y los cinco llegaron a EXECUTED", () => {
    expect(bundles).toHaveLength(5);
    for (const bundle of bundles) {
      expect(bundle.case_id).not.toBeNull();
      expect(bundle.stage_state).toBe("EXECUTED");
      expect(bundle.execution).not.toBeNull();
    }
  });

  it("respetan el reparto del corpus: tres con la compuerta cerrada y dos que rompen por target", () => {
    // 37 y 57 sobre los 94. Una muestra mitad y mitad probaría los dos mecanismos por igual y
    // describiría otro corpus.
    const cerrada = bundles.filter((b) => b.execution!.configuration_evaluates.updated === false);
    expect(cerrada).toHaveLength(3);
    expect(bundles.length - cerrada.length).toBe(2);
  });

  it("con la compuerta cerrada la columna COLAPSA entera, y eso es un fallo, no su ausencia", () => {
    // Los 37 rompen igual que los 57: rompen antes. Leer «ninguna celda roja» como «nada que
    // reparar» marcaría el 39,4 % del corpus como no reproducido.
    for (const bundle of bundles) {
      if (bundle.execution!.configuration_evaluates.updated !== false) continue;
      const updated = bundle.execution!.probes.filter((p) => p.revision === "updated");
      expect(updated.length).toBeGreaterThan(0);
      expect(updated.every((p) => p.status === "not_reached")).toBe(true);
      expect(bundle.stage_state).toBe("EXECUTED");
    }
  });

  it("la matriz tiene las mismas filas en las dos revisiones: el plan sale de base", () => {
    for (const bundle of bundles) {
      const rows = (revision: string) =>
        new Set(
          bundle
            .execution!.probes.filter((p) => p.revision === revision)
            .map((p) => `${p.target} ${p.level}`),
        );
      expect([...rows("updated")].sort()).toEqual([...rows("base")].sort());
    }
  });

  it("los cuatro niveles aparecen, y `link` solo en iOS", () => {
    // ADR 0035: target y nivel son dos ejes. `link` es un paso de toolchain de Apple y no existe
    // en Android; que apareciera ahí sería una fila inventada.
    const celdas = bundles.flatMap((b) => b.execution!.probes);
    expect(new Set(celdas.map((p) => p.level))).toEqual(
      new Set(["compile", "compile-test", "link", "test-run"]),
    );
    for (const probe of celdas.filter((p) => p.level === "link")) {
      expect(probe.target).toBe("ios");
    }
  });

  it("hay un rojo de `test-run`, que es el nivel que el corpus tiene en cero medidos", () => {
    // La campaña de minado solo compiló. Es evidencia nueva, sin nada del catálogo contra qué
    // validarla — y por eso `probe_diff` no la contrasta.
    const testRun = bundles.flatMap((b) =>
      b.execution!.probes.filter((p) => p.level === "test-run"),
    );
    expect(testRun.some((p) => p.status === "red")).toBe(true);
  });

  it("el contraste con el catálogo se persiste coincida o no, y sus huecos son del catálogo", () => {
    for (const bundle of bundles) {
      expect(bundle.execution!.probe_diff).not.toBeNull();
    }
    // Ninguna línea es un desacuerdo de RESULTADO: todas dicen que al catálogo le falta la fila.
    // Es el hallazgo 4, y por eso no se ajusta la regla para que coincida.
    const lineas = bundles.flatMap((b) => b.execution!.probe_diff ?? []);
    expect(lineas.length).toBeGreaterThan(0);
    for (const linea of lineas) expect(linea).toContain("el catálogo no lo trae");
  });

  it("cada caso trae su procedencia y su licencia: vienen del catálogo", () => {
    for (const bundle of bundles) {
      expect(bundle.catalog_origin!.case_id).toBe(bundle.case_id);
      expect(bundle.catalog_origin!.corpus_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(bundle.licence!.spdx).not.toBe("");
    }
  });

  it("el log crudo de las DOS revisiones llega al almacén, no solo el de updated", () => {
    // El de base es el que decide qué observación es `preexisting`. Sin él, ese rol queda escrito
    // en la ficha sin nada contra qué auditarlo.
    for (const bundle of bundles) {
      expect(bundle.execution!.raw_log_ref).toMatch(/^[0-9a-f]{64}$/);
      expect(bundle.execution!.base_log_ref).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("bundleFor encuentra por la llave resuelta", () => {
    expect(bundleFor(bundles[0].case_key)!.case_id).toBe(bundles[0].case_id);
    expect(bundleFor("no/existe@aaaaaaa..bbbbbbb")).toBeUndefined();
  });
});

describe("lo que el layout da por hecho", () => {
  it("toda transición nombra estados que la máquina declara", () => {
    for (const machine of schema.machines) {
      for (const t of machine.transitions) {
        expect(rowOf(machine, t.source), `${machine.name}: ${t.source}`).toBeGreaterThanOrEqual(0);
        expect(rowOf(machine, t.target), `${machine.name}: ${t.target}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("toda arista entre niveles nombra estados que existen", () => {
    for (const edge of schema.level_transitions) {
      const from = schema.machines.find((m) => m.name === edge.source_machine)!;
      const to = schema.machines.find((m) => m.name === edge.target_machine)!;
      expect(rowOf(from, edge.source_state)).toBeGreaterThanOrEqual(0);
      expect(rowOf(to, edge.target_state)).toBeGreaterThanOrEqual(0);
    }
  });

  it("las tres máquinas caben en las tres columnas del layout", () => {
    // stack.md: se reconsidera la librería de grafos si aparece una cuarta máquina.
    expect(schema.machines).toHaveLength(3);
    expect(schema.machines.map((m) => m.name)).toEqual(["CaseState", "RunState", "AttemptState"]);
  });

  it("cada clase de la taxonomía trae su ejemplo, incluido el fallback", () => {
    expect(schema.taxonomy).toHaveLength(5);
    expect(schema.taxonomy.map((t) => t.kind)).toContain("fallback");
    for (const example of schema.taxonomy) {
      expect(example.diff.length).toBeGreaterThan(0);
      expect(example.source.length).toBeGreaterThan(0);
    }
  });
});
