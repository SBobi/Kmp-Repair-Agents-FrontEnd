import { useRoute } from "./routes";
import { Domain } from "./views/Domain";

function Index() {
  return (
    <main>
      <h1>Case Bundle Explorer</h1>
      <p className="state">
        Paso 1 — todavía no hay ningún caso que mostrar. Lo que sí hay es el dominio:{" "}
        <a href="#/domain">las tres máquinas de estados y la taxonomía</a>.
      </p>
      <p>
        Este visor solo muestra: importa un JSON en build time y lo dibuja. No ejecuta builds, no
        llama a ningún modelo y no decide nada sobre un caso.
      </p>
    </main>
  );
}

export function App() {
  const route = useRoute();
  return (
    <>
      <nav>
        <a href="#/">índice</a>
        <a href="#/domain">domain</a>
      </nav>
      {route === "/domain" ? <Domain /> : <Index />}
    </>
  );
}
