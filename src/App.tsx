// Paso 0: la app levanta y no muestra ningún dato. No hay `data.ts` ni `types.ts` todavía
// porque no hay dump que leer — el pipeline está en el paso 0 (ver ../Kmp-Repair-Agents/docs/roadmap.md).
// La primera vista real es la del paso 1: las tres máquinas de estados, dibujadas desde
// `kmp-repair schema-dump`.

export function App() {
  return (
    <main>
      <h1>Case Bundle Explorer</h1>
      <p className="state">Paso 0 — la app levanta. Todavía no hay ningún dump que mostrar.</p>
      <p>
        Este visor solo muestra: importa un JSON en build time y lo dibuja. No ejecuta builds,
        no llama a ningún modelo y no decide nada sobre un caso.
      </p>
    </main>
  );
}
