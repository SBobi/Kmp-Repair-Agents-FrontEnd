# Especificación funcional — visor de Case Bundles

**Estado: los pasos 0, 1 y 2 implementados; del 3 en adelante, backlog.** Este documento sigue el
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

### Paso 0 — andamiaje · **implementado**

Pipeline: repo, tooling, capas vacías. Aquí: Vite + React + TS, header, router hash, ruta índice
que dice honestamente "sin bundles todavía".

*Probado:* la app levanta y compila. Falsa si `npm run build` no pasa el type-check.

### Paso 1 — `domain/`: máquina de estados y taxonomía · **implementado** (`/#/domain`)

Pipeline: entidades del Case Bundle, **tres** máquinas de estados —`CaseState`, `RunState`,
`AttemptState`— con sus transiciones, las 5 clases de
`update_kind`. Dump: `kmp-repair schema-dump`.

**Vista Domain.** Los **tres** grafos dibujados **desde el dump, no a mano**, y **las aristas entre
ellos** —`CaseState.MODELED` abre N `RunState.STARTED`; `AttemptState.EXPLAINED` vuelve a `PATCHED`
o cierra la corrida—. Esas aristas entre niveles son las que importan: es donde el diseño se
equivocó dos veces, y un grafo por máquina no las habría enseñado. Nodos y aristas tal
como el dominio las declara, con los caminos de escape marcados (`NO_REPAIR_NEEDED` y
`NOT_REPRODUCED`, que se ven distintos porque significan lo contrario,
`NO_SAFE_PATCH → EXPLAINED`, y `UNAVAILABLE`, alcanzable desde cualquier nodo, con la arista de
vuelta dibujada solo para los `reason` transitorios). Al lado, la tabla de taxonomía con sus 5
clases y un ejemplo de diff por clase.

*Probado:* que la máquina de estados **es la que se cree que es**. Un estado sin salida, una
transición que se agregó sin declarar, o el `fallback` de taxonomía ausente se ven en un vistazo —
cosas que un test unitario también atrapa, pero solo si alguien pensó en escribirlo.

*Cómo quedó, y una cosa que la vista encontró antes que el test.* Tres columnas, SVG a mano, cada
estado con **glifo además de color**, y debajo la tabla completa de transiciones con la condición
de cada una — el diagrama para ver la forma, la tabla para leer el porqué sin depender de un
tooltip. `data.ts` comprueba en la frontera que toda arista nombra estados que el dump declara.

Lo que apareció al dibujarlo: **`UNAVAILABLE` está en dos máquinas**, y `schema.md` decía que
ninguna comparte un valor. No era un error de este visor sino de esa frase — el ADR 0012 lo
decidió así en su enmienda del 2026-08-08, y el conteo de dieciséis estados de
[stack.md](stack.md) solo cuadra contándolo dos veces. Corregido allá; acá queda anotado porque
es exactamente lo que esta vista existe para producir.

*Y una condición de reversión que se disparó.* [stack.md](stack.md) decía reconsiderar la librería
de grafos «si una flecha tuviera que ir hacia atrás entre columnas», y
`AttemptState.EXPLAINED → RunState.EVALUATED` va hacia atrás. **Es una sola**, se rutea por debajo
sin cruzar nada, y no justifica arrastrar un motor de layout que además no sabe que hay niveles.
Se reconsidera si aparece la segunda.

### Paso 2 — slice vertical con fakes: primera ficha de caso · **implementado** (`/#/case/…`)

Pipeline: etapas Update + Execution sobre `worked_case` y `no_failure_case`, con `ScriptedRunner`.
Primer `kmp-repair dump` real.

**Ficha de caso**, la vista central, ocho secciones en el orden del Case Bundle. Las secciones que
el caso todavía no alcanzó se marcan **"no alcanzada"** con el estado que lo explica — nunca vacías
ni omitidas en silencio. Dentro:

