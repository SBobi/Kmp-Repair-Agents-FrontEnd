// Checks de frontera. No se re-implementa ninguna regla del pipeline: se comprueba que el
// archivo recibido es el prometido.

import { describe, expect, it } from "vitest";
import {
  SUPPORTED_SCHEMA_VERSION,
  SchemaContractError,
  adhoc,
  bundleFor,
  bundles,
  checkBundle,
  checkSchema,
  corpus,
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

describe("los dos fixtures dicen cosas distintas a propósito", () => {
  it("worked_case llega a EXECUTED con el texto de error real y un ⊘ que no es fallo", () => {
    const bundle = bundleFor("acme/kmp-sample@0d8bee72..94fb90fc")!;
    expect(bundle.stage_state).toBe("EXECUTED");
    expect(bundle.execution!.build_errors).toContain("Unresolved reference");
    const ios = bundle.execution!.probes.filter((p) => p.target === "ios");
    expect(ios.every((p) => p.status === "environment_unavailable")).toBe(true);
  });

  it("no_failure_case es NO_REPAIR_NEEDED, no un caso a medias", () => {
    const bundle = bundleFor("acme/kmp-quiet@aaaaaaa..bbbbbbb")!;
    expect(bundle.stage_state).toBe("NO_REPAIR_NEEDED");
    expect(bundle.execution!.failures).toEqual([]);
  });

  it("la matriz tiene las mismas filas en las dos revisiones: el plan sale de base", () => {
    // Solo los que tienen §2. Los 94 del corpus no la tienen y eso es correcto: sobre ellos
    // corrió §1 sola. Este test daba por hecho que todos la traían, y lo pilló al llegar el
    // corpus — que es exactamente para lo que sirve mirar datos reales en vez de dos fixtures.
    const withExecution = bundles.filter((b) => b.execution !== null);
    expect(withExecution.length).toBeGreaterThan(0);
    for (const bundle of withExecution) {
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

describe("los 94 del corpus", () => {
  // **Se toman por procedencia, no por `case_id !== null`.** Ese filtro decía «vino del catálogo»
  // y se estaba usando como si dijera «tiene §1 sola» — cierto de `corpus.json` y falso en cuanto
  // un caso del catálogo se ejecute de verdad. Es la segunda vez que el atajo falla: ya pasó con
  // `execution` cuando llegaron los 94.

  it("todos traen catalog_origin y licence, y ningún fixture los trae", () => {
    // Es procedencia y CONTRASTE, no evidencia: por eso vive fuera de `execution`.
    for (const bundle of corpus) {
      expect(bundle.catalog_origin).not.toBeNull();
      expect(bundle.catalog_origin!.case_id).toBe(bundle.case_id);
      expect(bundle.licence!.spdx).not.toBe("");
      // El texto de licencia servido por el sitio llega con el paso 11, no ahora.
      expect(bundle.licence!.local_text_sha256).toBeNull();
    }
    for (const bundle of [...adhoc, ...bundles.filter((b) => b.case_id === null)]) {
      expect(bundle.catalog_origin).toBeNull();
    }
  });

  it("el catálogo NO trae texto de error, solo un booleano", () => {
    // Por eso build_errors no puede existir sin correr un build: es el hueco que §2 cierra.
    for (const bundle of corpus)
      for (const probe of bundle.catalog_origin!.probes)
        expect(typeof probe.has_parseable_error).toBe("boolean");
  });

  it("son 94, en 19 repos, y ninguno de ESE archivo pasa de INGESTED", () => {
    // La afirmación es sobre `corpus.json`, que es §1 sola. **No sobre «todo caso con case_id»**:
    // un caso del catálogo ejecutado de verdad tiene `case_id` y llega a EXECUTED.
    expect(corpus).toHaveLength(94);
    expect(new Set(corpus.map((b) => b.case_key.split("@")[0])).size).toBe(19);
    expect(new Set(corpus.map((b) => b.stage_state))).toEqual(new Set(["INGESTED"]));
  });

  it("el contraste con el catálogo se persiste, coincida o no", () => {
    // Tres estados: `null` es «no se comparó», y los fixtures ad-hoc son los únicos así.
    for (const bundle of corpus) expect(bundle.update!.catalog_contrast).not.toBeNull();
    expect(corpus.filter((b) => b.update!.catalog_contrast!.agrees === false)).toHaveLength(4);
    for (const bundle of bundles.filter((b) => b.case_id === null))
      expect(bundle.update!.catalog_contrast).toBeNull();
    for (const bundle of adhoc) expect(bundle.update!.catalog_contrast).toBeNull();
  });

  it("el caso ad-hoc y el del catálogo dibujan el mismo §1 sobre el mismo caso", () => {
    // El criterio de cierre del paso 3b, del lado de la vista. El ad-hoc salió de `git diff` y
    // el otro de la columna `dependency_diff`: si la ficha se viera distinta, la vista estaría
    // mostrando de dónde vino el dato en vez de qué dice.
    const adhoc = bundles.find((b) => b.case_key === "Oztechan/CCC@0d8bee72..94fb90fc")!;
    const fromCatalog = bundles.find((b) => b.case_key === adhoc.resolved_key)!;
    expect(adhoc.update!.bumps).toEqual(fromCatalog.update!.bumps);
    // Y lo que sí cambia, que es justo lo que la vista tiene que saber pintar como ausencia:
    // sin catálogo no hay procedencia, ni licencia, ni contraste. Ninguno es un cero.
    expect(adhoc.case_id).toBeNull();
    expect(adhoc.catalog_origin).toBeNull();
    expect(adhoc.licence).toBeNull();
    expect(adhoc.update!.catalog_contrast).toBeNull();
    expect(fromCatalog.update!.catalog_contrast!.agrees).toBe(true);
  });

  it("ninguna lista de bumps sale vacía, y ninguno usa la forma #pr", () => {
    // `model_input` no tiene columna `pr_number`: los 94 llevan siempre @base..head.
    for (const bundle of corpus) {
      expect(bundle.update!.bumps.length).toBeGreaterThan(0);
      expect(bundle.case_key).not.toContain("#");
    }
  });

  it("una ficha sin §2 no puede pintarse como un caso a medio hacer", () => {
    // Su estado es INGESTED y eso EXPLICA las siete secciones ausentes. Si la vista las
    // dibujara vacías sin decir por qué, un caso no ejecutado y uno roto se verían igual.
    for (const bundle of corpus) {
      expect(bundle.execution).toBeNull();
      expect(bundle.blocked).toBeNull();
      expect(bundle.runs).toEqual([]);
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
