# Primera base ejecutable — 2026-10-20

> Documento histórico de la primera base. Para capacidades y pendientes vigentes, leer [Estado de situación — 22/10/2026](ESTADO_DE_SITUACION_2026-10-22.md) y [HANDOFF](HANDOFF.md). Las secciones de alcance inicial siguientes no describen el producto actual.

Actualización más reciente: biblioteca de herramientas y llamadas T/M06 (incremento 5.2) y refrentado frontal pasante a X0 (incremento 5.1) implementados y verificados en raíz y subruta, con QA visual en :3100; ver [catálogo de herramientas](TOOL_LIBRARY_DIALECT.md), [dialecto de refrentado](FACING_DIALECT.md), [revolución 3D](REVOLUTION_3D.md) y [modelo de perfil](STOCK_PROFILE_MODEL.md).

Actualizaciones posteriores: biblioteca de 5 herramientas educativas, llamadas Tsstt / Ts y M06, refrentado frontal, arcos G02/G03 con remoción por cuerdas, configuración editable, viewport de torno, explicaciones y perfil exterior mecanizado ya implementados. Ver [modelo de perfil](STOCK_PROFILE_MODEL.md) para las reglas y pruebas actuales. Ver [iteración de interfaz](INTERFACE_ITERATION.md). Este documento conserva el alcance y los checks del incremento inicial.

El usuario decidió crear un proyecto independiente y autorizó comenzar. Se inicializó Git en `/home/jotape/Documents/cnc-codex-starter`, sin remotes, push ni publicación. El clone auditado no recibió cambios funcionales.

## Implementado

- Workspace Cargo con `cnc-core` puro y wrapper `cnc-wasm`.
- Scanner completo con spans de línea/columna UTF-16, comentarios y diagnósticos.
- G00/G01/G02/G03 modales en X/Z; X en diámetro y radio físico interno, U/W incrementales. Los arcos G18 usan I/K incrementales, con `I` radial; `R` no está soportado.
- G21/G18/G98, F mm/min, S RPM, M03/M04/M05 y fin M02/M30.
- Conflictos de ejes/grupos, códigos desconocidos, números inválidos y límites de fuente/bloques bloquean toda ejecución.
- Bloques con snapshots completos antes/después; las líneas solo estado también se ejecutan por pasos.
- Frontera versionada JS/WASM con validación estricta y respuesta comprobada en TypeScript. Campos desconocidos de la petición se rechazan mediante deserialización intermedia a JSON Value.
- Carga asíncrona, revisión del documento, descarte de resultados obsoletos, stepping, retroceso y reset.
- Aplicación Next estática independiente, pantalla raíz, editor adaptado por props del upstream, trayectoria SVG con segmentos independientes y DRO.
- Perfil exterior v2 con radios lineales: conos exteriores G01 hacia Z negativo, con hombro, tapa y ápice de radio cero. `compile` v1 y `stock_profile` v1 conservan su semántica; `stock_profile_v2` es aditivo.
- Versiones fijadas en toolchains/lockfiles, scripts de checks y workflow CI preparado (aún no ejecutado en GitHub).
- Licencias/procedencia del editor en THIRD_PARTY_NOTICES.md y avisos incluidos también en la exportación estática.

El renderer no interpreta G-code. Cada posición y cambio de husillo proviene de snapshots del core Rust. Los segmentos se muestran tenues si están pendientes y resaltados una vez completado su bloque.

## Alcance de esta pantalla

Setup fijo: Ø50×100 mm, posición inicial radio 30/Z5, herramienta exterior ideal. El contrato recibe setup explícito, pero la edición de esas opciones en UI queda pendiente. La vista dibuja stock inicial y trayectoria; no es perfil mecanizado ni remoción. Tampoco incluye reproducción continua, Three.js/3D, persistencia, selección de herramientas, compensación, ciclos, catálogos ni CAM.

MVP-A está iniciado y su recorrido fundamental funciona; no declarar completado todo el escenario de PROJECT.md hasta agregar setup editable y preview de perfil con modelo de corte definido. Se eligió un reducer puro para reproducción en vez de agregar Zustand a una base que no lo necesita todavía. No se copiaron parser, remoción, analytics ni dependencias auxiliares de fresado.

## Verificación

Entorno: Node 24.19.0, pnpm 11.25.0, rustc 1.99.1 y wasm-pack 0.13.1. La instalación Rust usada en este chat queda dentro de work/toolchain/; no se modificó el PATH global del usuario. Para otro entorno se requieren los prerequisitos del README.

