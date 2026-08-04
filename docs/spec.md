# Especificación funcional — visor de Case Bundles

**Estado: nada implementado.** Este documento es el backlog, ordenado por el
[roadmap del pipeline](../../Kmp-Repair-Agents/docs/roadmap.md): cada paso de allá tiene aquí su
vista, y el paso no se considera hecho hasta que esa vista existe y se mira
([ADR 0008](../../Kmp-Repair-Agents/docs/decisions/0008-every-step-verified-by-ui.md)).

## Qué es

Una web estática, puramente informativa, para leer un Case Bundle y **poder desconfiar de él**: ver
la evidencia cruda al lado de la decisión que el pipeline tomó con ella. No ejecuta nada, no lanza
corridas, no edita un caso.

**Muestra, no juzga.** Ninguna capa de `src/` re-implementa una regla del pipeline, ni recalcula un
score, ni oculta un caso. Si un caso terminó en `NO_SAFE_PATCH`, se muestra como tal: la abstención
es un resultado que se mide, no un hueco que se esconde. Misma disciplina que
[el front del Mining](../../../MINING/Kmp-Repair-Mining-FrontEnd/docs/spec.md) y que
`campaign-stats.md` del minado: **si una cifra de pantalla no coincide con la salida del pipeline,
gana el pipeline** — y entonces hay un bug aquí.

Los límites de lo que se puede mostrar están en [data-contract.md](data-contract.md). Lo que ahí
dice que no existe, aquí no se inventa.

---

## Las vistas, paso por paso

Cada bloque: **qué añade el pipeline** → **qué se ve** → **qué queda probado** (y qué lo falsaría).

### Paso 0 — andamiaje

Pipeline: repo, tooling, capas vacías. Aquí: Vite + React + TS, header, router hash, ruta índice
que dice honestamente "sin bundles todavía".

*Probado:* la app levanta y compila. Falsa si `npm run build` no pasa el type-check.

### Paso 1 — `domain/`: máquina de estados y taxonomía

Pipeline: entidades del Case Bundle, `CaseState` con sus transiciones, las 5 clases de
`update_kind`. Dump: `kmp-repair schema-dump`.

**Vista Domain.** El grafo de estados dibujado **desde el dump, no a mano**: nodos y aristas tal
como el dominio las declara, con los caminos de escape marcados (`NO_REPAIR_NEEDED`,
`NO_SAFE_PATCH → EXPLAINED`, y `UNAVAILABLE`, alcanzable desde cualquier nodo, con la arista de
vuelta dibujada solo para los `reason` transitorios). Al lado, la tabla de taxonomía con sus 5
clases y un ejemplo de diff por clase.

*Probado:* que la máquina de estados **es la que se cree que es**. Un estado sin salida, una
transición que se agregó sin declarar, o el `fallback` de taxonomía ausente se ven en un vistazo —
cosas que un test unitario también atrapa, pero solo si alguien pensó en escribirlo.

### Paso 2 — slice vertical con fakes: primera ficha de caso

Pipeline: etapas Update + Execution sobre `worked_case` y `no_failure_case`, con `ScriptedRunner`.
Primer `kmp-repair dump` real.

**Ficha de caso**, la vista central, seis secciones en el orden del Case Bundle. Las secciones que
el caso todavía no alcanzó se marcan **"no alcanzada"** con el estado que lo explica — nunca vacías
ni omitidas en silencio. Dentro:

- *Update*: la **lista de bumps** —cada uno con su `label`, versión origen→destino y su
  `update_kind`—, los dos SHAs y el diff del bot. Es una lista aunque traiga un solo elemento, y
  10 de los 94 casos traen entre 2 y 4: la vista los muestra todos, nunca solo el primero. Cuando
  una fase posterior marcó el **bump primario**, se destaca; mientras siga `null` no se inventa uno.
- *Execution*: la **rejilla target × stage** (base / updated), heredada del front del Mining con su
  misma semántica de glifos. Debajo, las `FailureObservation` tipadas con su rol causal
  (primary/cascade/preexisting/regression) — **incluido el texto de error real**, que es
  exactamente lo que el front del Mining declaró imposible de mostrar porque la campaña solo
  guardó un booleano.

*Probado:* `no_failure_case` debe llegar a `NO_REPAIR_NEEDED` y verse como tal, con las cuatro
secciones siguientes "no alcanzadas". Si la ficha lo pinta como un caso normal a medio hacer, el
atajo está mal implementado.

### Paso 3 — adapters reales: la misma ficha, otro origen

Pipeline: `GradleRunner`, `GitProvider` real, SQLite, artifact store, sobre un repo KMP pequeño.

