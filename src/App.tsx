import { bundleFor, bundles, isProvisionalExit } from "./data";
import { useRoute } from "./routes";
import { Case } from "./views/Case";
import { Domain } from "./views/Domain";

function Index() {
  return (
    <main>
      <h1>Case Bundle Explorer</h1>
      <p className="state">
        Paso 2 — {bundles.length} casos, los dos de fixture. El índice de los 94 es del paso 11.
        Al lado, el dominio: <a href="#/domain">las tres máquinas de estados y la taxonomía</a>.
      </p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>caso</th>
              <th>estado</th>
              <th>bumps</th>
              <th>origen</th>
            </tr>
          </thead>
          <tbody>
            {bundles.map((bundle) => (
              <tr key={bundle.case_key}>
                <td>
                  <a href={`#/case/${bundle.case_key}`}>
                    <code>{bundle.case_key}</code>
                  </a>
                </td>
                <td>
                  <code>{bundle.stage_state}</code>
                  {isProvisionalExit(bundle) && <div className="muted">provisional</div>}
                </td>
                <td>{bundle.update?.bumps.length ?? "—"}</td>
                <td className="muted">
                  {bundle.case_id === null ? "ad-hoc" : `catálogo #${bundle.case_id}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function NotFound({ route }: { route: string }) {
  return (
    <main>
      <h1>Nada en <code>{route}</code></h1>
      <p className="state">
        Esta app importa los dumps en build time, así que solo existe lo que el pipeline emitió.
      </p>
    </main>
  );
}

export function App() {
  const route = useRoute();
  const caseKey = route.startsWith("/case/") ? decodeURIComponent(route.slice("/case/".length)) : null;
  const bundle = caseKey ? bundleFor(caseKey) : undefined;

  return (
    <>
      <nav>
        <a href="#/">índice</a>
        <a href="#/domain">domain</a>
      </nav>
      {route === "/domain" ? (
        <Domain />
      ) : caseKey ? (
        bundle ? (
          <Case bundle={bundle} />
        ) : (
          <NotFound route={route} />
        )
      ) : (
        <Index />
      )}
    </>
  );
}
