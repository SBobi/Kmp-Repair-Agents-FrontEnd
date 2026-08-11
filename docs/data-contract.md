# Contrato de datos — el dump del Case Bundle

Un archivo JSON, generado en otro repositorio, que esta app importa y muestra. **No se edita a mano
y no se produce aquí.**

```bash
# en ../Kmp-Repair-Agents
kmp-repair dump <case-key> > ../Kmp-Repair-Agents-FrontEnd/data/bundle.json
kmp-repair dump --all    > ../Kmp-Repair-Agents-FrontEnd/data/bundles.json   # desde el paso 11
```

Todo lo que decide **qué contiene** un Case Bundle vive en el repo del pipeline:
[stages.md](../../Kmp-Repair-Agents/docs/stages.md) (qué guarda cada sección y qué la produce) y
[schema.md](../../Kmp-Repair-Agents/docs/schema.md) (el modelo persistido). Este documento describe
únicamente **la forma del archivo y lo que la app puede hacer con él** — la lectura de un consumidor
sobre un contrato que no le pertenece.

Es el mismo reparto que en el minado: el visor de allá documenta la forma del manifest, y las
reglas que lo llenan viven en `Kmp-Repair-Mining`
([ADR 0010](../../../MINING/Kmp-Repair-Mining/docs/decisions/0010-second-review-belongs-to-the-corpus.md)).

## Regla de crecimiento

El dump **crece con el roadmap y nunca rompe hacia atrás**. Cada paso del pipeline puede añadir
campos; ninguno cambia el significado de uno existente ni lo elimina. Consecuencia para la app: una
sección ausente siempre significa **"el caso no llegó hasta ahí"**, jamás "esta versión del dump no
la traía".

Por eso el bundle lleva `schema_version` y `pipeline_git_sha`: un dump viejo se detecta y se
rechaza en la frontera (`src/data.ts`), en vez de renderizarse mal en silencio.

**Y el dump es una vista aplanada, no la forma en que el pipeline guarda.** Allá son **siete tablas**
en jerarquía —`case` con §1-§4 compartidas, `run` por modo con §5, `attempt` por vuelta con §6-§8,
`probe` por target y revisión, `project_model` por `repo@sha`, y un CAS por hash para logs, UTGs,
prompts y respuestas
([ADR 0030](../../Kmp-Repair-Agents/docs/decisions/0030-six-tables-case-run-attempt.md))—.
Tres consecuencias para la app: **la matriz de tres columnas llega ya armada** —allá es un `GROUP BY`
sobre `probe`, acá es un campo—, **lo pesado llega como hash, no como contenido** —si una vista
necesita el log crudo, lo pide por su hash—, y **un caso ya no es un documento sino cuatro corridas
con sus vueltas**: el dump se pide por caso, por caso+modo, o por caso+modo+vuelta.

## Estructura

```
{ schema_version, generated_at, pipeline_git_sha,
  case_key, resolved_key, case_id, stage_state, blocked,   ← del CASO
  update, execution, dynamic, structural,     ← COMPARTIDAS por los cuatro modos

  runs: [ { mode, state, blocked, localization,            ← UNA POR MODO
            workspace_sha, tree_degraded_to_direct,
            identical_resample_rate, metrics,
            attempts: [ { turn, state, is_final,
                          synthesis, validation, explanation } ],
            agent_calls: [ { turn, stage, ... } ] } ],   ← turn en CADA llamada

  catalog_origin, licence, warning }
```

**`agent_calls` es plano dentro de la corrida y cada llamada lleva su `turn`** (`null` en las de
§5, que corre una vez). La tabla tiene la vuelta en la llave; si el dump la aplana y la pierde, **la
curva de coste por vuelta no se puede dibujar** — y esa curva es una de las dos lecturas que la
vista de evaluación existe para hacer obvias.

**`runs` es un array y eso no es un detalle**: un caso son **hasta cuatro corridas**, y el `dump`
las trae todas. `mode = null` en una corrida única significa que el caso salió en §2 o §3 y ningún
modo lo intentó — **no** cuatro corridas vacías.

**Tres granularidades**, filtrando ese array: `dump <case>` trae todo; `dump <case> --mode <m>` deja
una corrida; `dump <case> --mode <m> --turn <n>` deja una vuelta. Los flags están declarados en la
superficie CLI del pipeline ([architecture.md](../../Kmp-Repair-Agents/docs/architecture.md)), no
solo acá — un contrato con un solo firmante no es un contrato. Las cuatro secciones de arriba son
**idénticas en las cuatro corridas** por construcción, y ésa es la garantía de que una diferencia
entre modos es del modo — por eso viven **fuera** del array y no dentro de cada corrida.