**La misma ficha, sin una sola vista nueva.** Se añade el bloque **Requisitos** (JDK y su variable
de entorno, Gradle, Kotlin, AGP tal como los declara el repo *en ese commit*; `null` se muestra
como "no declarado", nunca se rellena con el valor actual) — copiado tal cual de la ficha del
Mining, y alimentado por el `environment_fingerprint` del corpus cuando el caso viene de ahí.

*Probado:* **que la ficha no cambie de forma entre fake y real es el criterio de aceptación del
adapter.** Si el dump real necesita campos que el fake no producía, el `ScriptedRunner` estaba
mintiendo y los tests con fakes valían menos de lo que parecía.

### Paso 4 — localización determinista

Pipeline: extractor estructural (source-sets, expect/actual) + scorer determinista.

**Vista Localización.** Los candidatos rankeados con el **desglose por señal**, no solo el orden
final: overlap de source-set/target, relación de import/entidad, mención en el dependency-diff,
expansión de familia expect/actual, y la evidencia dinámica (targets y tareas que fallaron,
menciones en el mensaje de error). Cada fila muestra qué señal aportó cuánto.

Al lado, el **grafo de source-sets** con los links expect/actual, y — cuando el extractor no pudo
parsear con confianza — el modelo parcial **marcado como parcial**, no disfrazado de completo.

*Probado:* se ve *por qué* un archivo quedó primero. Un ranking que sale bien por la señal
equivocada es indistinguible de uno correcto en una métrica agregada, y obvio en esta vista.

### Paso 5 — Localization Agent: determinista vs. re-rank

Pipeline: el agente re-rankea el top-K acotado, con fallback determinista.

**Dos columnas en la misma vista**: ranking determinista y ranking del agente, con el movimiento de
cada candidato entre ambos. Cuando el output no parseó, la vista muestra el ranking determinista
**y lo dice explícitamente**.

*Probado:* [ADR 0004](../../Kmp-Repair-Agents/docs/decisions/0004-deterministic-first-agent-escalation.md)
deja de ser una promesa del documento y pasa a ser algo que se mira: el fallback ocurrió o no
ocurrió, y se ve. También se ve el caso incómodo — que el agente empeore un ranking que ya estaba
bien.

### Paso 6 — reparación: intentos de patch

Pipeline: ruta build-level (extracción determinista de versión antes que el agente) + Repair Agent
para source-level + aplicador atómico.

**Vista Intentos.** Uno por intento, en orden: la ruta elegida (source-level / build-level) y por
qué, el **diff unificado** del patch (`DiffView` del Mining, con colapso para parches grandes),
aceptado o rechazado **con el motivo del aplicador** (path fuera del workspace, hash de snapshot
viejo, contexto de hunk que no casa, límite de tamaño, downgrade). Y el contador de llamadas a LLM,
con los reintentos de formato contabilizados **aparte** del budget experimental.

La comprobación de downgrade tiene **tres** salidas y la vista las distingue: rechazado, OK, y
`SKIPPED` con su motivo cuando no era comparable (un `reference-update` mueve shas, que no se
ordenan). **`SKIPPED` no se dibuja como OK** — misma regla que `None` ≠ 0. Sobre el corpus el
rechazo no dispara nunca (0 de 117 bumps), así que si aparece uno, es para mirarlo.

*Probado:* `toolchain_case` debe resolverse con **0 llamadas a LLM** y eso se lee en pantalla. Si
marca 1, la extracción determinista de versión mínima no está entrando y el ADR 0004 está roto en
la práctica aunque los tests pasen.

### Paso 7 — validación multi-target

Pipeline: re-corrida sobre workspace fresco con el patch re-aplicado, split remanente/nuevo,
outcome repo-level.

**Matriz de validación**: la misma rejilla, ahora con **tres columnas** — base / updated /
post-patch. Debajo, cada `FailureObservation` clasificada como **resuelta / remanente / nueva
(regresión)**, y el outcome repo-level derivado con su regla a la vista (`FULL_FIX` solo si *todos*
los targets ejecutables pasan; `environment_unavailable` no cuenta ni a favor ni en contra).

*Probado:* `regression_case` sale `REGRESSED` y se ve el error nuevo que lo causó, no un verde
promediado. `ios_linkage_case` muestra compile verde y link rojo en el **mismo target** — la razón
por la que CTSR y BSR no son la misma métrica.

### Paso 8 — explicación

Pipeline: renderer puro + Explanation Agent con fallback a plantilla.

