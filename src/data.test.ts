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
  isProvisionalExit,
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

  it("las cuatro secciones que ninguna etapa produce viajan PRESENTES y en null", () => {
    // Omitirlas haría indistinguible «el caso no llegó ahí» de «esta versión no la traía».
    for (const bundle of bundles) {
      for (const section of ["dynamic", "structural", "catalog_origin", "licence"] as const) {
        expect(section in bundle, section).toBe(true);
        expect(bundle[section]).toBeNull();
      }
    }
  });
});

describe("los dos fixtures dicen cosas distintas a propósito", () => {
  it("worked_case llega a EXECUTED con el texto de error real y un ⊘ que no es fallo", () => {
    const bundle = bundleFor("acme/kmp-sample@0d8bee72..94fb90fc")!;
    expect(bundle.stage_state).toBe("EXECUTED");
    expect(bundle.execution!.build_errors).toContain("Unresolved reference");
    const ios = bundle.execution!.probes.filter((p) => p.target === "ios");
    expect(ios.every((p) => p.status === "environment_unavailable")).toBe(true);
  });

  it("no_failure_case es NO_REPAIR_NEEDED y PROVISIONAL, no un caso a medias", () => {
    const bundle = bundleFor("acme/kmp-quiet@aaaaaaa..bbbbbbb")!;
    expect(bundle.stage_state).toBe("NO_REPAIR_NEEDED");
    // El ADR 0015 §4 exige §3 antes de fijar esta salida, y §3 entra en el paso 4.
    expect(isProvisionalExit(bundle)).toBe(true);
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
