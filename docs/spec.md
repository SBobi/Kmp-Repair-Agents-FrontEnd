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
como el dominio las declara, con los caminos de escape marcados (`NO_REPAIR_NEEDED` y
`NOT_REPRODUCED`, que se ven distintos porque significan lo contrario,
`NO_SAFE_PATCH → EXPLAINED`, y `UNAVAILABLE`, alcanzable desde cualquier nodo, con la arista de
vuelta dibujada solo para los `reason` transitorios). Al lado, la tabla de taxonomía con sus 5
clases y un ejemplo de diff por clase.

*Probado:* que la máquina de estados **es la que se cree que es**. Un estado sin salida, una
transición que se agregó sin declarar, o el `fallback` de taxonomía ausente se ven en un vistazo —
cosas que un test unitario también atrapa, pero solo si alguien pensó en escribirlo.

### Paso 2 — slice vertical con fakes: primera ficha de caso

Pipeline: etapas Update + Execution sobre `worked_case` y `no_failure_case`, con `ScriptedRunner`.
Primer `kmp-repair dump` real.

**Ficha de caso**, la vista central, nueve secciones en el orden del Case Bundle. Las secciones que
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

**Vista Evidencia dinámica** (solo cuando el caso la tiene; `null` fuera de Android). El diff de
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
mapeado, la fila muestra **«señal no disponible»**, no un `0`. Un peso en cero mueve el ranking; un
«no sé» no.

*Probado:* se ve *por qué* un archivo quedó primero. Un ranking que sale bien por la señal
equivocada es indistinguible de uno correcto en una métrica agregada, y obvio en esta vista.

### Paso 6 — Localization Agent: el recorrido

Pipeline: el agente recorre el árbol en **bucle con herramientas**, leyendo código, y devuelve una
lista rankeada de longitud que él elige.

**Vista Recorrido**, y la clave es que se dibuja **sobre el árbol completo del paso 5**: qué nodos
abrió y en qué orden, cuáles quedaron sin abrir, y hasta qué `distance` bajó. Doce de trescientos
cuarenta se ve de un vistazo; una tabla de doce filas no.

Al lado, los números del recorrido y la lista rankeada con su justificación por archivo. Tres cosas
que la vista **tiene** que distinguir:

- **`truncated`** — el presupuesto de lecturas lo cortó. Terminar porque quiso no puede verse igual
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

Pipeline: extracción determinista de versión antes que el agente + Repair Agent + aplicador
atómico. **Sin bifurcación de ruta**: el patch cubre toda la lista de §5, mezclada o no
([ADR 0022](../../Kmp-Repair-Agents/docs/decisions/0022-the-list-decides-the-route.md)).

**Vista Intentos.** Uno por intento, en orden: la etiqueta de qué tocó —`build-only` /
`source-only` / `mixed`, **descriptiva y no una decisión**—, el **diff unificado** del patch
(`DiffView` del Mining, con colapso para parches grandes),
aceptado o rechazado **con el motivo del aplicador** (path fuera del workspace, hash de snapshot
viejo, contexto de hunk que no casa, límite de tamaño, downgrade). Y el contador de llamadas a LLM,
con los reintentos de formato contabilizados **aparte** del budget experimental.

**La comparación que esta vista existe para hacer posible: la lista que dio §5 al lado de los
archivos que §6 tocó de verdad.** Un archivo listado y no tocado se pinta **como tal, no como un
hueco** — es el momento 3 de la medición
([ADR 0021](../../Kmp-Repair-Agents/docs/decisions/0021-localization-is-measured-in-three-moments.md)),
y sin las dos columnas juntas no se ve nada de eso.

La comprobación de downgrade tiene **tres** salidas y la vista las distingue: rechazado, OK, y
`SKIPPED` con su motivo cuando no era comparable (un `reference-update` mueve shas, que no se
ordenan). **`SKIPPED` no se dibuja como OK** — misma regla que `None` ≠ 0. Sobre el corpus el
rechazo no dispara nunca (0 de 117 bumps), así que si aparece uno, es para mirarlo.

*Probado:* que **la versión extraída del error llega al prompt del agente**, visible en la vista.
El agente entra siempre ([ADR 0023](../../Kmp-Repair-Agents/docs/decisions/0023-the-agent-always-runs.md)):
que el error nombre una versión no implica que ahí termine el impacto, y acá el modelo se usa como
experto en parches, no como sustituidor de texto.

**Ojo con el contador de llamadas: el piso son tres por caso** —§5, §6, §9—, y el panel no debe
esperar ceros en ninguna. Un caso con cero llamadas en cualquiera de las tres es un bug, no una
optimización.

### Paso 8 — validación multi-target

Pipeline: re-corrida sobre workspace fresco con el patch re-aplicado, split remanente/nuevo,
outcome repo-level.

**Matriz de validación**: la misma rejilla, ahora con **tres columnas** — base / updated /
post-patch. Debajo, cada `FailureObservation` clasificada como **resuelta / remanente / nueva
(regresión)**, y el outcome repo-level derivado con su regla a la vista (`FULL_FIX` solo si *todos*
los targets ejecutables pasan; `environment_unavailable` no cuenta ni a favor ni en contra).

*Probado:* `regression_case` sale `REGRESSED` y se ve el error nuevo que lo causó, no un verde
promediado. `ios_linkage_case` muestra compile verde y link rojo en el **mismo target** — la razón
por la que CTSR y BSR no son la misma métrica.

### Paso 9 — explicación

Pipeline: renderer puro + Explanation Agent con fallback a plantilla.

**Vista Explicación**: el artefacto renderizado (Markdown al lado del JSON), con los **cuatro
campos de la auditoría del paper separados y etiquetados** — identifica la entidad reparada,
conecta el patch con la evidencia, reporta validación por target, declara incertidumbre — para que
se puedan marcar sin leer prosa buscándolos (auditoría interna, la hacen los autores; sin
revisores externos ni participantes — ver
[evaluation-protocol.md](../../Kmp-Repair-Agents/docs/evaluation-protocol.md)). Exporta el CSV de auditoría
(`case_id` + 4 columnas sí/no).

**Si la prosa no vino del agente, la vista lo dice y no la disfraza.** El agente se llama siempre
([ADR 0023](../../Kmp-Repair-Agents/docs/decisions/0023-the-agent-always-runs.md)); si falló, el
artefacto existe igual con los hechos duros y la narrativa **marcada como ausente**. Una plantilla
interpolada presentada como si fuera la explicación del agente haría incomparable la auditoría de
desarrollador: los cuatro criterios se evaluarían sobre textos de naturaleza distinta.

*Probado:* que el agente **no puede alterar un resultado de validación**. La vista pone la prosa al
lado de los hechos duros que la originaron; una explicación que afirme algo que la matriz de al
lado contradice se ve inmediatamente.

### Paso 10 — evaluación: el grid

Pipeline: `EvidenceProfile × AttemptPolicy`, los 5 baselines, las métricas.

**Vista Evaluación**: heatmap del grid (4 perfiles × 3 políticas) por métrica, y la comparación de
baselines. Reglas duras heredadas del protocolo:

- Una métrica `None` se pinta **`None`, nunca 0** — un caso sin ground truth no es un caso con
  Hit@k cero.
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
/#/case/:owner/:name/:pr  ficha: las 9 secciones del Case Bundle
/#/domain                 máquina de estados y taxonomía (paso 1)
/#/eval                   grid, baselines, métricas (paso 10)
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