Las ocho del medio siguen siendo **las ocho secciones del Case Bundle y ninguna más**, una por etapa
del pipeline — [ADR 0017](../../Kmp-Repair-Agents/docs/decisions/0017-case-bundle-nine-sections.md), que
sustituye al [ADR 0002](../../Kmp-Repair-Agents/docs/decisions/0002-case-bundle-six-sections.md).

**Cambió respecto a la forma anterior, y hay que leerlo con cuidado:** las tres últimas secciones
**ya no están sueltas en la raíz**: viven dentro de `attempts[]`, una por vuelta del lazo, con
`is_final` marcando cuál explicación puntúa
([ADR 0029](../../Kmp-Repair-Agents/docs/decisions/0029-the-loop-and-what-travels-back.md),
[ADR 0030](../../Kmp-Repair-Agents/docs/decisions/0030-six-tables-case-run-attempt.md)). Y
`ui_evidence` **ya no cuelga de `execution`** — es la sección de primer nivel `dynamic`. Y `repair` **ya no existe**: se partió en
`localization` y `synthesis` —dónde y qué escribo—, mientras que **aplicar dejó de ser una sección**
y pasó a ser la compuerta de entrada de `validation`, que es la que **prueba**
([ADR 0024](../../Kmp-Repair-Agents/docs/decisions/0024-applying-is-not-a-stage-testing-is.md)).
Una sección existe porque guarda evidencia, y «el diff aplicó limpio» no dice nada sobre la
reparación.

**Este boceto es la lista de filas de la tabla de abajo, no una redacción paralela.** Se escribió
una vez con doce campos y quedó atrás en cuanto la tabla creció debajo — la forma exacta del defecto
A01. Si se añade una fila, se añade acá.

Las ocho secciones centrales son, una a una, las
[8 etapas del Case Bundle](../../Kmp-Repair-Agents/docs/stages.md).