| Comprobación | Resultado |
|---|---|
| pnpm install --frozen-lockfile | Correcto |
| cargo fmt y clippy con -D warnings | Correctos |
| cargo test --workspace --locked | 12 tests de integración del core correctos |
| typecheck y ESLint del proyecto nuevo | Correctos |
| Tests TS de contrato/reproducción | 6 correctos |
| Tests sobre el WASM real | 3 correctos: equivalencia nativa, errores y peticiones malformadas |
| Build WASM target web | Correcto |
| Next export con validación de tipos | Correcto |
| Export Next con basePath=/cnc-edu | Correcto |
| Comprobación manual en navegador | Carga/interpretación, pasos hasta 9/9-M30, retroceso del estado del husillo, reset, invalidación al editar y bloqueo de G71 |
| Navegador desde /cnc-edu/ | Carga real del motor y recorrido verificados |
| Suite E2E automatizada / Firefox / WebKit | Actualización: Chromium raíz/subruta completado; Firefox/WebKit pendientes |
| CI remota | Workflow preparado, no publicado ni ejecutado |

La comparación de longitudes derivadas admite 1e-9 mm por redondeo de punto flotante; estado, coordenadas de fixture y procedencia se comparan exactamente. Los tests del core verifican múltiples entradas negativas y una cuadrícula determinista, además del escenario de nueve bloques. No se usa el parser legacy como oráculo.

## Qué sigue

1. Setup editable de diámetro/longitud/posición inicial: completado en la iteración de interfaz.
2. E2E automatizado del recorrido y carga/error WASM: completado en Chromium, raíz y subruta; ver E2E_BROWSER.md.
3. Viewport separado del laboratorio: completado en la iteración de interfaz; el frontend sigue sin interpretar CNC.
4. Modelo exterior ideal por tramos: implementado y probado en STOCK_PROFILE_MODEL.md.
5. Explicaciones y reproducción automática por bloques implementadas. Ver AUTOMATIC_PLAYBACK.md. La interpolación visual continua sigue pendiente; reservar Three.js para una superficie derivada del perfil probado.

La auditoría upstream en CODE_AUDIT.md conserva sus resultados históricos; sus fallos de build/tipos no describen este nuevo proyecto, cuyos checks pasan.

## Incremento del perfil cónico v2 — completado

El perfil exterior pasó de radios constantes a radios interpolados linealmente. El kernel Rust puro (`linear_profile.rs`) valida tramos, contacto y límites; la reconstrucción (`profile_v2.rs`) recalcula prefijos con rollback por bloque. La exportación `stock_profile_v2` es aditiva y no cambia `compile` v1 ni `stock_profile` v1. En la UI, la tabla de medidas pasa a mostrar «diámetro inicio → fin» y la malla 3D genera troncos de cono, ápices y hombros.

Verificación de esta entrega: 46 pruebas Rust, 10 pruebas sobre el WASM real, 67 pruebas TypeScript, typecheck y ESLint correctos; 36 E2E Chromium correctos en la raíz y 36 bajo `/cnc-edu/`. QA visual manual del cono con `fixtures/lathe/taper-turning.nc` sobre el export raíz, sin errores de consola.

Lo que sigue sin cubrir: conos que menguan hacia Z negativo, corte radial, avance inverso, ciclos, compensación de punta, catálogos y CAM. El cuarto ejemplo guiado, «Cono exterior», ya comprueba el recorrido cónico.

## Incremento 4.1 — arcos G02/G03 en G18

Implementado y verificado. El intérprete resuelve la geometría del arco y la vista 2D lo dibuja; el perfil de material todavía **no** modela arcos y se congela antes del primer bloque G02/G03. Convención completa en [ARC_DIALECT.md](ARC_DIALECT.md).

- Tipos: `MotionKind::{ArcCw,ArcCcw}` (`arc-cw`/`arc-ccw`), `ArcGeometry {center, radiusMm, clockwise, sweepRad}` y `Motion.arc` opcional; el JSON existente no cambia para movimientos lineales/rápidos.
- Intérprete: `G02`/`G03` modales, `I` radial incremental, `K` axial incremental, ambos no modales. Centro = inicio + (I, K); el radio se resuelve con `hypot` y el punto final debe caer sobre la circunferencia dentro de `ε_arc = 1e-6 mm`.
- Barrido normalizado al arco menor a 360°; sentido horario/antihorario visto desde +Y con Z a la derecha y X arriba. Se rechazan arcos completos, centros inválidos y arcos cuyo barrido cruza el eje (radio negativo).
- Diagnósticos: `MISSING_ARC_CENTER`, `INVALID_ARC_CENTER`, `ARC_RADIUS_MISMATCH`, `DEGENERATE_ARC`, `UNEXPECTED_ARC_WORD` y `POSITION_RANGE`. `MISSING_FEED` ahora cubre G01/G02/G03.
- Perfil v1 y v2: congelan antes del arco con `ARC_IN_PROFILE`, incluso si el arco está en el aire. No se aproxima el arco por su cuerda.
- Contrato TS estricto: enum de movimiento ampliado, `arc` validado con `superRefine` (obligatorio solo en arcos) y `sweepRad` en (0, 2π).
- UI: trazo SVG con comando `A` y `data-arc`, encuadre que incluye el vientre, etiquetas G02/G03 en DRO y explicación con centro, radio y barrido.
- `docs/ARC_DIALECT.md` fija convención, tolerancias, límites y lo que falta verificar contra un manual real.

