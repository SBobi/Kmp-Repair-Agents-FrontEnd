// La frontera de confianza. Los datos se importan, no se piden: sin fetch, y por tanto sin
// estado de carga, sin estado de error, sin spinner y sin race condition.
//
// **Un contrato que se mueve, y una app que lo detecta.** El dump del pipeline crece con cada
// paso del roadmap, así que acá se falla ruidosamente con uno que esta app no reconoce en vez
// de renderizar secciones a medias.

import executedJson from "../data/executed.json";
import schemaJson from "../data/schema.json";
import type { Bundle, Machine, Schema, State, Transition } from "./types";

/** La versión que esta app entiende. Subirla es portar las vistas, no tocar este número. */
export const SUPPORTED_SCHEMA_VERSION = 1;
export const SUPPORTED_BUNDLE_VERSION = 1;

/** Las ocho secciones del Case Bundle, en el orden de las etapas. Ninguna más. */
export const SECTIONS = [
  "update",
  "execution",
  "dynamic",
  "structural",
  "localization",
  "synthesis",
  "validation",
  "explanation",
] as const;

export class SchemaContractError extends Error {}

export function checkSchema(candidate: Schema): Schema {
  if (candidate.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    throw new SchemaContractError(
      `schema_version ${candidate.schema_version}: esta app entiende la ${SUPPORTED_SCHEMA_VERSION}. ` +
        `Regenerar el dump con \`kmp-repair schema-dump\`, o portar la vista.`,
    );
  }
  if (!candidate.pipeline_git_sha) {
    throw new SchemaContractError("falta pipeline_git_sha: el dump no es trazable a una versión");
  }
  const machineNames = new Set(candidate.machines.map((m) => m.name));
  for (const edge of candidate.level_transitions) {
    if (!machineNames.has(edge.source_machine) || !machineNames.has(edge.target_machine)) {
      throw new SchemaContractError(
        `arista entre niveles hacia una máquina que el dump no trae: ${edge.source_machine} → ${edge.target_machine}`,
      );
    }
  }
  return candidate;
}

export const schema: Schema = checkSchema(schemaJson as Schema);

export function checkBundle(candidate: Bundle): Bundle {
  if (candidate.schema_version !== SUPPORTED_BUNDLE_VERSION) {
    throw new SchemaContractError(
      `bundle schema_version ${candidate.schema_version}: esta app entiende la ${SUPPORTED_BUNDLE_VERSION}`,
    );
  }
  if (!candidate.pipeline_git_sha) {
    throw new SchemaContractError("bundle sin pipeline_git_sha: no es trazable a una versión");
  }
  // `runs` es una LISTA aunque traiga un solo elemento. Es la forma que más va a aparecer al
  // principio y la que se colapsa a objeto sin querer.
  if (!Array.isArray(candidate.runs)) {
    throw new SchemaContractError("`runs` tiene que ser una lista, también cuando trae una sola");
  }
  // Toda sección ausente tiene que estar justificada por el estado. `MODELED` es terminal de
  // CaseState, así que un caso EXECUTED sin `structural` es correcto; uno MODELED sin él, no.
  if (candidate.stage_state === "MODELED" && candidate.structural === null) {
    throw new SchemaContractError("MODELED sin `structural`: hay un hueco sin explicación");
  }
  if (candidate.blocked !== null && candidate.stage_state !== "UNAVAILABLE") {
    throw new SchemaContractError("`blocked` poblado sin estado UNAVAILABLE");
  }
  // Un parche generado NO se publica sin su aviso experimental. Hoy no hay ninguno, así que
  // esto no dispara — y ése es el momento de ponerlo: después del primer parche sería una
  // corrección, no un control. `GeneratedPatch.warning` habla del parche que produjo un modelo,
  // no del corpus: son dos sujetos distintos y cruzarlos es el defecto A18/A30.
  const hasPatch = (candidate.runs as { attempts?: { synthesis?: unknown }[] }[]).some((run) =>
    (run.attempts ?? []).some((attempt) => attempt.synthesis != null),
  );
  if (hasPatch && candidate.warning == null) {
    throw new SchemaContractError(
      "hay un parche generado y `warning` está vacío: no se publica un parche sin su aviso",
    );
  }
  return candidate;
}

/**
 * **Los cinco casos ejecutados de verdad, y nada más.**
 *
 * Salen de `scripts/probe_execution_against_catalog.py --dump`: §1 desde el catálogo y §2 con
 * Gradle real, sobre repositorios reales del corpus. Ninguno está escrito a mano.
 *
 * Antes convivían aquí cuatro fuentes —dos fixtures con `ScriptedRunner`, un caso ad-hoc salido de
 * git, y los 94 del corpus con §1 sola—. Se fueron a propósito: **lo que se mira ahora es evidencia
 * medida**, no la forma del contrato ilustrada con datos inventados. Las cuatro se regeneran con
 * un comando cada una (ver el README) si hiciera falta volver a mirarlas.
 *
 * **Lo que se pierde, y dónde sigue comprobado**: la vista de §1 sobre los 94 —19 repos, las 4
 * discrepancias de `catalog_contrast`— y la comparación ad-hoc contra catálogo que cerró el paso
 * 3b. Las dos garantías siguen vivas en el pipeline (`scripts/contrast_git_with_catalog.py` y
 * `tests/adapters/test_local_git.py`); lo que ya no se puede es mirarlas acá.
 *
 * Los cinco no se eligieron por comodidad: **tres tienen la compuerta de configuración cerrada en
 * `updated` y dos rompen por target**, que es el reparto del corpus (37 y 57).
 */
export const bundles: Bundle[] = (executedJson as unknown as Bundle[]).map(checkBundle);

export function bundleFor(caseKey: string): Bundle | undefined {
  return bundles.find((bundle) => bundle.case_key === caseKey);
}


/** Índice de fila de cada estado dentro de su máquina. El orden declarado ES el del layout. */
export function rowOf(machine: Machine, stateName: string): number {
  return machine.states.findIndex((state: State) => state.name === stateName);
}

/** Aristas que la vista dibuja como tramo recto: bajan exactamente una fila. */
export function isStraight(machine: Machine, transition: Transition): boolean {
  return rowOf(machine, transition.target) - rowOf(machine, transition.source) === 1;
}
