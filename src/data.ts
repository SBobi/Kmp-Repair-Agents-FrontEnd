// La frontera de confianza. Los datos se importan, no se piden: sin fetch, y por tanto sin
// estado de carga, sin estado de error, sin spinner y sin race condition.
//
// **Un contrato que se mueve, y una app que lo detecta.** El dump del pipeline crece con cada
// paso del roadmap, así que acá se falla ruidosamente con uno que esta app no reconoce en vez
// de renderizar secciones a medias.

import adhocJson from "../data/bundle.adhoc_case.json";
import noFailureJson from "../data/bundle.no_failure_case.json";
import workedJson from "../data/bundle.worked_case.json";
import corpusJson from "../data/corpus.json";
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
 * Los dos fixtures (§1 + §2), **un caso ad-hoc de verdad** y los 94 del corpus (§1 sola: §2
 * necesita Gradle real). Que convivan no confunde porque el bundle se autodescribe: `case_id`
 * null es ad-hoc.
 *
 * El ad-hoc no está escrito a mano: lo emite `kmp-repair ingest --git` leyendo git, sin abrir el
 * catálogo (paso 3b). Es el mismo caso que uno de los 94 y **por eso vale**: en la vista se ven
 * los mismos bumps con `catalog_origin` y `catalog_contrast` ausentes, que es lo que un caso que
 * nunca estuvo en el corpus va a producir. Un fixture escrito a mano probaría que la vista dibuja
 * lo que le escribimos; éste prueba que dibuja lo que el pipeline emite.
 *
 * **Se exportan por procedencia, no solo concatenados, y eso arregla un defecto real.** Los tests
 * separaban el corpus con `case_id !== null` y luego afirmaban que ninguno pasa de `INGESTED` —
 * que es cierto de `corpus.json` y falso en cuanto un caso del catálogo se ejecute de verdad.
 * `case_id` dice «vino del catálogo», no «tiene §1 sola», y usarlo como si dijera lo segundo
 * funciona hasta que deja de funcionar. Es la segunda vez: ya pasó con `execution` cuando
 * llegaron los 94.
 */
export const fixtures: Bundle[] = [workedJson as Bundle, noFailureJson as Bundle].map(checkBundle);
export const adhoc: Bundle[] = [adhocJson as Bundle].map(checkBundle);
export const corpus: Bundle[] = (corpusJson as Bundle[]).map(checkBundle);

export const bundles: Bundle[] = [...fixtures, ...adhoc, ...corpus];

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
