# Plan incremental de implementación

Estado actualizado: el usuario aprobó empezar con repositorio independiente. Primera base ejecutable completada; ver IMPLEMENTATION_STATUS.md. La auditoría original y su baseline siguen preservados en CODE_AUDIT.md.
Fecha: 2026-10-20. Referencias: ARCHITECTURE.md, CODE_AUDIT.md, ISSUE_CHECKLIST.md.

## Resultado que se busca

Un estudiante abre la aplicación independiente en `/` sin cuenta, define stock Ø50 × 100 mm, selecciona herramienta exterior genérica, escribe un programa X/Z y avanza por bloques. Ve posición X en diámetro, Z, línea ejecutada, modo, F, estado de husillo y trayectoria 2D. Todo se interpreta en el navegador mediante Rust/WASM. No necesita backend ni base de datos.

Separar dos entregas: MVP-A de trayectorias/estado y MVP-B de perfil exterior aproximado. El escenario completo de PROJECT.md incluye preview de stock/perfil: no declarar cumplido ese escenario con solo dibujar líneas sobre un rectángulo. Superficie de revolución 3D viene después de validar perfil 2D.

## Secuencia de entregas pequeñas

### 0. Base independiente (decisión actual)

El usuario eligió un repositorio independiente. No corresponde reparar dependencias ni errores de fresado en el clone de referencia. Se inicializó una aplicación Next mínima con dependencias fijadas, lock pnpm propio, core Rust nuevo y un único componente extraído con procedencia y licencia. Instalación frozen y checks del nuevo proyecto sustituyen el baseline heredado. Las comprobaciones legacy de este plan histórico solo serían necesarias si se extrajeran otros componentes compartidos; no se conserva una fresadora dentro de esta aplicación.

Aceptación de la primera base: Git local sin remotes, instalación reproducible, scripts de checks, fuente de ejemplo determinista y primera pantalla estática con motor WASM real. Ver IMPLEMENTATION_STATUS.md para lo cumplido y las limitaciones de setup/perfil.

### 1. Núcleo Rust puro: primer trabajo de programación

Agregar workspace Cargo y `cnc-core`, sin cambiar el parser legacy. Implementar scanner que consume toda la entrada, spans, bloques y errores; estado modal mínimo y G00/G01 X/Z absolutos; convención diámetro y posición inicial explícitas. Después, U/W incrementales y estados F/S/M03/M04/M05/M02/M30 dentro del mismo subconjunto versionado. Validar bloques atómicamente y bloquear toda reproducción ante errores.

Aceptación: `cargo test -p cnc-core`, `cargo fmt --check` y clippy pasan; fixtures deterministas tienen bloques, snapshots, movimientos y diagnósticos esperados. Sin dependencias web ni renderer. Una instrucción desconocida nunca produce movimiento. El primer PR puede limitarse a G00/G01 y F antes de agregar U/W/M, pero no declara todo `edu-lathe-v1` soportado hasta completar su matriz.

### 2. Frontera WASM y prueba de carga

Agregar `cnc-wasm`, serialización versionada y fachada asíncrona TS. Generar JS/WASM mediante target web, inicializar en cliente y servir en assets estáticos bajo basePath. Añadir manejo de error y resultado obsoleto.

Aceptación: misma fixture produce datos equivalentes en Rust nativo y navegador; build estático y carga bajo `/` y `/cnc-edu/` funcionan; ninguna llamada a servidor para interpretar. JS glue y wasm tienen versión consistente. Error de red/compilación muestra estado comprensible y mantiene controles inactivos. No hay fallback silencioso al parser de fresadora.

### 3. Primera integración vertical: MVP-A

Agregar la pantalla raíz del proyecto independiente, estado separado, editor reutilizado mediante props/wrapper y vista SVG 2D. Implementar step-forward/backward/reset por bloques; DRO y explicación de modalidad. Añadir stock inicial, herramienta ideal y trayectoria con segmentos discontinuos. No usar cálculo de corte por Z negativo ni heightmaps del fresado.

Aceptación: escenario detallado abajo automatizado, programa se ejecuta hasta el último destino, las líneas solo de estado se observan, edición invalida resultados, errores bloquean reproducción y fresado sigue funcionando. Funcionamiento de la vista 2D sin WebGL. No anunciar remoción de material todavía.

### 4. Preview de perfil: MVP-B

Definir primero el modelo de contacto de herramienta ideal y sus operaciones permitidas. Proponer un perfil exterior radial `r(z)` discretizado o segmentos de contorno para cilindrado exterior simple; documentar tolerancia de discretización. Ese modelo no representa automáticamente interiores, ranuras con socavados, piezas separadas ni herramientas con forma arbitraria.

