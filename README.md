# CNC Web Lathe

Simulador educativo de torno X/Z, independiente de CNC Simulator Pro. Next.js + React para la interfaz; intérprete Rust puro compilado a WebAssembly. El navegador ejecuta el motor sin backend. El editor se adapta selectivamente de rudra496/cnc con su licencia y atribución.

**Demo:** https://jotabulacios.github.io/cnc-web-lathe/ (se publica con GitHub Actions en cada push a `main`).

> Simulación educativa: perfiles idealizados y convenciones documentadas. No valida programas para una máquina real.

## Qué se puede probar

- Editor G-code con resaltado de línea completada y selección explícita de los errores/avisos informados por Rust.
- G00/G01/G02/G03 modales, X/Z absolutos y U/W incrementales, F en mm/min.
- X programado y mostrado en diámetro; radio físico interno.
- G21/G18, S, M03/M04/M05 y fin M02/M30; G96/G97/G50 (velocidad de corte constante con límite) y G98/G99 (avance por minuto o por vuelta) con tiempo de mecanizado estimado.
- Ciclos G71 (desbaste exterior tipo I) y G70 (acabado), expandidos en Rust.
- Tabla de correctores por estación (reglaje, desgaste, radio de punta) y compensación G41/G42 en tramos rectos.
- Material sólido y tubular (mandrinado T5, refrentado tubular), sección 3D longitudinal, cámara ortográfica y animación continua de la herramienta.
- Herramientas educativas o nominales desde designaciones ISO 1832/5608 (sin datos de fabricante).
- Banco de trabajo a pantalla completa: visor 2D/3D, transporte y DRO siempre visibles, panel con pestañas.
- Paso por bloque, anterior y reinicio con snapshots completos.
- Reproducción automática con pausa y velocidad didáctica; se detiene ante un perfil parcial.
- Catorce prácticas guiadas: once referencias positivas (incluidos arco, refrentado, mandrinado y ciclos G71/G70) y tres diagnósticos intencionales, con recuperación del documento anterior.
- Guardado local explícito y descarga/apertura de proyectos JSON con código y configuración.
- Apertura/descarga de programas G-code UTF-8 (.nc/.tap/.gcode), manteniendo pieza/origen y copia recuperable.
- Vista longitudinal 2D de plato, stock inicial y herramienta exterior ideal; pieza y posición inicial editables.
- Vista opcional Three.js del material de revolución, con giro, zoom y alternativa 2D sin WebGL.
- Explicación educativa de cada bloque y seguimiento automático de la línea completada.
- Perfil exterior mecanizado en Rust: cilindrado recto, escalones, conos exteriores, material retirado y reconstrucción al retroceder/reiniciar.
- Conos exteriores G01 hacia Z negativo con radio interpolado linealmente, con hombro, tapa y ápice de radio cero.
- Diagnósticos de instrucciones no soportadas; ningún prefijo se ejecuta si hay errores.

La pantalla permite editar diámetro/longitud del stock, posición inicial X Ø/Z y herramienta. El perfil exterior ideal admite cilindrado, escalones y conos G01 hacia Z negativo; arcos G02/G03 monótonos en Z aproximados por cuerdas; y refrentado frontal G01 hasta X0. Si retira material exige husillo encendido y RPM positivas. Las vistas 2D y 3D consumen el mismo perfil calculado en Rust.

Cortes radiales parciales, avance hacia Z positivo que retire material, operaciones no soportadas o precisión insuficiente conservan el último bloque confiable y muestran una advertencia. No hay remoción volumétrica3D, animación continua de mecanizado, offsets, compensación de punta, ciclos ni CAM. La app usa `edu-lathe-v2`; la interfaz original `edu-lathe-v1` permanece disponible; no se afirma compatibilidad genérica Fanuc ni validez de un programa para una máquina real.

La herramienta inicial se elige en «Pieza y origen» y se conserva en los proyectos. El programa puede cambiarla con T; cambiar el setup invalida la ejecución anterior. La forma del inserto es ilustrativa y el corte sigue usando una punta ideal. Los arcos se comprueban como curvas reales para decidir contacto y luego se aproximan por cuerdas con tolerancia perpendicular de0.01mm. Un corte que la precisión del perfil no pueda confirmar produce una advertencia y conserva el bloque anterior.

También se puede configurar stock tubular con agujero inicial y ejecutar mandrinado longitudinal T5/T0505 con G00/G01. El botón «Cargar ejemplo de mandrinado» está en Pieza y origen. Las vistas2D/3D muestran ambas paredes y el volumen anular; guardados nuevos usan dialecto/proyecto v2 y se siguen abriendo proyectos v1. En tubos o programas con T5, arcos y cortes radiales parciales quedan limitados explícitamente; el refrentado exterior completo hasta el agujero está admitido. Ver [TUBULAR_SIMULATION.md](docs/TUBULAR_SIMULATION.md) para contrato y límites; [GUIDED_ANNULAR_PRACTICES.md](docs/GUIDED_ANNULAR_PRACTICES.md) describe cotas interiores/exteriores comparadas por paso y el diagnóstico del rápido que cruza la pared.

