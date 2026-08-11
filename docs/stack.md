# Stack y decisiones

Vite + React + TypeScript, sitio estático. **Implementado el andamiaje y la vista Domain.** Las decisiones de abajo
no se toman de cero: se **heredan** del front del Mining
([su stack.md](../../../MINING/Kmp-Repair-Mining-FrontEnd/docs/stack.md)), que ya las pagó y las
verificó en navegador. Repetir esa deliberación sería el trabajo más caro y menos útil de este
repo.

Cada decisión heredada lleva su condición de reversión, igual que allá.

## Heredado sin volver a discutir

- **Los datos se importan, no se piden.** `import bundleJson from '../data/bundle.json'` con
  `resolveJsonModule`. Sin `fetch`, y por tanto sin estado de carga, sin estado de error, sin
  spinner y sin race condition: tres ramas de UI que no hay que escribir ni probar.
  → Mover a `public/` + `fetch` el día que los dumps cambien sin querer redesplegar.
- **Router hash a mano** (`useSyncExternalStore` sobre `hashchange`, ~15 líneas), sin
  `react-router`. Funciona igual en GitHub Pages, en `python -m http.server` y abriendo `dist/` a
  pelo, sin configurar rewrites. → `react-router` cuando haya rutas anidadas o carga por ruta.
- **`useState` a secas, sin `useMemo`, sin store.** Nada que memoizar sobre unas decenas de casos;
  sin servidor que consultar, no hay caché que invalidar. Nada justifica Redux, Zustand o TanStack
  Query.
- **Filtrado con `Array.prototype.filter`.** → Reconsiderar por encima de unos miles de casos.
- **Sin virtualización.** 94 filas en el DOM no son un problema.
- **Facetas derivadas en carga, no codificadas.** Ningún literal de repos, targets ni estados: si
  el dump trae un valor nuevo, aparece solo.
- **CSS plano con custom properties, un archivo.** Tokens de color en `:root` — incluidos
  verde/rojo/gris de las matrices, tomados del mismo brand book. → Tailwind o CSS modules si crece
  a muchos componentes.
- **Tipos a mano en `types.ts`**, espejando [data-contract.md](data-contract.md). El JSON importado
  se afirma como `Bundle` en un único punto (`data.ts`), que es la frontera de confianza.

## Decisiones propias de este repo

**Un contrato que se mueve, y una app que lo detecta.**
El dump del Mining se congeló una vez; este crece con cada paso del roadmap. La app comprueba
`schema_version` en la frontera y **falla ruidosamente** con un dump que no reconoce, en vez de
renderizar secciones a medias. Es la diferencia práctica entre los dos frontends.

**CodeCharta se dibuja acá, con `three.js`, y el `.cc.json` además se puede descargar.**
El visor oficial de CodeCharta es una app externa (`maibornwolff.github.io`) y KMP-IMPACT lo embebe
por iframe contra ese host. Eso choca de frente con «los datos se importan, no se piden»: un iframe
reintroduce las tres ramas que esa regla elimina —carga, error, race— y añade una cuarta que no
teníamos, **un tercero que ve qué caso estás mirando**, en un artefacto que se publica.

Así que la ciudad la dibujamos nosotros sobre el mismo `.cc.json` —es un árbol de nodos con tres
atributos numéricos; extruir cajas sobre un treemap no es exótico— y al lado va el archivo
descargable con un botón «abrir en CodeCharta». Si alguien quiere el visor oficial, **salir es su
acción y no la de la página**.

→ Vendorizar el visor oficial el día que la nuestra se quede corta. Se descartó de entrada porque
es arrastrar una app Angular entera con su toolchain: mucho más código del que evita.

`three.js` es la única dependencia nueva que este repo añade sobre el stack heredado, y entra por
un requisito que ninguna de las heredadas cubre: 3D. **Todavía no está instalada**: entra con la
vista que la necesita, no antes.

**Sin fuente remota, y ésa es la única desviación del stack heredado.**
El front del Mining trae Darker Grotesque desde `fonts.googleapis.com`. Acá no, y es la misma regla
que dos párrafos más arriba mata el iframe de CodeCharta: una fuente alojada fuera es **un tercero
que ve quién abre la página**, en un artefacto que se publica. Que la petición sea de un `.woff2` y
no de un visor entero no cambia quién queda del otro lado. Pila del sistema (`system-ui`), cero
peticiones externas, y el CSP de un sitio estático deja de tener excepciones que explicar.
→ Se revisa si alguna vez hace falta una tipografía que la pila del sistema no dé, y entonces se
**vendoriza** el `.woff2`, no se enlaza.

**Componentes portados, no reinventados.**
`ProbeMatrix`, `DiffView` y `ChipGroup` ya existen resueltos en
`../../../MINING/Kmp-Repair-Mining-FrontEnd/src/components/`. Se portan adaptando el tipo de entrada
—la matriz pasa de 2 a 3 columnas en el paso 8— no se rediseñan. Copiar 60 líneas de un componente
ya verificado en navegador es más barato y más seguro que volver a decidir cómo se pinta un
`environment_unavailable`.

