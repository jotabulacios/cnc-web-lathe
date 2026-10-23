# Backlog priorizado y criterios de cierre

Estado: backlog local, sin issues publicados. El usuario aprobó el proyecto independiente y se inició la primera base; ver IMPLEMENTATION_STATUS.md para distinguir lo terminado de lo pendiente. Prioridad P0 prepara una base correcta; P1 entrega la primera experiencia; P2 completa perfil/educación; P3 amplía capacidades.

| ID | Prioridad | Trabajo | Depende de | Criterio de aceptación |
|---|---|---|---|---|
| A01 | P0 | Revisar auditoría, estrategia fork/extracción y alcance | — | Usuario revisa el análisis antes de programar; decisión registrada |
| A02 | P0 | Fijar baseline JS/Bun y comprobar frozen lock | A01 | Instalación reproducible y versiones registradas; no sustituir lock silenciosamente |
| A03 | P0 | Resolver tipos/API de paneles, fallback y store | A02 | Typecheck del código de app limpio; dependencias auxiliares/excepciones con alcance explícito |
| A04 | P0 | Caracterización legacy y smoke de fresado | A02 | Ejemplos de rectas/arcos/ciclos, edición y playback se comparan antes/después; bugs conocidos identificados |
| A05 | P0 | Especificar edu-lathe-v1 y fixtures de aceptación | A01 | Matriz completa por código/palabra, X diámetro/U/W, F, fin y errores; sin promesa Fanuc genérica |
| R01 | P0 | Workspace Cargo y scanner puro con spans | A05 | cargo fmt/clippy/test pasan; basura, duplicados y números inválidos no se pierden |
| R02 | P0 | Interpretar G00/G01 X/Z, F y coordenadas físicas | R01 | Endpoints y longitud física probados; X/2 una sola vez; errores producen executable=false |
| R03 | P0 | U/W y bloques de estado/fin | R02 | Escenario de 9 bloques/5 segmentos; M30 termina y una línea solo F/S/M consume paso |
| W01 | P1 | Wrapper cnc-wasm y contrato versionado | R03 | Nativo/WASM entregan fixtures equivalentes; errores estructurados y valores finitos |
| W02 | P1 | Carga estática WASM y adaptador cliente | W01 | Funciona en raíz/subruta, init única, fallo/reintento visibles; no backend |
| U01 | P1 | Editor por props con wrapper legacy | A04 | Torno usa bloques/spans; fresado conserva comportamiento; editar no cambia cursor por click |
| U02 | P1 | Ruta /lathe/ y store separado | W02 | Revisión obsoleta descartada, error/compilación pausa y deshabilita ejecución |
| U03 | P1 | Step/back/reset por bloques y DRO ØX/Z | U01,U02 | Primer y último paso correctos, estados sin movimiento observables, reset restaura toda telemetría |
| U04 | P1 | Trayectoria 2D, stock inicial y punta ideal | U03 | Z horizontal/r vertical a escala física, ticks Ø, rápidos separados, sin segmentos inventados |
| T01 | P1 | E2E MVP-A y regresión legacy | U04 | Escenario y casos negativos automatizados; ruta original funciona; WASM bajo subruta sin requests de cálculo remotos |
| D01 | P1 | Gates CI y build reproducible | A03,W01,T01 | JS/Rust/contrato/E2E pasan, toolchains fijados, build no oculta errores nuevos |
| P01 | P2 | Especificar contacto/perfil exterior limitado | T01 | Operaciones soportadas y límites/tolerancias con fixtures analíticas antes de codificar |
| P02 | P2 | Preview de perfil con recomputación/checkpoints | P01 | Cilindro/escalones correctos, rápidos sin remoción, seek/reset reproducibles y memoria acotada |
| U05 | P2 | Animación y explicaciones educativas | T01 | Destino independiente de FPS, modalidad explicada y controles solo de funciones soportadas |
| S01 | P2 | Persistencia torno v2 y export/import | U02 | Clave propia, no modifica programas legacy, valida datos y comunica error de cuota |
| D02 | P2 | Ejemplos/referencia y revisión de publicación | T01,P02 | Documentación corresponde al subconjunto, licencia/atribución preservadas, identidad/analytics revisados |
| V01 | P3 | Superficie de revolución Three.js | P02 | Consume perfil probado sin introducir semántica CNC en renderer |
| E01 | P3 | Arcos G18 | D01 | Manual elegido, sentido/I/K/R/tolerancias y arcos inválidos probados |
| E02 | P3 | Offsets de trabajo y herramienta | E01 | Programado vs físico diferenciados, offsets/desgaste versionados y testeados |
| E03 | P3 | Compensación de punta | E02 | Entradas/salidas y discontinuidades con casos de referencia y errores visibles |
| E04 | P3 | Ciclos G70/G71 y roscado posterior | E02 | Expansión limitada, trazabilidad de bloque, paso por bloque y diagnóstico de parámetros |
| C01 | P3 | Catálogos con procedencia | D02 | Licencia por dataset, geometría de inserto/holder y sin parámetros de fresado mal trasladados |
| C02 | P3 | CAM simple/postprocesador | E02,C01 | Operación genera IR/código que interpreta el mismo core con fixtures |