Implementar actualización por operación/trayectoria de avance válida con límites del stock; rápidos no remueven material. Herramienta de punta ideal sin compensación, identificada como tal. Rechazar/avisar geometrías fuera del modelo en vez de fabricar un perfil aparentemente correcto. Seek/back/reset recomputan de forma determinista desde checkpoints, sin guardar un sólido completo por cada movimiento.

Aceptación: cilindro sin corte, cilindrado exterior recto y dos escalones con perfil esperado; cotas correctas al programar diámetro; reset/seek idénticos a recomputación completa dentro de tolerancia declarada; aproximación no elimina material fuera de la operación válida. Benchmark de memoria acotada. Cumple preview educativo con limitaciones visibles. Recién aquí declarar completado el escenario stock/perfil de PROJECT.md.

### 5. Animación, educación, empaquetado y 3D opcional

Agregar play/pause con reloj independiente del core, interpolación gráfica y velocidad didáctica; mantener stepping como referencia. Explicar coordenada omitida, G modal, diámetro/radio y diferencia entre rápido/avance. Completar ejemplos de torno y referencia con la matriz real de capacidades. Revisar accesibilidad, tamaños móviles, guardado local con esquema propio y exportación de programas.

Three.js puede consumir el perfil correcto como superficie de revolución; no modelar por ahora plato/turreta con detalle ni volumen general. No bloquear el MVP-A por estética 3D.

Aceptación: build reproducible, tests y E2E; demo estática local bajo subruta, sin cuentas ni backend; sin analytics heredado ni referencias de identidad incorrectas. Publicación remota únicamente cuando se autorice. El bundle sirve todos los assets de cálculo. Operación offline persistente requeriría caché/service worker y pruebas propias; no prometerla por ser cliente.

### 6. Expansión posterior, una capacidad por entrega

1. G02/G03 G18 con manual de control elegido y fixtures geométricos; plano/sentido e I/K inequívocos.
2. Sistemas de trabajo y offsets de geometría/desgaste; separar punto programado y punta física.
3. Compensación de radio de punta, con entradas/salidas, discontinuidades y errores propios.
4. G70/G71 y después roscado/ciclos más complejos, expansión acotada y trazabilidad bloque→movimientos.
5. Catálogo de herramientas/insertos y materiales con procedencia/licencias y parámetros de torno.
6. Programación asistida/CAM simple: operaciones, planificación geométrica y postprocesador; usar el mismo intérprete para verificar salida.

Cada capacidad agrega documentación, fixtures nativos/WASM y casos negativos. No usar la cadena de dependencias como permiso para implementar estos puntos durante el MVP.

## Escenario de aceptación del MVP-A

Setup explícito: mm, X diámetro, plano X/Z, radio inicial 30 mm, Z inicial 5 mm, stock Ø50×100 mm, origen en cara frontal, herramienta exterior ideal. Fuente:

```gcode
G21 G18 G98
S1200 M03
G00 X54 Z2
G01 X46 F120
Z-20
U-4 W-10
G00 X60 Z5
M05
M30
```

| Paso | Línea completada | X mostrado (Ø mm) | Radio interno (mm) | Z mm | Efecto |
|---|---|---:|---:|---:|---|
| Inicial | Ninguna | 60 | 30 | 5 | Setup, husillo detenido |
| 1 | G21 G18 G98 | 60 | 30 | 5 | Estado de unidades/plano/avance |
| 2 | S1200 M03 | 60 | 30 | 5 | Husillo CW 1200 RPM |
| 3 | G00 X54 Z2 | 54 | 27 | 2 | Rápido |
| 4 | G01 X46 F120 | 46 | 23 | 2 | Lineal, F120 mm/min |
| 5 | Z-20 | 46 | 23 | -20 | Conserva X/G01/F |
| 6 | U-4 W-10 | 42 | 21 | -30 | Incrementos, U diametral |
| 7 | G00 X60 Z5 | 60 | 30 | 5 | Rápido de retorno |
| 8 | M05 | 60 | 30 | 5 | Husillo detenido |
| 9 | M30 | 60 | 30 | 5 | Programa terminado |

Resultado: 9 bloques ejecutables y 5 segmentos (2 rápidos, 3 lineales). Step adicional al final no cambia estado. Retroceder del paso 9 restaura el estado del paso 8; retroceder del paso 8 restaura husillo encendido del paso 7. Reset vuelve a setup sin telemetría residual. Modificar la fuente pausa, invalida resultado y recompila; no mezcla revisiones.