Verificación de esta entrega: **57 pruebas Rust** (46 + 11 de arcos), **11 sobre WASM real**, **72 TypeScript**, typecheck, ESLint, clippy y fmt correctos; **39 E2E Chromium en la raíz y 39 bajo `/cnc-edu/`**. QA visual en contexto nuevo: G03 convexo dibujado hacia arriba-izquierda y G02 cóncavo hacia la esquina del material, ambos del lado correcto; perfil parcial con `ARC_IN_PROFILE` y sin errores de consola. Logs en `docs/evidence/arcs-*.log`.

## Incremento 4.2 — remoción de material para arcos en perfil v2 (completado)

Implementado, verificado y publicado sobre el perfil v2:

- **Aplanado determinista por cuerdas**: los arcos monótonos en Z se aproximan mediante tramos lineales con tolerancia geométrica perpendicular $\delta = 0.01\,\text{mm}$ (`ARC_CHORD_TOLERANCE_MM`) y un presupuesto de hasta 512 segmentos (`MAX_ARC_SEGMENTS`).
- **Monotonicidad y corte**: solo se aplanan arcos monótonos en Z. Si un arco contiene una inversión axial o pasa de 512 segmentos, el perfil se congela transaccionalmente con `ARC_IN_PROFILE` o `PROFILE_LIMIT` sin inventar tramos. Movimientos en el aire no alteran el stock ni requieren husillo; si hay penetración, exigen husillo encendido y RPM positivas.
- **Visualización 2D y 3D**: la tabla de medidas del laboratorio muestra los últimos 20 tramos lineales del perfil (visibilizando el arco) con aviso explícito. En la vista 3D se genera la revolución del perfil por frustos con volumen coherente con el analítico (error relativo $< 6 \times 10^{-5}$).
- **Compatibilidad legacy v1**: el perfil v1 (`stock_profile`) conserva su comportamiento histórico congelando con `ARC_IN_PROFILE`. Se preserva el contrato v2 sin necesidad de crear v3.

Verificación de esta entrega: **61 pruebas Rust**, **12 pruebas sobre WASM real**, **72 pruebas TypeScript**, typecheck, ESLint, clippy y fmt correctos; **40 E2E Chromium en la raíz y 40 bajo `/cnc-edu/`**. QA visual automatizado sobre el snapshot raíz en `:3100` con capturas de G03 y G02 en 2D y 3D sin errores de página. Logs en `docs/evidence/arcs-v2-removal-*.log`.

Lo que sigue sin cubrir: `R` en lugar de `I`/`K`, otros planos, arcos helicoidales, compensación de punta, ciclos y CAM.

## Incremento 5.1 — refrentado frontal pasante en perfil v2 (completado)

Implementado, verificado y publicado:

- **Operación en `linear_profile.rs`**: `face_to(z_cut)` y `max_radius_in(z_min, z_max)`. Todo el material en $[z_{\text{corte}}, 0]$ es retirado y sustituido por radio cero, actualizando la nueva cara frontal a $Z = z_{\text{corte}}$.
- **Reconstrucción en `profile_v2.rs`**: Los movimientos `G01` puramente radiales hacia el centro (`from.r_mm > to.r_mm` con `to.r_mm == 0.0`) dentro de $-L < z_{\text{corte}} \le 0$ son admitidos como refrentado:
  - Requieren husillo encendido (`M03`/`M04`, $S > 0$) si hay material presente.
  - Exigen que el punto de inicio se encuentre en o fuera del material existente en esa región (`from.r_mm >= max_r`).
  - Cortes radiales parciales (`to.r_mm > 0.0`) o que arrancan dentro de material se congelan con `UNSUPPORTED_PROFILE_CUT`.
- **Explicación didáctica y 2D/3D**: `explain.ts` detalla el refrentado frontal. La vista 2D SVG omite el tramo de radio cero del polígono de material y la vista 3D genera la tapa en $z_{\text{corte}}$ con volumen analítico exacto.
- **Verificación**: **65 pruebas Rust**, **13 sobre WASM real**, **73 TypeScript**, typecheck, ESLint, clippy y fmt correctos; **42 E2E Chromium en raíz y 42 bajo `/cnc-edu/`**. QA visual automatizado en snapshot `:3100` con capturas en `outputs/torno-refrentado-*.png`. Documentación en `docs/FACING_DIALECT.md` y logs en `docs/evidence/facing-*.log`.

## Revisión adicional

Un agente interno detectó un caso límite: G/M fraccionarios con demasiados decimales podían redondearse a un entero f64 soportado. Se corrigió validando la sintaxis entera del selector antes de su uso semántico; G/M/N/O requieren literales enteros sin punto decimal ni signo. Se agregaron regresiones nativas y WASM. Antigravity completó una revisión de texto sin herramientas por pedido del usuario. Se aclaró además la gramática sin signos de G/M/N/O. Ver AGENT_REVIEW.md para observaciones, comprobación y cambios.
