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

// ---- El dump del CASO (`kmp-repair dump`), que es otro artefacto ----

export interface Bump {
  label: string;
  from: string;
  to: string;
  file: string;
  update_kind: string;
}

export interface UpdateSection {
  bumps: Bump[];
  base_sha: string;
  head_sha: string;
  primary_bump: string | null;
}

export type ProbeStatus = "green" | "red" | "environment_unavailable" | "not_reached";

export interface Probe {
  target: string;
  level: string;
  revision: string;
  status: ProbeStatus;
  raw_log_ref: string | null;
}

export interface Failure {
  message: string;
  entity: string | null;
  parser_id: string;
  causal_role: string;
}

export interface ExecutionSection {
  probes: Probe[];
  failures: Failure[];
  build_errors: string;
  configuration_evaluates: Record<string, boolean>;
  raw_log_ref: string | null;
  probe_diff: string[];
}

export interface Blocked {
  stage: string;
  reason: string;
  message: string;
  permanent: boolean;
}

export interface CatalogProbe {
  target: string;
  stage: string;
  status: string;
  has_parseable_error: boolean;
  jdk_version: number;
}

export interface CatalogOrigin {
  corpus_version: string;
  case_id: number;
  repository: string;
  base_commit_date: string;
  environment_fingerprint: Record<string, unknown>;
  requirements: Record<string, unknown>;
  dependency_change: { label: string; from: string; to: string; source: string };
  probes: CatalogProbe[];
  repair_signal: { broken_targets: string[]; broken_families: string[]; base_green_targets: string[] };
}

export interface CatalogLicence {
  spdx: string;
  resolved_at: string;
  url: string;
  local_text: string | null;
  local_text_sha256: string | null;
}

export interface Bundle {
  schema_version: number;
  generated_at: string;
  pipeline_git_sha: string;
  case_key: string;
  resolved_key: string;
  case_id: number | null;
  stage_state: string;
  blocked: Blocked | null;
  update: UpdateSection | null;
  execution: ExecutionSection | null;
  dynamic: unknown | null;
  structural: unknown | null;
  runs: unknown[];
  catalog_origin: CatalogOrigin | null;
  licence: CatalogLicence | null;
  warning: unknown | null;
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