**Vista Explicación**: el artefacto renderizado (Markdown al lado del JSON), con los **cuatro
campos de la auditoría del paper separados y etiquetados** — identifica la entidad reparada,
conecta el patch con la evidencia, reporta validación por target, declara incertidumbre — para que
se puedan marcar sin leer prosa buscándolos (auditoría interna, la hacen los autores; sin
revisores externos ni participantes — ver
[evaluation-protocol.md](../../Kmp-Repair-Agents/docs/evaluation-protocol.md)). Exporta el CSV de auditoría
(`case_id` + 4 columnas sí/no).

Cuando la narrativa vino del fallback determinista y no del agente, la vista lo indica.

*Probado:* que el agente **no puede alterar un resultado de validación**. La vista pone la prosa al
lado de los hechos duros que la originaron; una explicación que afirme algo que la matriz de al
lado contradice se ve inmediatamente.

### Paso 9 — evaluación: el grid

Pipeline: `EvidenceProfile × AttemptPolicy`, los 5 baselines, las métricas.

**Vista Evaluación**: heatmap del grid (4 perfiles × 3 políticas) por métrica, y la comparación de
baselines. Reglas duras heredadas del protocolo:

- Una métrica `None` se pinta **`None`, nunca 0** — un caso sin ground truth no es un caso con
  Hit@k cero.
- `NO_REPAIR_NEEDED` se reporta como tasa aparte, fuera del promedio de BSR/CTSR/FFSR/EFR.
- La abstención (`NO_SAFE_PATCH`) se reporta solo sobre los casos que tenían algo que reparar.
- El CSV por-caso completo siempre descargable: el agregado es el titular, el detalle es el
  apéndice, y de la pantalla se debe poder bajar a un caso concreto.

*Probado:* que el agregado no esté escondiendo su composición. De cada celda del heatmap se llega a
los casos que la forman.

### Paso 10 — el corpus real: índice de los 94

Pipeline: `SqliteCaseCatalogSource` sobre `paper_corpus_v1.db` + corrida completa.

**Índice filtrable** de los 94 casos con su **estado de reparación** — que es literalmente el hueco
que el front del Mining declaró fuera de alcance ("es el otro repo, y ese dato no existe todavía").
Filtros multi-select con conteo, mismo patrón: repo, familia rota, target roto, `update_kind`, JDK,
y los nuevos — estado final del caso, outcome de validación y **licencia SPDX**, que el
[ADR 0009](../../Kmp-Repair-Agents/docs/decisions/0009-generated-patches-carry-their-source-licence.md)
exige como vista de primera clase y no como `grep` (20 de los 94 son GPL-3.0). Filtros en la URL,
para compartir un subconjunto por enlace.

El panel de cabecera debe hacer visible el **desbalance heredado del corpus**, no promediarlo: dos
repos son el 37% de los casos, Android rompe ~4× más que iOS, y hay 2 casos iOS-solo. Está todo
declarado en
[campaign-stats.md §4b](../../../MINING/Kmp-Repair-Mining/docs/campaign-stats.md) y en el
[protocolo de evaluación](../../Kmp-Repair-Agents/docs/evaluation-protocol.md).

*Probado:* el resultado del paper con trazabilidad hasta el caso individual, sin volver a correr
nada.

---

## Mapa de rutas

```
/#/                      índice de casos (paso 10; antes, la lista de lo que haya)
/#/case/:owner/:name/:pr  ficha: las 6 secciones del Case Bundle
/#/domain                 máquina de estados y taxonomía (paso 1)
/#/eval                   grid, baselines, métricas (paso 9)
```

Navegación anterior/siguiente dentro del filtro activo en la ficha, igual que en el front del
Mining.

## Fuera de alcance

Deliberado, cada uno se añade cuando haga falta:

- **Lanzar corridas desde la UI.** Sin backend, sin escritura, sin auth. El pipeline se corre por
  CLI; esto lee su salida.
- **Edición o anotación de casos.** La auditoría humana de explicaciones sale como CSV y se llena
  fuera.
- **El embudo del minado** (479 tier-1 → 443 probados → 132 gold → 94). No es de este repo y no
  está en el dump; vive en `exploration.db`, que ni siquiera está versionado.
- **Comparación entre corridas** (misma métrica, dos backends de modelo, lado a lado). El
  `AgentCall` del bundle guarda lo necesario para hacerlo; la vista se añade cuando haya dos
  corridas reales que comparar, no antes.

## Accesibilidad

No negociable, las mismas cuatro del front del Mining: estado nunca solo por color; navegación
completa por teclado incluidos los filtros; foco visible; contraste AA sobre los verdes y rojos de
las matrices, que es justo donde el color se usa como dato.