- *Update*: la **lista de bumps** —cada uno con su `label`, versión origen→destino y su
  `update_kind`—, los dos SHAs y el diff del bot. Es una lista aunque traiga un solo elemento, y
  10 de los 94 casos traen entre 2 y 4: la vista los muestra todos, nunca solo el primero. Cuando
  una fase posterior marcó el **bump primario**, se destaca; mientras siga `null` no se inventa uno.
- *Execution*: la **rejilla target × stage** (base / updated), heredada del front del Mining con su
  misma semántica de glifos, **más una columna de nivel** — `compile`, `compile-test`, `link`,
  `test-run`. Sin ella, los 7 casos que solo rompen al compilar tests quedan escondidos como «un
  target más», que es justo el dato que dice que compilar `main` no alcanza.

  **La rejilla tiene las filas que el caso tiene**, y esas filas salen de la revisión base. En los
  37 casos cuyo build script no evalúa en `updated`, la rejilla existe —35 de ellos tienen los
  cinco targets verdes en base— y lo que colapsa es **esa columna**: cada celda se dibuja **«no
  alcanzado: la configuración falló antes»**, con el error de configuración encima. Ni `⊘` —que
  diría «no pudimos»— ni rojo —que diría «ese target rompió»—. Un target que el repo nunca declaró
  tampoco es `⊘`: simplemente no tiene fila. Debajo, las `FailureObservation` tipadas con su rol causal
  (primary/cascade/preexisting/regression) — **incluido el texto de error real**, que es
  exactamente lo que el front del Mining declaró imposible de mostrar porque la campaña solo
  guardó un booleano.

*Probado:* `no_failure_case` debe llegar a `NO_REPAIR_NEEDED` y verse como tal, con las cuatro
secciones siguientes "no alcanzadas". Si la ficha lo pinta como un caso normal a medio hacer, el
atajo está mal implementado.

*Cómo quedó.* Las ocho secciones se listan siempre y las seis que ninguna etapa produce todavía se
dibujan **"no alcanzada" con la razón derivada del estado**, no con un texto fijo: un
`NO_REPAIR_NEEDED` dice «el caso salió en §2», un `EXECUTED` dice «§4 es perezosa y el caso no
llegó», un `UNAVAILABLE` dice en qué etapa se cayó. La rejilla es target × revisión **con columna
de nivel**, y la columna `updated` sabe colapsar a «no alcanzado» cuando la configuración no
evalúa. Cada celda lleva **glifo y etiqueta en texto**, no solo color.

Y `NO_REPAIR_NEEDED` sale marcado **PROVISIONAL** con su razón a la vista, derivada de que
`dynamic` siga en `null` — el ADR 0015 §4 exige que §3 corra antes de fijar esa salida. No hace
falta un campo nuevo para saberlo: la ausencia de la sección **es** el dato.

### Paso 3 — adapters reales: la misma ficha, otro origen

Pipeline: `GradleRunner`, `GitProvider` real, SQLite, artifact store, sobre un repo KMP pequeño.

**La misma ficha, sin una sola vista nueva.** Se añade el bloque **Requisitos** (JDK y su variable
de entorno, Gradle, Kotlin, AGP tal como los declara el repo *en ese commit*; `null` se muestra
como "no declarado", nunca se rellena con el valor actual) — copiado tal cual de la ficha del
Mining, y alimentado por el `environment_fingerprint` del corpus cuando el caso viene de ahí.

*Probado:* **que la ficha no cambie de forma entre fake y real es el criterio de aceptación del
adapter.** Si el dump real necesita campos que el fake no producía, el `ScriptedRunner` estaba
mintiendo y los tests con fakes valían menos de lo que parecía.

### Paso 4 — evidencia dinámica: exploración de UI

Pipeline: puerto `UiExplorer` con `DroidBotExplorer` y `FakeExplorer`, `assembleDebug` sobre base y
updated, y la base explorada **dos veces** para medir el piso de ruido
([ADR 0015](../../Kmp-Repair-Agents/docs/decisions/0015-dynamic-ui-evidence-with-a-noise-floor.md)).

