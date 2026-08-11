import { bundleFor, bundles, isProvisionalExit } from "./data";
import { useRoute } from "./routes";
import { Case } from "./views/Case";
import { Domain } from "./views/Domain";

function Index() {
  const corpus = bundles.filter((b) => b.case_id !== null);
  const repos = new Set(corpus.map((b) => b.case_key.split("@")[0]));
  const withExecution = bundles.filter((b) => b.execution !== null).length;
  const kinds = new Map<string, number>();
  for (const bundle of bundles)
    for (const bump of bundle.update?.bumps ?? [])
      kinds.set(bump.update_kind, (kinds.get(bump.update_kind) ?? 0) + 1);

  return (
    <main>
      <h1>Case Bundle Explorer</h1>
      <p className="state">
        {corpus.length} casos del corpus en {repos.size} repos, más {bundles.length - corpus.length}{" "}
        fixtures. <strong>{withExecution} tienen §2</strong>: sobre el corpus solo corrió §1, porque
        §2 necesita Gradle real (paso 3). Al lado, el dominio:{" "}
        <a href="#/domain">las tres máquinas de estados y la taxonomía</a>.
      </p>
      <p className="legend">
        {[...kinds].map(([kind, n]) => (
          <span key={kind} className="chip">
            <code>{kind}</code> {n}
          </span>
        ))}
      </p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>caso</th>
              <th>estado</th>
              <th>bumps</th>
              <th>clases</th>
              <th>origen</th>
            </tr>
          </thead>
          <tbody>
            {bundles.map((bundle) => (
              <tr key={bundle.case_key}>
                <td>
                  <a href={`#/case/${encodeURIComponent(bundle.case_key)}`}>
                    <code>{bundle.case_key}</code>
                  </a>
                </td>
                <td>
                  <code>{bundle.stage_state}</code>
                  {isProvisionalExit(bundle) && <div className="muted">provisional</div>}
                </td>
                <td>{bundle.update?.bumps.length ?? "—"}</td>
                <td className="muted">
                  {[...new Set((bundle.update?.bumps ?? []).map((b) => b.update_kind))].join(" · ")}
                </td>
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
