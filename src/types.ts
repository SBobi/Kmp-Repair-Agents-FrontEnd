// Espejo a mano de lo que emite `kmp-repair schema-dump` — ver
// ../Kmp-Repair-Agents/src/kmp_repair/rendering/schema.py.
// El JSON importado se afirma como `Schema` en un único punto (`data.ts`), que es la frontera
// de confianza. Acá no se re-implementa ninguna regla del pipeline: solo se describe su forma.

export type StateKind = "initial" | "progress" | "terminal" | "exit" | "unavailable";

export interface State {
  name: string;
  kind: StateKind;
}

export interface Transition {
  source: string;
  target: string;
  stage: string | null;
  condition: string;
}

export interface Machine {
  name: string;
  column: string;
  covers: string;
  states: State[];
  transitions: Transition[];
}

export interface LevelTransition {
  source_machine: string;
  source_state: string;
  target_machine: string;
  target_state: string;
  cardinality: string;
  condition: string;
}

export interface KindExample {
  kind: string;
  what: string;
  file: string;
  diff: string;
  source: string;
  versioned: boolean;
}

export interface AbsentKind {
  name: string;
  why: string;
}

export interface BlockedReasonDoc {
  reason: string;
  permanent: boolean;
  why: string;
}

export interface Schema {
  schema_version: number;
  pipeline_git_sha: string;
  machines: Machine[];
  level_transitions: LevelTransition[];
  modes: { name: string; ordinal: number }[];
  taxonomy: KindExample[];
  absent_kinds: AbsentKind[];
  blocked_reasons: BlockedReasonDoc[];
}