**Vista Evidencia dinámica** (solo cuando el caso la tiene; `null` fuera de Android). Ojo: el
`status` es **por revisión**, así que un caso puede tener la base explorada y `updated` bloqueada —
es lo que pasa en los 37 de `configuration`, y esa base explorada es lo que hace posible la
comparación del paso 8. El diff de
exploración **con su piso de ruido al lado, siempre**: un diff de 3 pantallas sobre un piso de 4 no
es una regresión, y mostrarlo sin el piso lo convertiría en una. Debajo, la cobertura por activity
—cuántas veces se visitó cada pantalla—, que es lo que deja juzgar si una pantalla «ausente» lo
está o simplemente no se visitó.

`blocked` se dibuja como bloqueado **con su motivo**, nunca como verde ni como regresión — misma
regla que `⊘`. Y la vista dice explícitamente que **una exploración sin diferencias no prueba
equivalencia de comportamiento**: prueba que un recorrido acotado no encontró diferencias.

*Probado:* que un diff **bajo** el piso no se publique como regresión. `ui_regression_case` sobre
`FakeExplorer` lo verifica sin encender un emulador — que es la única forma de probar de manera
determinista una lógica cuyo objeto es medir varianza.

### Paso 5 — el plano: modelo estructural y árbol de impacto

Pipeline: extractor estructural (source-sets, expect/actual) + **árbol de impacto** (BFS sin límite,
dos semillas, aristas `configura` hacia los nodos de build). **No hay scorer**
([ADR 0019](../../Kmp-Repair-Agents/docs/decisions/0019-the-agent-localizes-over-a-deterministic-tree.md)).

**Vista El plano.** El árbol de propagación entero, tal como el agente lo va a recibir: cada nodo
con su `relation` (`DIRECT` / `TRANSITIVE` / `EXPECT_ACTUAL`), su `distance`, y `propagated_from`
—por quién llegó—. Las semillas se distinguen de lo propagado, y se distingue **de qué semilla**:
importadores de la dependencia, o entidades del error de §2.

Lo que esta vista prueba es lo que ninguna métrica muestra: **el árbol se puede mirar entero antes
de que ningún agente lo toque**, y es lo que diagnostica el momento 1 de la medición. Si el archivo
correcto no está acá, el agente no va a poder leerlo — aunque **sí** puede proponerlo, y si acierta
así es el hallazgo más interesante de la corrida.

Los nodos de build cuelgan por la arista `configura`, no por imports — y el wrapper cuelga de la
raíz con alcance `GLOBAL`, que la vista tiene que pintar distinto: colgarlo de un módulo sería una
dirección falsa.

Al lado, el **grafo de source-sets** con los links expect/actual, y — cuando el extractor no pudo
parsear con confianza — el modelo parcial **marcado como parcial**, no disfrazado de completo. El
modelo trae `extraction_layers`, así que la vista dice **con qué capas se construyó**: un modelo de
capa 3 sola no vale lo mismo que uno con Gradle detrás, y en los 37 casos que no configuran la capa
autoritativa no existe.

Y un `orphan_actual` —un `actual` sin su `expect`— se muestra como hallazgo, no se omite: suele
significar que la actualización eliminó la declaración compartida.

**Cuatro codificaciones heredadas de KMP-IMPACT**, del mismo autor, reescritas en React sobre el
JSON ya emitido — se traslada qué se dibuja, nunca las 3.100 líneas que lo generan allá
([ADR 0016](../../Kmp-Repair-Agents/docs/decisions/0016-what-we-reuse-from-kmp-impact-and-old.md)):

