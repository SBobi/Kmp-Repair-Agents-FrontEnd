// Vista Domain (paso 1). Los tres grafos dibujados DESDE EL DUMP, no a mano, y las aristas
// ENTRE ellos — que son las que un grafo por máquina no enseña.
//
// SVG a mano y sin librería de grafos: las tres máquinas se apilan en tres columnas, el ciclo es
// una flecha de retorno dentro de la tercera, y las inter-nivel van de una columna a la
// siguiente. La jerarquía case → run → attempt ordena el layout, y un motor de grafos elegiría
// uno peor porque no sabe que hay niveles (stack.md).

import { rowOf, schema } from "../data";
import type { LevelTransition, Machine, State, StateKind, Transition } from "../types";

const COL_X = [40, 400, 760];
const BOX_W = 200;
const BOX_H = 44;
const ROW_H = 82;
const TOP = 76;
const BOTTOM_LANE = 56;

const GLYPH: Record<StateKind, string> = {
  initial: "▷",
  progress: "·",
  terminal: "■",
  exit: "◆",
  unavailable: "⊘",
};

const KIND_LABEL: Record<StateKind, string> = {
  initial: "entrada",
  progress: "avance",
  terminal: "terminal",
  exit: "salida temprana",
  unavailable: "indisponible",
};

const maxRows = Math.max(...schema.machines.map((m) => m.states.length));
const HEIGHT = TOP + maxRows * ROW_H + BOTTOM_LANE;
const WIDTH = COL_X[COL_X.length - 1] + BOX_W + 60;

const boxY = (row: number) => TOP + row * ROW_H;
const colOf = (machineName: string) => schema.machines.findIndex((m) => m.name === machineName);

function intraPath(machine: Machine, col: number, t: Transition, depth: number): string {
  const from = rowOf(machine, t.source);
  const to = rowOf(machine, t.target);
  const x = COL_X[col];
  if (to - from === 1) {
    const cx = x + BOX_W / 2;
    return `M ${cx} ${boxY(from) + BOX_H} L ${cx} ${boxY(to) - 8}`;
  }
  const y1 = boxY(from) + BOX_H / 2;
  const y2 = boxY(to) + BOX_H / 2;
  if (to > from) {
    // Baja saltándose filas: arco por la DERECHA de la columna.
    const out = x + BOX_W;
    const bulge = out + 24 + depth * 18;
    return `M ${out} ${y1} C ${bulge} ${y1}, ${bulge} ${y2}, ${out + 8} ${y2}`;
  }
  // Sube: arco por la IZQUIERDA. Acá viven las vueltas de UNAVAILABLE y el lazo.
  const bulge = x - 24 - depth * 18;
  return `M ${x} ${y1} C ${bulge} ${y1}, ${bulge} ${y2}, ${x - 8} ${y2}`;
}

function levelPath(edge: LevelTransition): string {
  const fromCol = colOf(edge.source_machine);
  const toCol = colOf(edge.target_machine);
  const fromMachine = schema.machines[fromCol];
  const toMachine = schema.machines[toCol];
  const y1 = boxY(rowOf(fromMachine, edge.source_state)) + BOX_H / 2;
  const y2 = boxY(rowOf(toMachine, edge.target_state)) + BOX_H / 2;
  if (toCol > fromCol) {
    const x1 = COL_X[fromCol] + BOX_W;
    const x2 = COL_X[toCol] - 8;
    const mid = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
  }
  // La única que va hacia atrás entre columnas: se rutea por debajo, sin cruzar nada.
  const lane = TOP + maxRows * ROW_H + 24;
  const x1 = COL_X[fromCol] + BOX_W / 2;
  const x2 = COL_X[toCol] + BOX_W / 2;
  return `M ${x1} ${boxY(rowOf(fromMachine, edge.source_state)) + BOX_H} L ${x1} ${lane} L ${x2} ${lane} L ${x2} ${boxY(rowOf(toMachine, edge.target_state)) + BOX_H + 8}`;
}

function StateBox({ state, col, row }: { state: State; col: number; row: number }) {
  return (
    <g>
      <rect
        x={COL_X[col]}
        y={boxY(row)}
        width={BOX_W}
        height={BOX_H}
        rx={4}
        className={`state state-${state.kind}`}
      />
      <rect x={COL_X[col]} y={boxY(row)} width={6} height={BOX_H} className={`bar bar-${state.kind}`} />
      <text x={COL_X[col] + 18} y={boxY(row) + BOX_H / 2 + 5} className="state-name">
        <tspan className="glyph">{GLYPH[state.kind]}</tspan> {state.name}
      </text>
      <title>
        {state.name} — {KIND_LABEL[state.kind]}
      </title>
    </g>
  );
}

