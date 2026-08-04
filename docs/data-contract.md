# Contrato de datos — el dump del Case Bundle

Un archivo JSON, generado en otro repositorio, que esta app importa y muestra. **No se edita a mano
y no se produce aquí.**

```bash
# en ../Kmp-Repair-Agents
kmp-repair dump <case-key> > ../Kmp-Repair-Agents-FrontEnd/data/bundle.json
kmp-repair dump --all    > ../Kmp-Repair-Agents-FrontEnd/data/bundles.json   # desde el paso 10
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

## Estructura

```
{ schema_version, generated_at, pipeline_git_sha, case_state,
  update, execution, structural, repair, validation, explanation,
  agent_calls, catalog_origin }
```

Las seis secciones centrales son, una a una, las
[6 etapas del Case Bundle](../../Kmp-Repair-Agents/docs/stages.md).

| campo | presente desde | notas |
|---|---|---|
| `schema_version`, `generated_at`, `pipeline_git_sha` | paso 2 | procedencia; el sha permite trazar cualquier pantalla a una versión exacta del pipeline |
| `case_key`, `resolved_key` | paso 2 | la llave tal como se pidió (`owner/name#pr` o `owner/name@base..head`) y la **resuelta**, siempre en forma `@base..head`. Las dos tienen que sobrevivir a una URL. Cuando difieren, la vista muestra a qué revisiones resolvió: un `#pr` no fija contenido y un PR reescrito resuelve distinto |
| `case_state` | paso 2 | el estado terminal alcanzado — es lo que explica cada sección ausente |
| `blocked` | paso 2 | `null` salvo que `case_state` sea `UNAVAILABLE`; entonces `stage`, `reason`, `permanent` y el `message` **crudo**. Un caso que no se pudo traer o ejecutar no es un fallo de reparación: se dibuja como indisponible, jamás como rojo. `permanent: false` se muestra como recuperable, no como resultado ([ADR 0012](../../Kmp-Repair-Agents/docs/decisions/0012-unavailable-is-one-state.md)) |
| `update` | paso 2 | `bumps[]` — cada uno con `label`, `from`, `to`, archivo y `update_kind` (5 valores: `direct`, `plugin-toolchain`, `platform-integration`, `reference-update`, `fallback`) — más `base_sha`/`head_sha` y el diff del bot. **Es una lista incluso cuando trae un solo elemento**, y 10 de los 94 casos traen entre 2 y 4. `from`/`to` son **strings opacos**: `"8.1.2"` en un bump de versión, `"f30c8b7"` en uno de referencia — no se ordenan ni se parsean como semver en la vista. Una lista **vacía** significa que el diff no tocó ningún archivo de build reconocible, no "no hubo cambio de versión". El bump primario es nullable y lo llena un paso posterior, nunca la ingesta |
| `execution` | paso 2 | probes por target y stage, `FailureObservation[]` con rol causal, **texto de error real**, targets no ejecutables declarados |
| `structural` | paso 4 | grafo de source-sets, pertenencia a targets, links expect/actual, y `partial: bool` |
| `repair` | paso 4 (localización) / 6 (patches) | candidatos rankeados con desglose por señal; intentos de patch con diff, ruta y motivo de rechazo |
| `validation` | paso 7 | matriz target × outcome, split resuelto/remanente/nuevo, outcome repo-level |
| `explanation` | paso 8 | artefacto JSON + Markdown, los 4 campos de auditoría separados, y si vino del agente o del fallback |
| `agent_calls` | paso 5 | uno por llamada a LLM: backend, versión de prompt, parámetros de decoding, **hash** de prompt/respuesta, tokens, latencia |
| `catalog_origin` | paso 10 | `null` si el caso no vino del corpus; si vino: `corpus_version`, `case_id`, `ground_truth_files`, `environment_fingerprint`, `licence` (`spdx`/`resolved_at`/`url`) y `base_commit_date` |

## Tres tipos de ausencia distintos

Distinguirlos es la única forma de que la UI no mienta:

- **Sección no alcanzada** (`null` porque `case_state` no llegó): se dibuja el bloque con su razón
  a la vista. Un `NO_REPAIR_NEEDED` deja cuatro secciones así, y eso es un resultado correcto.
- **Target no ejecutable** (`environment_unavailable`): existe, se probó, la máquina no podía
  construirlo. **Nunca se pinta como fallo** y nunca entra en un denominador. Regla heredada tal
  cual del [front del Mining](../../../MINING/Kmp-Repair-Mining-FrontEnd/docs/data-contract.md).
- **Métrica no aplicable** (`None`): un caso sin `ground_truth_files` tiene `Hit@k = None`. **Se
  pinta `None`, nunca 0** — política del paper, no una excepción de esta app.

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

**Que haya un solo intento.** `AttemptPolicy` puede ser `FIXED_N` o `ADAPTIVE_PROGRESS`: la vista
de intentos es una lista, no un objeto único, desde el primer día — incluso mientras el pipeline
solo produzca uno.