| vista | codificación |
|---|---|
| **Sunburst** | source-set → paquete → archivo, jerárquico. Es la forma de ver de un vistazo si el impacto cayó en código compartido o en una sola plataforma |
| **`impact_level`** | 0 no impactado · 1 transitivo · 2 directo. Tres niveles, ya probados en repos reales |
| **Árbol de propagación** | cada archivo transitivo con su `propagated_from`: se ve por qué entró, no solo que entró |
| **CodeCharta** | ciudad 3D: área = líneas reales, altura = `complexity_proxy`, **color = `impact_level`**. Vista delta por bump, más los snapshots antes/después. **Se dibuja acá con `three.js`**, no por iframe a un host externo — ver [stack.md](stack.md) — y el `.cc.json` queda descargable para quien prefiera el visor oficial |

**`complexity_proxy` es la altura, y no es complejidad.** Se hereda de KMP-IMPACT, donde se llama
`mcc` y se documenta como «heurística tipo McCabe», pero el cálculo real es
`1 + <nº de palabras clave de rama halladas por regex>`: no recorre el grafo de flujo, no distingue
ramas alcanzables, no entiende un `when` exhaustivo. Se renombra a lo que es, la fórmula viaja a su
lado, y **es canal visual y nada más**: nunca en una tabla, nunca en una métrica, nunca en una cifra
del reporte. Como canal solo necesita ser monótono y estable —un archivo con más ramas se ve más
alto—, no correcto. Publicarlo como «complejidad» sería el defecto A03 otra vez: dar por evidencia
algo que quien recibe el artefacto no puede comprobar.

**Una señal que no se pudo computar no se dibuja como cero.** El BFS de imports depende de un mapa
grupo-Maven → paquete-Kotlin que es **incompleto por construcción**; cuando un grupo no está
mapeado, el nodo muestra **«señal no disponible»**, no un `0`. Un cero dice «no impactado»; un «no
sé» dice otra cosa, y confundirlos es lo que esta vista tiene que impedir.

**Y esta vista NO pinta un ranking con pesos: no hay ninguno.** El árbol **ya viene ordenado** por
`distance` y `relation`, y ése es el ranking determinista entero
([ADR 0032](../../Kmp-Repair-Agents/docs/decisions/0032-the-impact-tree-is-the-deterministic-ranking.md)).
Lo que hay que ver acá es **qué hay en el árbol y a qué distancia**; quién lo purga es el paso 6.

*Probado:* se ve *por qué* un archivo está en el árbol y por qué está donde está — qué semilla lo
alcanzó, por qué arista y a qué distancia. Un árbol que recluta lo correcto por el camino equivocado
es indistinguible de uno bueno en una métrica agregada, y obvio en esta vista.

### Paso 6 — Localization Agent: el recorrido

Pipeline: el agente **purga el árbol** — recibe uno que ya viene ordenado y devuelve una lista más
corta, en bucle con herramientas y leyendo código. **Solo en el modo 4**: los modos 2 y 3 reciben el
árbol y van directo a §6.

**Vista Recorrido**, y la clave es que se dibuja **sobre el árbol completo del paso 5**: qué nodos
abrió y en qué orden, cuáles quedaron sin abrir, y hasta qué `distance` bajó. Doce de trescientos
cuarenta se ve de un vistazo; una tabla de doce filas no.

Al lado, los números del recorrido y la lista rankeada con su justificación por archivo. Tres cosas
que la vista **tiene** que distinguir:

- **`truncated`** — se acabó la **ventana de contexto** (no hay tope de lecturas nuestro). Terminar porque quiso no puede verse igual
  que quedarse sin presupuesto, misma regla que `⊘` y que `downgrade_check: SKIPPED`.
- **`off_tree`** — el agente propuso un archivo que **no recorrió**. Se acepta si la ruta existe en
  el repositorio; solo se rechaza la inventada. Es una afirmación más débil que una propuesta leída,
  y se marca como tal — pero si acierta, es el hallazgo más interesante de la corrida.
- **`seen_not_listed`** —leyó el archivo correcto y no lo listó— **no viene en el dump**. Lo deriva
  el evaluador cruzando `files_read[]` con el ground truth, porque calcularlo dentro del pipeline
  sería abrir la bóveda en corrida. La app lo muestra si el evaluador se lo pasa; nunca lo calcula
  ella, igual que no recalcula ninguna otra regla.