function Diagram() {
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="machines"
      role="img"
      aria-label="Las tres máquinas de estados y las transiciones entre niveles"
    >
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="arrowhead" />
        </marker>
        <marker id="arrow-level" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="arrowhead-level" />
        </marker>
      </defs>

      {schema.machines.map((machine, col) => {
        let downDepth = 0;
        let upDepth = 0;
        return (
          <g key={machine.name}>
            <text x={COL_X[col]} y={28} className="machine-name">
              {machine.name}
            </text>
            <text x={COL_X[col]} y={48} className="machine-column">
              {machine.column}
            </text>
            {machine.transitions.map((t) => {
              const straight = rowOf(machine, t.target) - rowOf(machine, t.source) === 1;
              const down = rowOf(machine, t.target) > rowOf(machine, t.source);
              const depth = straight ? 0 : down ? downDepth++ : upDepth++;
              return (
                <path
                  key={`${t.source}->${t.target}`}
                  d={intraPath(machine, col, t, depth)}
                  className="edge"
                  markerEnd="url(#arrow)"
                >
                  <title>
                    {t.source} → {t.target}
                    {t.stage ? ` (${t.stage})` : ""}: {t.condition}
                  </title>
                </path>
              );
            })}
            {machine.states.map((state, row) => (
              <StateBox key={state.name} state={state} col={col} row={row} />
            ))}
          </g>
        );
      })}

      {schema.level_transitions.map((edge) => (
        <path
          key={`${edge.source_state}->${edge.target_machine}.${edge.target_state}`}
          d={levelPath(edge)}
          className="edge edge-level"
          markerEnd="url(#arrow-level)"
        >
          <title>
            {edge.source_machine}.{edge.source_state} → {edge.target_machine}.{edge.target_state} (
            {edge.cardinality}): {edge.condition}
          </title>
        </path>
      ))}
    </svg>
  );
}

function TransitionTable({ machine }: { machine: Machine }) {
  return (
    <>
      <h3>
        {machine.name} <span className="muted">· {machine.covers}</span>
      </h3>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>de</th>
              <th>a</th>
              <th>etapa</th>
              <th>cuándo</th>
            </tr>
          </thead>
          <tbody>
            {machine.transitions.map((t) => (
              <tr key={`${t.source}->${t.target}`}>
                <td>{t.source}</td>
                <td>{t.target}</td>
                <td>{t.stage ?? "—"}</td>
                <td>{t.condition}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function Domain() {
  return (
    <main>
      <h1>Máquinas de estados y taxonomía</h1>
      <p className="state">
        Todo lo de esta página sale de <code>kmp-repair schema-dump</code> —{" "}
        <code>schema_version {schema.schema_version}</code>, pipeline{" "}
        <code>{schema.pipeline_git_sha.slice(0, 8)}</code>. Nada está escrito a mano acá.
      </p>

      <Diagram />

      <p className="legend">
        {(Object.keys(GLYPH) as StateKind[]).map((kind) => (
          <span key={kind} className={`chip chip-${kind}`}>
            <span aria-hidden="true">{GLYPH[kind]}</span> {KIND_LABEL[kind]}
          </span>
        ))}
        <span className="chip chip-level">entre niveles</span>
      </p>

      <h2>Las transiciones, una por una</h2>
      {schema.machines.map((machine) => (
        <TransitionTable key={machine.name} machine={machine} />
      ))}

      <h3>Entre niveles</h3>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>de</th>
              <th>a</th>
              <th>cardinalidad</th>
              <th>cuándo</th>
            </tr>
          </thead>
          <tbody>
            {schema.level_transitions.map((edge) => (
              <tr key={`${edge.source_state}->${edge.target_machine}.${edge.target_state}`}>
                <td>
                  {edge.source_machine}.{edge.source_state}
                </td>
                <td>
                  {edge.target_machine}.{edge.target_state}
                </td>
                <td>{edge.cardinality}</td>
                <td>{edge.condition}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Taxonomía de {" "}<code>update_kind</code></h2>
      <p className="muted">
        Es <strong>por bump</strong> y <strong>no enruta nada</strong>: la ruta de §6 la decide la
        lista de §5. Sirve para describir el evento y estratificar resultados.
      </p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>clase</th>
              <th>qué la produce</th>
              <th>ejemplo</th>
            </tr>
          </thead>
          <tbody>
            {schema.taxonomy.map((example) => (
              <tr key={example.kind}>
                <td>
                  <code>{example.kind}</code>
                  {!example.versioned && <div className="muted">sin versión que ordenar</div>}
                </td>
                <td>{example.what}</td>
                <td>
                  <div className="muted">
                    {example.file} · {example.source}
                  </div>
                  <pre>{example.diff}</pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {schema.absent_kinds.map((absent) => (
        <p key={absent.name} className="absent">
          <code>{absent.name}</code> no está, y es deliberado: {absent.why}
        </p>
      ))}

      <h2>
        Motivos de <code>UNAVAILABLE</code>
      </h2>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>reason</th>
              <th>¿vuelve?</th>
              <th>por qué</th>
            </tr>
          </thead>
          <tbody>
            {schema.blocked_reasons.map((reason) => (
              <tr key={reason.reason}>
                <td>
                  <code>{reason.reason}</code>
                </td>
                <td>{reason.permanent ? "✗ permanente" : "↺ re-ingresable"}</td>
                <td>{reason.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
