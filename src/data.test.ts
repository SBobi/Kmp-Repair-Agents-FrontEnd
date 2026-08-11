// Checks de frontera. No se re-implementa ninguna regla del pipeline: se comprueba que el
// archivo recibido es el prometido.

import { describe, expect, it } from "vitest";
import { SUPPORTED_SCHEMA_VERSION, SchemaContractError, checkSchema, rowOf, schema } from "./data";
import type { Schema } from "./types";

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