Y **la longitud de la lista al lado de los `Hit@k`**: con lista variable el modelo controla el
denominador, y sin ese número «devolvé muchos» sería una estrategia ganadora
([ADR 0021](../../Kmp-Repair-Agents/docs/decisions/0021-localization-is-measured-in-three-moments.md)).

*Probado:* que el aporte es lo que decimos que es. El árbol del paso 5 es determinista y está a la
vista; lo que esta pantalla muestra es **qué hizo el agente con él**. Si el recorrido resulta ser
«abrió los dos primeros nodos y devolvió eso», se ve — y es un resultado, no un éxito escondido
detrás de un `Hit@1`.

### Paso 7 — reparación: intentos de patch

Pipeline: extracción determinista de versión **como evidencia en el prompt** + Repair Agent, que
entra siempre. **Sin bifurcación de ruta**: el patch cubre toda la lista de §5, mezclada o no
([ADR 0022](../../Kmp-Repair-Agents/docs/decisions/0022-the-list-decides-the-route.md)).

**Vista Intentos.** Uno por intento, en orden: la etiqueta de qué tocó —`build-only` /
`source-only` / `mixed`, **descriptiva y no una decisión**—, el **diff unificado** del patch
(`DiffView` del Mining, con colapso para parches grandes),
y el contador de llamadas a LLM, con los reintentos de formato contabilizados **aparte** del budget
experimental. **El veredicto de si aplicó no es de este paso**: aplicar dejó de ser una etapa y es
la compuerta de entrada del paso 8
([ADR 0024](../../Kmp-Repair-Agents/docs/decisions/0024-applying-is-not-a-stage-testing-is.md)).

**La comparación que esta vista existe para hacer posible: la lista que dio §5 al lado de los
archivos que §6 tocó de verdad.** Un archivo listado y no tocado se pinta **como tal, no como un
hueco** — es el momento 3 de la medición
([ADR 0021](../../Kmp-Repair-Agents/docs/decisions/0021-localization-is-measured-in-three-moments.md)),
y sin las dos columnas juntas no se ve nada de eso.

*Probado:* que **la versión extraída del error llega al prompt del agente**, visible en la vista.
El agente entra siempre ([ADR 0023](../../Kmp-Repair-Agents/docs/decisions/0023-the-agent-always-runs.md)):
que el error nombre una versión no implica que ahí termine el impacto, y acá el modelo se usa como
experto en parches, no como sustituidor de texto.

**Ojo con el contador de llamadas: el piso son tres por caso** —§5, §6, §8—, y el panel no debe
esperar ceros en ninguna. Un caso con cero llamadas en cualquiera de las tres es un bug, no una
optimización.

### Paso 8 — probar: aplicar y validar

Pipeline: **compuerta de aplicación** (paths, hash, hunk, todo-o-nada) y luego la prueba de verdad
— re-corrida sobre workspace fresco, DroidBot como tercera columna, split remanente/nuevo, outcome
repo-level.

**Vista Compuerta**, antes de la matriz: aplicó limpio o no, y por qué. Tres motivos con tres
significados distintos que la vista **tiene** que separar: un path fuera del workspace es un
**evento de seguridad**; un hash o un hunk que no casa es un **reintento**; y el downgrade **no
rechaza nada** — se muestra como dato, con sus dos valores `OK` y `SKIPPED`, y quien lo explica es
el paso 9 ([ADR 0024](../../Kmp-Repair-Agents/docs/decisions/0024-applying-is-not-a-stage-testing-is.md)).
Lo mismo el tamaño del patch: se marca, no bloquea.

**Matriz de validación**: la misma rejilla, ahora con **tres columnas** — base / updated /
post-patch. Debajo, cada `FailureObservation` clasificada como **resuelta / remanente / nueva
(regresión)**, y el outcome repo-level derivado con su regla a la vista (`FULL_FIX` solo si *todos*
los targets ejecutables pasan; `environment_unavailable` no cuenta ni a favor ni en contra).

