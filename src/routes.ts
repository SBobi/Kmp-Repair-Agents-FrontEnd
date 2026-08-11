// Router hash a mano, heredado del front del Mining. Funciona igual en GitHub Pages, en
// `python -m http.server` y abriendo `dist/` a pelo, sin configurar rewrites.

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function useRoute(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.hash.replace(/^#/, "") || "/",
    () => "/",
  );
}
