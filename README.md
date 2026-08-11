# kmp-repair-agents-frontend

Visor de los Case Bundles que produce [`Kmp-Repair-Agents`](../Kmp-Repair-Agents): qué evidencia
recogió el pipeline antes y después de la actualización, **qué árbol de impacto construyó y cómo lo
recorrió el agente**, dónde localizó la rotura y por qué, qué patch intentó, **qué pasó al probarlo**
—verde, el mismo error, o uno nuevo— y qué explica.

**Este repo solo muestra.** No ejecuta builds, no llama a ningún LLM, no decide nada sobre un caso.
Importa un JSON y lo dibuja — mismo contrato que
[`Kmp-Repair-Mining-FrontEnd`](../../MINING/Kmp-Repair-Mining-FrontEnd) tiene con su repo de minería.

## Estado

**Dos vistas: `/#/domain` y la ficha de caso.** El dominio —las tres máquinas, las aristas entre
niveles y la taxonomía— y **96 casos**: los 94 del corpus con §1, más dos fixtures con §1 y §2.
Todo desde el dump, ninguna cifra escrita a mano. Los 94 llegan con `stage_state: INGESTED` y sus
otras siete secciones marcadas «no alcanzada» — §2 necesita Gradle real, que es el paso 3. La app se construye en paralelo al pipeline, una vista por paso: ver
[docs/spec.md](docs/spec.md) y el
[roadmap del pipeline](../Kmp-Repair-Agents/docs/roadmap.md).

## Por qué existe desde el paso 1 y no al final

Es la lección de la campaña de minado. El front del Mining se montó **después**, sobre un corpus ya
congelado, y aun así hizo visibles cosas que las cifras agregadas escondían. Acá se invierte el
orden: **ningún paso del pipeline se da por terminado hasta que se puede mirar en pantalla.** El
razonamiento completo está en
[ADR 0008 del pipeline](../Kmp-Repair-Agents/docs/decisions/0008-every-step-verified-by-ui.md).

Consecuencia práctica: esta app no espera a que exista el pipeline entero. En el paso 1 dibuja una
máquina de estados; en el paso 8, una matriz de validación. Cada paso añade una vista y **amplía el
contrato del dump**, nunca lo rompe hacia atrás.

## De dónde salen los datos

Un comando del pipeline emite el artefacto; esta app lo importa. Son **cuatro archivos**:

```bash
cd ../Kmp-Repair-Agents
F=../Kmp-Repair-Agents-FrontEnd/data
kmp-repair schema-dump                     > $F/schema.json
kmp-repair demo --fixture worked_case      > $F/bundle.worked_case.json
kmp-repair demo --fixture no_failure_case  > $F/bundle.no_failure_case.json
kmp-repair ingest                          > $F/corpus.json   # §1 sobre los 94, sin red
```

**Los cuatro se versionan**: sin ellos `npm run build` no pasa el type-check en un clone limpio, y
un dump estático es el mejor fixture posible. `corpus.json` se regenera con un comando y **no
depende de red** —`dependency_diff` es una columna del catálogo—, pero sí de que
`data/corpus/model_input_v1.db` esté copiado a mano en el repo del pipeline (ADR 0001).

Qué contiene y qué garantiza, desde la lectura del consumidor:
[docs/data-contract.md](docs/data-contract.md). Qué lo produce y por qué contiene eso, en el repo
del pipeline ([architecture.md](../Kmp-Repair-Agents/docs/architecture.md),
[stages.md](../Kmp-Repair-Agents/docs/stages.md)). **Decidir qué es un Case Bundle no es
responsabilidad de este repo** — misma frontera que fijó
[ADR 0010 del minado](../../MINING/Kmp-Repair-Mining/docs/decisions/0010-second-review-belongs-to-the-corpus.md)
cuando el enriquecimiento se fue del visor al pipeline.

## Correr

```bash
npm install
npm run dev       # http://localhost:5173/Kmp-Repair-Agents-FrontEnd/#/domain
npm run build     # tsc -b + vite build → dist/
npm test          # vitest run — checks de frontera sobre data.ts
```

Ver [docs/stack.md](docs/stack.md).

## Docs

- [docs/spec.md](docs/spec.md) — las vistas, paso por paso, y qué queda probado con cada una
- [docs/data-contract.md](docs/data-contract.md) — la forma del dump y lo que **no** contiene
- [docs/stack.md](docs/stack.md) — el stack heredado del front del Mining y qué no se añade

## Qué hereda del front del Mining

No se rediseña lo que ya funcionó. Se reusa el vocabulario visual y las reglas duras:

- La rejilla **target × stage** (`ProbeMatrix`) y su semántica: `✓` verde, `✗` rojo, `–` sin probe,
  `⊘` `environment_unavailable`. **Un target no disponible nunca se pinta como fallo** — es una
  limitación del entorno, no evidencia.
- El visor de **diff unificado** con colapso para parches grandes (`DiffView`).
- Chips multi-select con conteo (`ChipGroup`), OR dentro de un filtro y AND entre filtros.
- **Toda cifra en pantalla se deriva del dump en carga, jamás se escribe a mano.**
- Estado nunca solo por color; glifo + `aria-label`; foco visible; contraste AA.

Y hereda una deuda explícita: el front del Mining declaró fuera de alcance el **estado de
reparación por caso** ("es el otro repo, y ese dato no existe todavía") y el **texto real del error
de compilación** ("no existe en ningún artefacto hoy"). Este repo cierra los dos huecos — ver
[docs/spec.md](docs/spec.md).