| campo | presente desde | notas |
|---|---|---|
| `schema_version`, `generated_at`, `pipeline_git_sha` | paso 2 | procedencia; el sha permite trazar cualquier pantalla a una versión exacta del pipeline |
| `case_key`, `resolved_key` | paso 2 | la llave tal como se pidió (`owner/name#pr` o `owner/name@base..head`) y la **resuelta**, siempre en forma `@base..head`. Las dos tienen que sobrevivir a una URL. Cuando difieren, la vista muestra a qué revisiones resolvió: un `#pr` no fija contenido y un PR reescrito resuelve distinto |
| `stage_state` | paso 2 | `CaseState` — de §1-§4, y **termina en `MODELED`**. Es lo que explica cada sección compartida ausente. Valores y flechas entre niveles: [schema.md](../../Kmp-Repair-Agents/docs/schema.md) § «Las tres máquinas de estados» |
| `runs[].state` | paso 9c | `RunState` — **por modo**. Un caso puede estar `EVALUATED` en el modo 1 y todavía en su segunda vuelta en el 4. **`EVALUATED` es terminal de la CORRIDA, no del caso**: un caso tiene hasta cuatro, y «casos terminados» es un `GROUP BY`, no un campo. Un panel que cuente `EVALUATED` como éxitos está contando corridas completas — el resultado es otro eje, igual que `VALIDATED` no dice `FULL_FIX` ([ADR 0025](../../Kmp-Repair-Agents/docs/decisions/0025-how-a-case-ends.md)) |
| `runs[].attempts[].state` | paso 9b | `AttemptState` — **por vuelta, y aquí vive el lazo**. Las otras dos máquinas son acíclicas; ésta no |
| `blocked` | paso 2 | `null` salvo que el estado sea `UNAVAILABLE` — **hay dos `blocked`**: el del caso (§1-§4) y el de la corrida (§5-§8), porque un proveedor caído deja indisponible **ese modo**, no el caso;; entonces `stage`, `reason`, `permanent` y el `message` **crudo**. Un caso que no se pudo traer o ejecutar no es un fallo de reparación: se dibuja como indisponible, jamás como rojo. `permanent: false` se muestra como recuperable, no como resultado ([ADR 0012](../../Kmp-Repair-Agents/docs/decisions/0012-unavailable-is-one-state.md)) |
| `update` | paso 2 | `bumps[]` — cada uno con `label`, `from`, `to`, archivo y `update_kind` (5 valores: `direct`, `plugin-toolchain`, `platform-integration`, `reference-update`, `fallback`) — más `base_sha`/`head_sha` y el diff del bot. **Es una lista incluso cuando trae un solo elemento**, y **10 de los 94** casos traen entre 2 y 4 (3 con dos, 5 con tres, 2 con cuatro). `from`/`to` son **strings opacos**: `"8.1.2"` en un bump de versión, `"f30c8b7"` en uno de referencia — no se ordenan ni se parsean como semver en la vista. Una lista **vacía** significa que el diff no tocó ningún archivo de build reconocible, no "no hubo cambio de versión", y **no es hipotética: son 4 de los 94** —`Oztechan/CCC#2807` y `#4332`, `meshtastic/Meshtastic-Android#5212` y `#5676`, los cuatro `reference-update`—, así que una vista probada solo con listas no vacías se rompe en el 4 % del corpus. El bump primario es nullable y lo llena un paso posterior, nunca la ingesta. Cifras medidas sobre `paper_corpus_v1.db` el 2026-08-06 |
| `execution` | paso 2 | probes por target y stage **con su nivel** (`configuration`, `compile`, `compile-test`, `link`, `test-run`), `FailureObservation[]` con rol causal, **texto de error real**, targets no ejecutables declarados, hash del log crudo en el `ArtifactStore`, y la comparación contra los probes del catálogo |
| `dynamic` | paso 4 | `null` fuera de Android. Si no: **`status` es por revisión, no por caso** (`completed`/`blocked`/`skipped`) con su `blocked_reason` — en los 37 de `configuration` la base sale `completed` con su piso medido y solo `updated` sale `blocked`, así que la vista tiene que poder pintar una columna explorada y otra bloqueada en el mismo caso. Más el **piso de ruido** medido explorando la base dos veces, los diffs por pantalla y la cobertura por activity. **Columna aparte: no entra en ningún outcome ni en BSR/CTSR/FFSR** ([ADR 0015](../../Kmp-Repair-Agents/docs/decisions/0015-dynamic-ui-evidence-with-a-noise-floor.md)). **Pero sí viaja al modelo desde el [ADR 0027](../../Kmp-Repair-Agents/docs/decisions/0027-dynamic-evidence-travels-as-text.md), y solo en texto** —el error de ejecución y el diff por encima del piso—; las capturas y el UTG **no salen del CAS**, así que la vista los pide por hash y nunca los presenta como «lo que vio el modelo» |
| `structural` | paso 5 | **`impact_tree[]`** es lo que de verdad importa acá: por nodo `relation` (`DIRECT`/`TRANSITIVE`/`EXPECT_ACTUAL`), `distance`, `propagated_from[]`, `imports_from_dependency[]`, más `seeds[]` con su procedencia (importadores de la dependencia · entidades del error de §2). Es **determinista y está entero**, así que la vista lo dibuja completo y encima se pinta el recorrido del paso 6. | **por archivo**: `impact_level` (0 no impactado / 1 transitivo / 2 directo), `propagated_from` (de qué archivo entró un transitivo), `rloc` (líneas reales) y `complexity_proxy`. Son los cuatro campos que alimentan sunburst, árbol de propagación y CodeCharta — **el `.cc.json` lo deriva el visor de aquí**, el pipeline no lo emite aparte: dos artefactos sobre el mismo caso pueden discrepar, y el que se mira sería el que nadie verifica. Más el modelo, en **dos mitades** ([ADR 0018](../../Kmp-Repair-Agents/docs/decisions/0018-build-files-are-nodes-in-the-structural-model.md)). *Código*: source-sets con `depends_on`/`targets`/`kind`, targets con su plataforma, links expect/actual, **`orphan_actuals[]`** (un `actual` sin su `expect` — suele significar que la actualización eliminó la declaración compartida). *Build*: **`build_nodes[]`** con `path`, `kind` (`version-catalog`/`module-script`/`properties`/`settings`/`wrapper`), `scope` y `declares`, más **`alias_edges[]`** (alias del catálogo → módulo que lo usa), que es lo que permite dibujar el catálogo y los scripts colgando de los módulos que configuran. **Se construyen siempre**, también en casos sin fallo de configuración. Ojo con el wrapper: su `scope` es **`GLOBAL`** y la vista tiene que pintarlo así — colgarlo de un módulo sería una dirección falsa. Y transversal: `extraction_layers[]` (con qué capas se construyó: sin Gradle vale menos), `structural_evidence[]` con `provenance` y `confidence`, y `partial: bool`. **`null` en un caso de build verde**: §4 es perezosa, así que un hallazgo de UI puede venir sin modelo estructural — y entonces se muestra **sin atribución a código**, nunca inventada |
| `mode` | paso 9c | cuál de los cuatro produjo esta corrida: `raw_error`, `context_rich`, `iterative_agentic`, `full_pipeline`. **Es lo que explica una sección ausente**: `localization` en `null` con `mode` distinto de `full_pipeline` significa **«este modo no tiene esa etapa»**, no «falta un dato» ([ADR 0028](../../Kmp-Repair-Agents/docs/decisions/0028-four-modes-and-on-demand-exploration.md)) |
| `localization` | paso 6 | **Solo en el modo 4, y lo que hace es PURGAR** un árbol que ya viene ordenado por `distance` y `relation` ([ADR 0032](../../Kmp-Repair-Agents/docs/decisions/0032-the-impact-tree-is-the-deterministic-ranking.md)). `exploration` (`files_read[]`, `truncated`) llega en **los cuatro**; `tree_walk` (`nodes_offered`, `max_depth`, `off_tree_proposals`) en **los modos 2, 3 y 4** — el modo 1 no tiene árbol, y eso es lo que lo define. Sin tope de lecturas. **`ranked_files[]`** — la lista que devolvió el agente, con `rank`, justificación y la marca **`off_tree`** en las que propuso sin haber recorrido (se aceptan si la ruta existe; solo se rechaza la inventada). **La longitud la elige él y es en sí una métrica**, así que va a la vista junto a los `Hit@k`. Más **`walk`**: `max_depth` (medido, no impuesto), **`files_read[]` — las rutas, no el conteo**, `nodes_offered`, `truncated` (**se acabó la ventana de contexto** → se pinta distinto y no se promedia) y `off_tree_proposals`. **Todo son hechos: acá no viaja ninguna métrica.** Las tres exigen el ground truth, así que las deriva el evaluador y la app las recibe ya calculadas o no las recibe ([ADR 0021](../../Kmp-Repair-Agents/docs/decisions/0021-localization-is-measured-in-three-moments.md)). **No hay scorer ni desglose por señal** ([ADR 0019](../../Kmp-Repair-Agents/docs/decisions/0019-the-agent-localizes-over-a-deterministic-tree.md)) |
| `synthesis` | paso 7 | `attempts[]` con el **diff unificado** de cada intento —**uno solo sobre todos los archivos que el agente eligió tocar**— y los archivos efectivamente tocados. Ojo con dos cosas al dibujarlo: **un archivo que §5 listó y §6 no tocó NO es un error** —es lo que mide el momento 3—, y `touched_label` (`build-only`/`source-only`/`mixed`) es **descriptiva, no una decisión de ruta** ([ADR 0022](../../Kmp-Repair-Agents/docs/decisions/0022-the-list-decides-the-route.md)). Más `min_version_hint` y `list_capped`. **Sin veredicto**: si el patch entró o no lo dice `validation`, que es la que **prueba** — `application` no existe ([ADR 0024](../../Kmp-Repair-Agents/docs/decisions/0024-applying-is-not-a-stage-testing-is.md)). **Y hay una por vuelta, dentro de `attempts[]`**: la vista pinta la evolución, no el último |
| `validation` | paso 8 | **el resultado de PROBAR.** Primero la compuerta de entrada: aplicó limpio o no, y por qué (path fuera del workspace = rechazo duro; hash o hunk = reintento; todo-o-nada sobre el conjunto, **siempre**). Luego matriz target × outcome, split resuelto/remanente/nuevo, outcome repo-level y la tercera columna dinámica post-patch. Más `downgrade_check` con **dos** valores, `OK` y `SKIPPED`: **un downgrade no bloquea** — se detecta y lo explica la etapa siguiente, así que la vista lo muestra como dato, nunca como rechazo ([ADR 0024](../../Kmp-Repair-Agents/docs/decisions/0024-applying-is-not-a-stage-testing-is.md)). Y el tamaño del patch se **marca**, no rechaza |
| `explanation` | paso 9 | **una por vuelta, y solo la marcada `is_final` es «la» explicación** — las intermedias son insumo del lazo y pintarlas al mismo nivel haría creer que el caso produjo tres informes ([ADR 0029](../../Kmp-Repair-Agents/docs/decisions/0029-the-loop-and-what-travels-back.md)). Artefacto JSON + Markdown, los 4 campos de auditoría separados, y si la prosa vino del agente o llega **marcada como ausente** — en ese caso el artefacto es **no auditable**, no cuatro noes. **Presente también en casos sin patch**: `NOT_REPRODUCED`, `NO_REPAIR_NEEDED` y `NO_SAFE_PATCH` traen explicación ([ADR 0025](../../Kmp-Repair-Agents/docs/decisions/0025-how-a-case-ends.md)); un `UNAVAILABLE` permanente no, y eso es correcto |
| `agent_calls` | paso 6 | uno por llamada a LLM: backend, versión de prompt, parámetros de decoding, **hash** de prompt/respuesta, tokens, latencia. **Cuál vuelta lo produjo importa**: el techo son 21 llamadas por caso sumando los cuatro modos. Y en los modos 1 y 2 la temperatura tiene que ser **> 0** o las tres muestras son la misma respuesta |
| `catalog_origin` | paso 11 | `null` si el caso no vino del corpus; si vino: `corpus_version`, `case_id`, `ground_truth_files`, `environment_fingerprint`, `licence` y `base_commit_date`. **`ground_truth_files` solo aparece después de congelar la salida** — el dump es post-corrida, así que no rompe A07, pero el orden es parte del control ([evaluation-protocol.md](../../Kmp-Repair-Agents/docs/evaluation-protocol.md)) |
| `licence` | paso 11 | `spdx`, `resolved_at`, `url`, **`local_text` y `local_text_sha256`** — la misma forma que ya emite el manifiesto público del minado, hash incluido: un archivo de licencia ausente se nota y uno desactualizado no, así que el sitio compara los bytes que sirve contra los que el corpus auditó. El enlace no basta: es el defecto que el visor del minado tuvo durante meses y que A04/A17 corrigieron —un enlace no conserva copyright, condiciones ni descargos, y resuelve al repositorio de hoy, no al del `base_sha`—. El texto viaja con el sitio y el enlace queda como secundario. `spdx` es la expresión exacta: `GPL-3.0` a secas se rechaza (A05) |
| `warning` | paso 7 | el aviso experimental **del parche generado** —`GeneratedPatch.warning`, que empieza *«Generated automatically by a research experiment…»*—, **renderizado tal cual llega** y nunca reescrito por la app. **No es el aviso del corpus**: `notice.experimental_use_only` habla de las reparaciones humanas minadas, y son dos sujetos distintos que el minado mantiene separados a propósito (A18/A30). Más `experimental_only: true` y `maintainer_reviewed: false` legibles por máquina, para que un script que consuma el dump llegue a la misma conclusión que quien lee la página |