**Y las tres salidas se distinguen en pantalla**, porque cada una manda una pregunta distinta al
paso 9: todo verde · rojo con el **mismo** error · rojo con un error **nuevo**. La tercera es una
regresión y no puede verse como «medio arreglo».

*Probado:* `regression_case` sale `REGRESSED` y se ve el error nuevo que lo causó, no un verde
promediado. `ios_linkage_case` muestra compile verde y link rojo en el **mismo target** — la razón
por la que CTSR y BSR no son la misma métrica.

### Paso 9 — explicación

Pipeline: renderer puro + Explanation Agent, que entra siempre.

**Vista Explicación**: el artefacto renderizado (Markdown al lado del JSON), con los **cuatro
campos de la auditoría del paper separados y etiquetados** — identifica la entidad reparada,
conecta el patch con la evidencia, reporta validación por target, declara incertidumbre — para que
se puedan marcar sin leer prosa buscándolos (auditoría interna, la hacen los autores; sin
revisores externos ni participantes — ver
[evaluation-protocol.md](../../Kmp-Repair-Agents/docs/evaluation-protocol.md)). Exporta el CSV de auditoría
(`case_id` + 4 columnas sí/no).

**Llegan más casos de los que parece.** No solo los reparados: `NOT_REPRODUCED`, `NO_REPAIR_NEEDED`
y `NO_SAFE_PATCH` también traen artefacto, así que la vista tiene que saber dibujar una explicación
**sin patch** ([ADR 0025](../../Kmp-Repair-Agents/docs/decisions/0025-how-a-case-ends.md)). Un
`UNAVAILABLE` permanente no trae ninguna y eso es correcto, no un hueco.

**Los cuatro criterios se auditan sobre el artefacto, no sobre la prosa.** Si la narrativa está
marcada como ausente, el caso se pinta **no auditable** y sale del denominador — nunca como cuatro
noes.

**Si la prosa no vino del agente, la vista lo dice y no la disfraza.** El agente se llama siempre
([ADR 0023](../../Kmp-Repair-Agents/docs/decisions/0023-the-agent-always-runs.md)); si falló, el
artefacto existe igual con los hechos duros y la narrativa **marcada como ausente**. Una plantilla
interpolada presentada como si fuera la explicación del agente haría incomparable la auditoría de
desarrollador: los cuatro criterios se evaluarían sobre textos de naturaleza distinta.

*Probado:* que el agente **no puede alterar un resultado de validación**. La vista pone la prosa al
lado de los hechos duros que la originaron; una explicación que afirme algo que la matriz de al
lado contradice se ve inmediatamente.

### Paso 9b — el lazo: un caso vuelta a vuelta

Pipeline: §7 decide si hay otra vuelta y le pasa `is_final` a §8; cada vuelta es una fila de
`attempt` con su patch, su matriz y su prosa
([ADR 0029](../../Kmp-Repair-Agents/docs/decisions/0029-the-loop-and-what-travels-back.md)).

**Vista Vueltas.** Las hasta tres, en orden, con lo que cambió entre ellas: el diff, la matriz
target × outcome, y la prosa. Dos cosas que la vista **tiene** que hacer visibles:

- **Cuál es la final.** Es la marcada `is_final`, y es la única que puntúa la auditoría de
  desarrollador. Las intermedias son insumo del lazo; pintarlas al mismo nivel haría creer que el
  caso produjo tres informes.
- **Qué viajó de vuelta.** En los modos 3 y 4, el prompt de la vuelta *k+1* contiene el error nuevo
  de §7 **y la prosa entera de §8** de la vuelta *k*. Ponerlos al lado es lo que permite ver si la
  realimentación sirvió de algo.

*Probado:* que el lazo existe y que su carga es la que decimos. Si la vuelta 2 usa exactamente el
mismo prompt que la 1, se ve — y entonces el modo 3 no es lo que su nombre dice.

