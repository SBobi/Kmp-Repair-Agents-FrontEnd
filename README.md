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
niveles y la taxonomía— y **cinco casos ejecutados de verdad**: §1 desde el catálogo y §2 con
Gradle real, sobre repositorios reales del corpus. Ninguna cifra escrita a mano y **ninguna ficha
inventada**.

Los cinco respetan el reparto del corpus: **tres tienen la compuerta de configuración cerrada en
`updated`** —la columna colapsa entera, y eso es un fallo, no su ausencia— y **dos rompen por
target**, con celdas rojas en `compile`, `compile-test` y `test-run`. Ese último nivel el corpus lo
tiene en cero medidos: la campaña de minado solo compiló.

La app se construye en paralelo al pipeline, una vista por paso: ver
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
kmp-repair schema-dump > $F/schema.json
python3 scripts/probe_execution_against_catalog.py \
    --case-id 10 --case-id 15 --case-id 32 --case-id 39 --case-id 61 \
    --dump $F/executed.json
```

El segundo **compila de verdad**: son minutos u horas, no un comando barato. Y estos otros cuatro
archivos vivieron acá y se quitaron a propósito —lo que se mira ahora es evidencia medida, no la
forma del contrato ilustrada con datos inventados—; cada uno se regenera con una línea si hiciera
falta volver a mirarlo:

```bash
kmp-repair demo --fixture worked_case      > $F/bundle.worked_case.json
kmp-repair demo --fixture no_failure_case  > $F/bundle.no_failure_case.json
kmp-repair ingest                          > $F/corpus.json   # §1 sobre los 94, sin red
kmp-repair ingest --git Oztechan/CCC@0d8bee72..94fb90fc > $F/bundle.adhoc_case.json
```

**Los dos se versionan**: sin ellos `npm run build` no pasa el type-check en un clone limpio, y un
dump estático es el mejor fixture posible. `executed.json` **no se regenera con un comando barato**:
pide los mirrors de la campaña, los JDK, red para que Gradle resuelva plugins, y horas de build.
Por eso se versiona con más razón que ninguno.

**Lo que se perdió al dejar solo los cinco, dicho para que no se descubra**: la vista de §1 sobre
los 94 —19 repos, las 4 discrepancias de `catalog_contrast`— y la comparación del caso ad-hoc
contra el del catálogo, que cerraba el paso 3b. Las dos garantías **siguen comprobadas en el
pipeline** (`scripts/contrast_git_with_catalog.py` y `tests/adapters/test_local_git.py`); lo que ya
no se puede es mirarlas acá.

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