## Cuatro tipos de ausencia distintos

Distinguirlos es la única forma de que la UI no mienta:

- **Target nunca planificado**: el repo no declara ese target, así que no hay fila. **No se pinta
  `⊘`** — eso afirmaría «lo intentamos y la máquina no pudo», que es falso. Misma lección que el
  centinela `no-kmp-targets` del minado, un nivel más abajo.
- **Celda no alcanzada**: el target estaba planificado y una compuerta anterior falló. Es la
  columna `updated` entera de los **37 casos** cuyo build script no evalúa: la rejilla existe —sus
  filas salen de base, donde 35 de esos 37 tienen los cinco targets verdes— y ninguna celda de esa
  columna es `⊘` ni roja, porque nada llegó a compilarse. **Siguen siendo casos de pleno derecho**,
  y de hecho los que más peso tienen en la mitad **build** del árbol de impacto — no hay ruta que
  elegir, los archivos de build son nodos como cualquier otro ([ADR 0018](../../Kmp-Repair-Agents/docs/decisions/0018-build-files-are-nodes-in-the-structural-model.md), [ADR 0022](../../Kmp-Repair-Agents/docs/decisions/0022-the-list-decides-the-route.md)).
- **Sección no alcanzada** (`null` porque el estado no llegó): se dibuja el bloque con su razón
  a la vista. Un `NO_REPAIR_NEEDED` deja cuatro secciones así, y eso es un resultado correcto. Un
  `NOT_REPRODUCED` deja las mismas cuatro y **no** es un resultado del pipeline: es que no
  reprodujimos el fallo del catálogo, y la vista lo dice con esas palabras, junto a la comparación
  de probes que lo produjo ([ADR 0014](../../Kmp-Repair-Agents/docs/decisions/0014-not-reproduced-is-not-no-repair-needed.md)).