### Paso 9c — los cuatro modos, lado a lado

Pipeline: la proyección del bundle por modo, `run` como tabla, aislamiento entre modos y
`ReplayProvider` ([ADR 0028](../../Kmp-Repair-Agents/docs/decisions/0028-four-modes-and-on-demand-exploration.md),
[ADR 0032](../../Kmp-Repair-Agents/docs/decisions/0032-the-impact-tree-is-the-deterministic-ranking.md),
[ADR 0033](../../Kmp-Repair-Agents/docs/decisions/0033-modes-are-isolated-and-runs-replay-without-models.md)).

**Vista Comparar modos.** El mismo caso en cuatro columnas, y arriba de todo **lo que comparten**:
§1-§4, idénticas por construcción. Debajo, por modo: qué recibió, qué leyó, qué tocó, cómo terminó.

- **`localization` vacía en los modos 1-3 se pinta «este modo no tiene esa etapa»**, nunca «falta un
  dato». El `mode` de la fila lo dice.
- **El modo 1 no tiene árbol de impacto y eso se ve**, porque es lo que lo define: es el baseline
  sin contexto localizado.
- **Nada de un modo aparece dentro de otro.** Si la vista los mezcla, invita a leer una fuga que el
  pipeline prohíbe.

*Probado:* la garantía central del diseño — que los cuatro partieron de la misma evidencia. En
cuatro columnas con la cabecera compartida, una diferencia arriba es un bug visible de inmediato.

### Paso 10 — evaluación: la rejilla modo × vuelta

Pipeline: los **cuatro modos** —`raw_error`, `context_rich`, `iterative_agentic`,
`full_pipeline`— y las métricas. `EvidenceProfile × AttemptPolicy` ya no existe: **el modo es el
eje** ([ADR 0028](../../Kmp-Repair-Agents/docs/decisions/0028-four-modes-and-on-demand-exploration.md)),
y `BOT_ONLY` no es un baseline sino el corpus.

**Vista Evaluación**: la rejilla **modo × vuelta** por métrica —cuatro modos, hasta tres vueltas—,
no un heatmap de dos ejes de configuración. Lo que hay que poder leer de un vistazo son dos cosas
([ADR 0031](../../Kmp-Repair-Agents/docs/decisions/0031-hit-at-three-levels-and-per-turn.md)):
**la columna de la vuelta 1**, donde los cuatro modos son comparables sin salvedad porque ninguno ha
usado realimentación, y **la pendiente de cada fila**, que es el valor del lazo medido contra el
mismo modo. Reglas duras heredadas del protocolo:

- Una métrica `None` se pinta **`None`, nunca 0** — un caso sin ground truth no es un caso con
  Hit@k cero. Y hay un `None` **estructural** que la app va a ver todo el tiempo: las métricas de
  localización llegan vacías hasta que el evaluador corre, porque exigen la bóveda. Las de
  reparación —`BSR`/`CTSR`/`FFSR`/`EFR`— vienen en el dump desde la corrida
  ([ADR 0025](../../Kmp-Repair-Agents/docs/decisions/0025-how-a-case-ends.md)).
- `NO_REPAIR_NEEDED` se reporta como tasa aparte, fuera del promedio de BSR/CTSR/FFSR/EFR. Y
  `NOT_REPRODUCED` como **otra** tasa aparte, nunca sumada a la anterior: una dice «no había nada
  que reparar», la otra «no reprodujimos el fallo». Sobre el corpus solo la segunda es posible.
- La abstención (`NO_SAFE_PATCH`) se reporta solo sobre los casos que tenían algo que reparar.
- **Localización: los tres momentos van siempre juntos, nunca uno solo.** Reclutamiento
  (`Recall@tree`), selección (`Hit@1/3/5`, `MRR`, source-set) y acción (qué tocó de verdad).
  Publicar el segundo sin el primero le atribuye al agente un fallo del análisis
  ([ADR 0021](../../Kmp-Repair-Agents/docs/decisions/0021-localization-is-measured-in-three-moments.md)).