Pruebas negativas de aceptación: Y, G71, G90/G91, G99, T0101, F0, X/U juntos, eje duplicado, basura y un paréntesis sin cerrar generan diagnóstico por línea/columna y cero movimientos ejecutables. M30 seguido de un movimiento no lo ejecuta. Una línea solo F cambia estado sin desplazar. Fuentes vacías o solo comentarios no generan pasos ni producen índices negativos.

## Estrategia de pruebas

| Capa | Qué comprobar | Herramienta / criterio propuesto |
|---|---|---|
| Scanner Rust | CRLF, compactos G1X10Z-5, signos, decimales, Unicode en comentarios, cierre y basura | Unit tests; spans con columnas UTF-16 y línea física base 1 |
| Semántica Rust | G modal, ejes omitidos, U/W, fin, estados S/M/F, grupos incompatibles, transacción de bloque | Fixtures de entrada/opciones/snapshots/eventos/diagnósticos |
| Geometría | X/2 una sola vez, longitud radial, endpoints, valores finitos, ausencia de avance ficticio | Unit + property tests de invariantes |
| Contrato | Request/response v1, enums, nulls, listas vacías, versiones, spans y rechazo de datos inválidos | Fixtures compartidas Rust/WASM/TS; diferencias numéricas ≤ 1e-9 mm en rectas simples |
| Robustez | Límite de fuente/bloques, números extremos, inputs incompletos, no panic ni bloqueo | Casos adversos y property tests; fuzz posterior, no requisito para dibujar UI |
| Store TS | Estados inicial/final, pasos sin movimiento, back/reset, edición, revisión obsoleta, error de carga | Vitest; snapshots estructurados, sin depender del reloj real |
| Vista 2D | Segmentos separados, r/Z a pantalla, labels Ø, stock en [-L,0], resalte | Tests de transformaciones y DOM; evitar snapshots de pixeles frágiles para geometría |
| Perfil futuro | Cortes permitidos, stock inalterado por rápido, convergencia, recomputación/checkpoint | Fixtures analíticas y error de discretización explícito |
| Navegador | Flujo completo, teclado/editor, fallo WASM y caché, sin backend, subruta | Playwright en Chromium; humo en Firefox/WebKit antes de declarar soporte |
| Legacy | Ejemplos, edición, play/pause, seek, reinicio, biblioteca y ruta original | Caracterización + smoke antes/después de extraer UI |
| Entrega | Build estático con assets y MIME, limpieza de consola nueva y links/assets | Servir out/ por HTTP; inspección de requests en E2E |

La prueba diferencial con parser legacy se usa solo para invariantes comunes como interpolación lineal, nunca como oráculo del dialecto de torno. Sus bugs documentados no se trasladan a resultados esperados. Comparar estructuras con tolerancias, no resultados dependientes de timestamps, FPS o números aleatorios.

## CI propuesta y gates

Orden para cambios Rust: formato → clippy con warnings como errores → cargo test --locked → compilación WASM versionada → tests de contrato/adaptador → typecheck/lint → export Next → E2E de ambos modos. Instalar dependencias JS con lock congelado y Rust con toolchain explícito. Checks en pull requests, sin automatizar aprobación de cambios semánticos CNC.

Medición inicial: fixtures pequeñas (<100 bloques) y sintética de 10.000 bloques. Registrar hardware, navegador, tiempo de carga WASM, compilación y memoria. Objetivo orientativo: respuesta interactiva <100 ms en fixture educativa tras inicialización, controles utilizables durante cargas; convertirlo en gate solo después de una medición reproducible. Si el máximo aceptado bloquea UI, introducir Worker antes de aumentar límites. Para animación, comprobar delta de reloj acotado y destino final igual al stepping, independiente de FPS.

## Dependencias y decisiones pendientes

- Decisión resuelta: repositorio independiente con extracción selectiva. No se necesita crear un remoto para probar Rust localmente.
- Revisar `edu-lathe-v1`: X diámetro, U/W incrementales, F mm/min y rechazo de G90/G91. Elegir manual/control si se desea compatibilidad más específica antes de expandir códigos.
- Reproducir baseline con Bun/lock original; la auditoría actual usó resolución exploratoria pnpm.
- Aprobar modelo de perfil exterior antes de implementar remoción. Catálogos y CAM siguen diferidos.

## Siguiente tarea concreta sugerida

Tras revisar los documentos: una entrega de preparación que fije dependencias y baseline, seguida de un PR pequeño con `cnc-core` puro para G00/G01, X/Z, F, bloques/spans y fixtures de diámetro/modalidad. Sin cambiar la fresadora, sin 3D nuevo y sin WASM hasta que las salidas del core estén probadas. La primera indicación de empezar ya fue recibida. Ver estado real y próximos pasos en IMPLEMENTATION_STATUS.md antes de ampliar el alcance.