**Sin librería de gráficos.** El grid de evaluación (paso 10) es un heatmap de 4×3 celdas y el panel
del índice son barras y un donut — SVG a mano, mismo camino que `FamilyDonut`/`RepoBars`. Recharts
o D3 para eso pesan más que lo que ahorran.
→ Reconsiderar si aparece una visualización con ejes, escalas y zoom de verdad.

**Sin diagrama generado por librería para las máquinas de estados** (paso 1). **Son tres, no una**
—`CaseState`, `RunState`, `AttemptState`— y suman dieciséis estados
([schema.md](../../Kmp-Repair-Agents/docs/schema.md) § «Las tres máquinas de estados»).

**Y la condición de reconsiderar esto se disparó, así que hay que responderla en vez de dejarla
puesta.** Decía *«una librería de grafos el día que el dominio tenga transiciones que se crucen de
forma ilegible»*, y hoy hay dos cosas que no había: **un ciclo** —el lazo, en `AttemptState`— y
**flechas entre niveles**.

**Sigue alcanzando, y por eso concreto:** las tres máquinas se apilan en tres columnas, el ciclo es
**una** flecha de retorno dentro de la tercera, y las inter-nivel son flechas de una columna a la
siguiente. Nada se cruza — la jerarquía `case → run → attempt` es la que ordena el layout, y es la
misma que ordena las tablas. Un motor de grafos elegiría un layout peor, porque no sabe que hay
niveles.
→ Se reconsidera si aparece una cuarta máquina, o si una flecha tuviera que ir hacia atrás entre
columnas.

> **Y la segunda mitad de esa condición se disparó al dibujarlo, así que hay que responderla.**
> `AttemptState.EXPLAINED → RunState.EVALUATED` **va hacia atrás** entre columnas: la vuelta con
> `is_final` cierra la corrida, que vive una columna a la izquierda.
>
> **Sigue alcanzando, y es una sola.** Se rutea por un carril bajo el diagrama —de la base de la
> caja de origen, a lo ancho, y sube a la de destino— y no cruza ninguna otra arista. Un motor de
> grafos tendría que aprender que hay tres niveles y que ésa es la única excepción, que es más
> configuración de la que ahorra. Se reconsidera **si aparece la segunda**.

## Verificación

Una suite sobre `data.ts`, que es donde vive la única lógica no trivial: composición de filtros,
derivación de facetas, serialización a/desde la URL, y **los checks de frontera** del dump.

**Hoy son ocho, y todos son de frontera**, que es lo que corresponde con un solo artefacto
importado: que `schema_version` sea la que esta app entiende, que `pipeline_git_sha` esté, que
ninguna arista entre niveles apunte a una máquina o un estado que el dump no trae, y que la
taxonomía llegue con sus cinco clases y su ejemplo. Los de filtros y URL entran con la vista que
los tenga.

La mitad de la suite del Mining son checks de frontera y esa proporción se mantiene aquí: no se
re-implementa ninguna regla del pipeline, se comprueba que **el archivo recibido es el prometido**.
Como mínimo, lo que debe fallar si algo se rompe:

- `schema_version` es la que esta app entiende, y `pipeline_git_sha` está presente;
- toda sección ausente está justificada por el estado (`stage_state` del caso o `state` de la corrida) — no hay huecos sin explicación;
- ningún `environment_unavailable` aparece contado como fallo en un agregado;
- ninguna métrica `None` se serializa como `0`;
- **las dos listas son listas**, aunque traigan un solo elemento: `runs` —un caso que salió en §2 o
  §3 trae una sola corrida, con `mode = null`— y `runs[].attempts` —una corrida que salió verde a la
  primera trae una sola vuelta—. Es la forma que más va a aparecer al principio y la que se colapsa
  a objeto sin querer;
- ida y vuelta filtros → `URLSearchParams` → filtros sin pérdida.

Sin tests de render por componente, sin mocks del dump: se prueba contra un dump real de fixture,
que es estático y por tanto el mejor fixture posible.

**Verificación en navegador real** (Playwright u otro) se hace **por paso, a mano, y no queda como
dependencia** — misma decisión que en el Mining, donde se usó una vez para screenshots y se
desinstaló. Mirar la pantalla es el punto de
[ADR 0008](../../Kmp-Repair-Agents/docs/decisions/0008-every-step-verified-by-ui.md); automatizar
ese mirar no lo es.

## Comandos

```bash
npm install
npm run dev         # servidor local con recarga en caliente
npm run build       # tsc -b (type-check) + vite build → dist/
npm run preview     # sirve dist/ tal como quedaría en producción
npm test            # vitest run
```

Regenerar el dump no es un comando de este repo — ver [data-contract.md](data-contract.md).

## Despliegue

`npm run build` → `dist/`, estático, sin variables de entorno ni backend. El router hash lo hace
servible en cualquier sitio sin configurar rewrites.