- **Y dos números que van pegados a esos, o el panel miente**: la **longitud media de la lista**
  —con lista variable el modelo controla el denominador, y «devolvé muchos» sería una estrategia
  ganadora— y el **tamaño del árbol** —si el árbol es casi todo el repo, `Recall@tree` da ≈ 1 y no
  diagnostica nada—.
- Los casos cuyo ground truth no es código localizable —21 de 94 traen archivos no-código y 4 lo
  tienen puro— salen del denominador del momento 1 y se muestran como **categoría aparte**, igual
  que los targets `⊘`.
- El CSV por-caso completo siempre descargable: el agregado es el titular, el detalle es el
  apéndice, y de la pantalla se debe poder bajar a un caso concreto.

*Probado:* que el agregado no esté escondiendo su composición. De cada celda del heatmap se llega a
los casos que la forman.

### Paso 11 — el corpus real: índice de los 94

Pipeline: `SqliteCaseCatalogSource` sobre `model_input_v1.db` + corrida completa. **No el corpus
completo**: la reparación humana vive en una bóveda aparte que solo abre el evaluador, después de
congelar la salida (A07, ver [ethics.md](../../Kmp-Repair-Agents/docs/ethics.md) §2).

**Índice filtrable** de los 94 casos con su **estado de reparación** — que es literalmente el hueco
que el front del Mining declaró fuera de alcance ("es el otro repo, y ese dato no existe todavía").
Filtros multi-select con conteo, mismo patrón: repo, familia rota, target roto, `update_kind`, JDK,
y los nuevos — estado final del caso, outcome de validación y **licencia SPDX**, que el
[ADR 0009](../../Kmp-Repair-Agents/docs/decisions/0009-generated-patches-carry-their-source-licence.md)
exige como vista de primera clase y no como `grep` (20 de los 94 son copyleft: **11
`GPL-3.0-only` y 9 `GPL-3.0-or-later`**, que no son lo mismo y conceden derechos distintos a quien
reciba el parche). Filtros en la URL, para compartir un subconjunto por enlace.

**Tres cosas que esta página debe traer desde el primer despliegue**, porque son obligaciones del
Gate DOI y no adornos —el visor del minado las aprendió tarde y una de ellas le costó purgar el
historial público:

- **La advertencia experimental en la raíz *y* repetida por caso** (A18). Atrapan lectores
  distintos: quien llega por enlace directo a un caso nunca pasa por la raíz. La app **renderiza**
  el texto que trae el dump, no lo reescribe — existían tres redacciones que no se importaban entre
  sí en el minado, y esa es la forma exacta en que una afirmación corregida sobrevive. **Y es la
  advertencia del parche generado, no la del corpus**: son dos sujetos distintos y el minado los
  separa a propósito (A30). Ver [data-contract.md](data-contract.md).
- **La licencia servida por el propio sitio, sin red** (A04/A17): `licence.local_text` por caso, con
  su hash, y el enlace a GitHub como secundario. Un archivo de licencia ausente se nota; uno
  desactualizado no.
- **Nombrar la licencia es atribución, no permiso** (A17). El visor del minado publicó que nombrarla
  «nos da derecho a mostrar» el fragmento: es una aserción jurídica, es falsa, y estaba encima de
  código de terceros en una página pública. El fundamento es cumplir cada licencia, por elemento.

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
/#/                      índice de casos (paso 11; antes, la lista de lo que haya)
/#/case/:owner/:name/:base..:head   ficha: §1-§4 + las 4 corridas
/#/case/.../:mode                    una corrida
/#/case/.../:mode/:turn              una vuelta
     `#pr` se acepta como alias y redirige: model_input NO trae pr_number,
     así que los 94 casos son inalcanzables por la forma vieja
/#/domain                 máquina de estados y taxonomía (paso 1)
/#/eval                   rejilla modo × vuelta, métricas (paso 10)
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