- **Target no ejecutable** (`environment_unavailable`): existe, se probó, la máquina no podía
  construirlo. **Nunca se pinta como fallo** y nunca entra en un denominador. Regla heredada tal
  cual del [front del Mining](../../../MINING/Kmp-Repair-Mining-FrontEnd/docs/data-contract.md).
- **Métrica no aplicable** (`None`): un caso sin `ground_truth_files` tiene `Hit@k = None`. **Se
  pinta `None`, nunca 0** — política del paper, no una excepción de esta app. Sobre
  `paper_corpus_v1` **no hay ningún caso así**: los 94 traen `ground_truth_files`. La vista tiene
  que soportar `None` igual, pero no hay que esperarlo en esta corrida — y un `Hit@k = 0` con
  ground truth presente **no** es este caso: significa que el ranking no lo alcanzó, como el fix
  por punteros de submódulo de `Oztechan/CCC#2960`.

## Lo que este dump NO tiene

Límites duros, no pendientes de UI:

1. **El texto de los prompts y las respuestas del LLM.** `agent_calls` guarda su *hash*, no su
   contenido — es lo que el paper exige para comparar backends, y mantiene el dump legible. Un
   prompt de 40 KB por llamada no cabe en un artefacto que se importa en build time.
   → Si hace falta depurar un agente, se recupera del `ArtifactStore` por hash, no de esta app.