## Actualización del repositorio independiente

R01–R03, W01–W02 y U01–U04 implementados en la base independiente. P01–P02 implementados con los límites de STOCK_PROFILE_MODEL.md. T01 tiene seis casos Chromium correctos en raíz y subruta; no incluye regresión del legacy, que no se modificó ni se ejecuta en esta app. D01 tiene workflow preparado con E2E, pero CI remota pendiente. U05 tiene explicaciones y reproducción automática por bloques; no interpolación visual continua. Las dependencias de la tabla superior conservan el plan histórico de extracción, no obligan a modificar el upstream.

V01 implementado como vista opcional de revolución del perfil; remoción 3D volumétrica sigue fuera de alcance. Ver REVOLUTION_3D.md.

S01 implementado en el proyecto independiente como guardado explícito y JSON v1; no migra claves legacy ni hace autosave. D02 tiene nueve prácticas verificadas: siete referencias positivas y dos diagnósticos, incluidos arco con referencias analíticas y refrentado con cambio de herramienta, sin publicación remota. Ver LOCAL_PROJECTS.md y GUIDED_EXERCISES.md.

## Lista de revisión antes de comenzar

- [x] Autorizar el comienzo con un proyecto independiente.
- [x] Elegir repositorio independiente, Git local sin remotes.
- [ ] Validar dialecto educativo y convención X en diámetro.
- [ ] Aceptar MVP-A con stock inicial/trayectoria y MVP-B con perfil; no confundirlos.
- [ ] Registrar baseline real con gestor y lock fijados.

## Cierre obligatorio por entrega

- [ ] Código pequeño y revisable, con comportamiento y límites documentados.
- [ ] Cada código soportado tiene pruebas positivas y negativas.
- [ ] Diagnósticos conservan línea/columna y nunca ignoran instrucciones desconocidas.
- [ ] Fixtures deterministas con tolerancias explícitas.
- [ ] Checks requeridos ejecutados; reportar fallos y pruebas no realizadas.
- [ ] Smoke legacy pasa si se tocaron componentes compartidos.
- [ ] Preservar licencia y atribución de código reutilizado.
- [ ] Sin push, deploy o cambios de upstream sin autorización expresa.

Visibilidad de herramientas: catálogo T0–T4 y marcador identificado/ampliado en 2D terminados. Elección inicial y cambios T por bloque diferenciados. Ver TOOL_VISIBILITY.md; 52 E2E raíz y 52 subruta correctos.

Prácticas de diagnóstico terminadas: SPINDLE_OFF conserva prefijo/material; G71 bloquea ejecución; enlace al span, referencia recuperable y persistencia probados. Ver DIAGNOSTIC_PRACTICES.md.

22/10: benchmarks Node/Chromium y ventana de líneas del editor terminados. 58 E2E en raíz y 58 subruta; cuatro mediciones adicionales por montaje. Worker, material interior y varias puestas siguen sin implementar; ver PERFORMANCE.md y REFERENCE_LATHE_SIM.md. Apariencia de herramientas aplazada por el usuario.