## Desarrollo

Requisitos: Node 24 (validado con 24.19.0), pnpm 11.25.0, Rust 1.99.1 con rustfmt/clippy y target wasm32-unknown-unknown, wasm-pack 0.13.1. Rust se fija en rust-toolchain.toml; Cargo.lock y pnpm-lock.yaml están incluidos.

```sh
pnpm install --frozen-lockfile
cargo install wasm-pack --version 0.13.1 --locked
pnpm build:wasm
pnpm dev
```

Abrir http://127.0.0.1:3000. Pulsar «Interpretar programa» y después «Siguiente bloque». Cambiar el texto invalida resultado y cursor; hay que interpretarlo otra vez.

```sh
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
pnpm check
pnpm build:wasm
pnpm test:wasm
pnpm build
```

`pnpm test` cubre contrato/reproducción TS sin requerir compilador Rust. `test:wasm` necesita los assets generados y ejecuta el WASM real, comparándolo con una fixture nativa. La fixture completa se comprueba también en Rust. Para inspeccionar la salida:

```sh
cargo run --locked -p cnc-core --example inspect
cargo run --locked -p cnc-core --example profile
```

## Pruebas de navegador

```sh
pnpm exec playwright install chromium
pnpm build
pnpm test:e2e
```

Ver [cobertura y subrutas](docs/E2E_BROWSER.md). Para retomar el trabajo, leer [continuidad](docs/CONTINUIDAD.md).

## Export estático

`pnpm build` genera WASM y Next en `out/`. Servir esa carpeta mediante HTTP; no abrir index.html con file:// y no usar next start para el export estático. Bajo subruta:

```sh
NEXT_PUBLIC_BASE_PATH=/cnc-edu pnpm build
```

El hosting debe servir out/ en `/cnc-edu/`, incluyendo JS glue y binario WASM con MIME application/wasm. La app no requiere cuentas ni servidor de interpretación. No se promete caché offline persistente.

## Estructura

- `crates/cnc-core`: scanner, estado modal, interpretación y contrato, sin dependencias web.
- `crates/cnc-wasm`: validación/conversión JS, ninguna semántica CNC.
- `src/lib/lathe`: validación de respuesta, carga y reproducción pura.
- `src/components`: laboratorio y editor adaptado por props.
- `fixtures/lathe`: programa, setup y resultados esperados.
- `docs/IMPLEMENTATION_STATUS.md`: base inicial y límites.
- `docs/INTERFACE_ITERATION.md`: diseño de la interfaz y trabajo de agentes.
- `docs/STOCK_PROFILE_MODEL.md`: reglas, límites y pruebas del perfil exterior actual.
- `docs/ARCHITECTURE.md`: decisiones y evolución prevista.

Código original del proyecto bajo MIT; componentes derivados mantienen los avisos adicionales de [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) y `licenses/`. No hay remotes configurados ni publicación remota.

Las herramientas T0–T4 cuentan con catálogo visual, selección inicial y marcador identificado en 2D; el plano puede ampliarse en escritorio. Ver [visibilidad y límites](docs/TOOL_VISIBILITY.md).

Atajos: F8 avanza, Mayús+F8 retrocede y Ctrl/⌘+Enter interpreta. El editor se habilita al terminar la hidratación para conservar las primeras ediciones. Ver [ejecución con teclado](docs/EXECUTION_SHORTCUTS.md).

Prácticas de diagnóstico: corte sin husillo y código no soportado, con navegación al bloque y carga explícita de referencia corregida. Ver [criterios y pruebas](docs/DIAGNOSTIC_PRACTICES.md).

Rendimiento: el editor dibuja solo las líneas visibles conservando el texto completo. `pnpm bench:engine` mide el WASM real; `pnpm bench:browser` mide apertura NC y respuesta de la interfaz con export estático existente. Ver [resultados y límites](docs/PERFORMANCE.md) y [ruta hacia interiores y varias puestas](docs/REFERENCE_LATHE_SIM.md).

Práctica nueva: **Refrentado y mandrinado de un tubo**, disponible en Ejemplos guiados. [Operación y referencias](docs/TUBULAR_FACING.md). [Log de trabajo incremental](docs/WORK_LOG.md).

Herramientas T0–T5: conjuntos educativos propios en milímetros, con porta/cuchilla/barra diferenciados y geometría compartida entre2D y3D. El corte sigue siendo por punta ideal, sin colisiones ni correctores. [Medidas y procedencia](docs/TOOL_ASSEMBLIES.md).