2. **Los logs de build completos.** Van al `ArtifactStore` content-addressed; el dump trae las
   `FailureObservation` parseadas y un excerpt. La app muestra el error, no las 8.000 líneas de
   Gradle alrededor.
3. **El embudo del minado** (479 tier-1 → 443 probados → 132 gold → 94 congelados). Vive en
   `exploration.db`, que ni siquiera está versionado. No es de este repo.
4. **Los casos del corpus que no se corrieron.** `dump --all` trae lo que el pipeline procesó; la
   lista completa de los 94 está en `paper_corpus_v1.db`, y el hueco entre ambos —si lo hay— se ve
   como tal, no se rellena.

## Dos cosas que la UI no puede asumir

**Que el patch sea pequeño.** El corpus tiene un fix humano de 168 archivos
(`Oztechan/CCC#3523`, `mokoResources` regenerando un archivo por moneda). Un patch generado puede
ser igual de grande, o rechazado justamente por el límite de tamaño del aplicador. El `DiffView`
colapsa por parche, igual que en el Mining.

**Que haya un solo intento, ni una sola corrida.** Cada caso corre en **cuatro modos**
—`raw_error`, `context_rich`, `iterative_agentic`, `full_pipeline`— y cada modo da **hasta tres
vueltas** del lazo §6→§7→§8, con su patch, su validación y su prosa cada una
([ADR 0028](../../Kmp-Repair-Agents/docs/decisions/0028-four-modes-and-on-demand-exploration.md),
[ADR 0029](../../Kmp-Repair-Agents/docs/decisions/0029-the-loop-and-what-travels-back.md)). La vista
de intentos es una lista desde el primer día, y **la comparación entre modos es lo que hay que ver,
no un accesorio**: sobre 94 casos son hasta **376 corridas (94 × 4) y 1 128 intentos (94 × 4 × 3)**.
La aritmética va escrita a propósito: esta frase decía «hasta cinco vueltas» mientras cerraba con
1 128, que solo sale con tres. Un tope que no cuadra con su propio total es lo que hay que poder
ver sin abrir un ADR.

Cuatro reglas que salen de ahí:

- **`localization` ausente en los modos 1-3 significa «este modo no tiene esa etapa», no «falta un
  dato»** — el `mode` de la corrida lo dice, y la vista tiene que decirlo también. `exploration`
  **sí** llega en los cuatro; `tree_walk` en los modos 2, 3 y 4.
- **`identical_resample_rate` llega `null` en los modos 3 y 4, y también es por diseño**: su prompt
  cambia entre vueltas, así que la cifra sería cero por definición. Se pinta `null`, nunca `0`, o
  cuatro columnas con dos ceros estructurales invitan a leer una diferencia que no existe.
- **`tree_degraded_to_direct` es de la corrida, no del caso**: si el árbol cabe depende del payload
  de cada modo. Una corrida degradada recibió **solo el primer nivel** del árbol y no se promedia
  con el resto.
- **La explicación que se muestra como «la» explicación es la marcada `is_final`.** Las intermedias
  existen y son insumo del lazo; pintarlas al mismo nivel haría creer que el caso produjo tres
  informes.
