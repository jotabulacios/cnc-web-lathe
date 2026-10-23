# Auditoría del código existente

Fecha: 2026-10-20. Estado: auditoría, sin cambios funcionales.

## Alcance y trazabilidad

Se leyeron primero `/home/jotape/Documents/cnc-codex-starter/PROJECT.md` y `AGENTS.md`, y después FIRST_PROMPT.md. El starter solo contenía esos tres documentos: no era un repositorio Git ni un fork ya creado. Se clonó `https://github.com/rudra496/cnc` en el directorio de trabajo del chat para inspección. SHA auditado: `b59fefb5043ce53ddd3adf34079398838a69729d`. Las rutas `src/...` de este informe se refieren a ese commit, no al starter.

Se inventariaron los archivos versionados, entradas Next, componentes CNC, módulos de lógica, primitivas UI, hooks, datos, assets públicos, configuración, ejemplos auxiliares, Prisma y workflows. Se revisó en detalle el recorrido editor → parser → Zustand → reproducción → geometría/render. No se afirma una revisión de seguridad exhaustiva de cada dependencia ni una validación geométrica de cada ejemplo.

No se encontraron PROJECT.md/AGENTS.md adicionales en upstream, crates Rust, runner de tests, archivos de pruebas unitarias/E2E ni script `test`. Los scripts disponibles son dev/build/start/lint. La afirmación de CONTRIBUTING.md de que el núcleo está probado no está respaldada por una suite automatizada en este snapshot.

## Funcionamiento real

1. `src/app/page.tsx` carga `CncLayout` con `ssr:false` y selecciona el ejemplo inicial en un effect. `CncLayout.tsx` arma barra de control, paneles redimensionables, pestañas y escena dinámica.
2. `src/components/cnc/GCodeEditor.tsx:85` lee directamente `useSimStore`. Usa textarea transparente sobre un pre coloreado, no Monaco/CodeMirror. Su `tokenizeLine` es solo resaltado. Cada pulsación llama `setSource`, que vuelve a interpretar todo el programa. Click dentro del editor calcula línea y busca el primer movimiento de esa línea.
3. `src/lib/cnc/parser.ts:112`, `parseGCode`, tokeniza con regex, aplica F/S/T/M/G y acumula `Move[]`. Reconoce G00/G01, arcos G02/G03 en tres planos, dwell y aproximaciones de taladrado G81/G82/G83. `sampleMove` interpola; `estimateCycleTime` estima duración. El resultado tiene líneas fuente, warnings, bounds y estado final de herramienta; no representa cada bloque ni todo el estado modal final.
4. `src/lib/cnc/store.ts`, `applyProgram`, parsea fuente y calcula tiempos acumulados. `useSimStore` combina fuente/setup, resultado, cursor temporal, overrides y telemetría. `tick` consume tiempo de movimientos. `ControlBar.tsx:350` lo llama desde requestAnimationFrame. El botón single-block pausa por movimiento, no por bloque CNC.
5. `src/lib/cnc/carve.ts` crea heightmap de una superficie plana XY y reduce alturas Z mediante discos. `stampMove` samplea el movimiento y `buildCumulativeHeightmaps` guarda una copia completa por movimiento. `CncScene.tsx:344`, `Workpiece`, usa N=120, precalcula mapas y aplica el estado parcial en `useFrame`.
6. `CncScene.tsx` dibuja pórtico, husillo y herramientas rotativas. La conversión es CNC `(x,y,z)` → Three `(x,z,-y)`. `buildToolpathLines` separa avances/rápidos, pero devuelve una polilínea por tipo, con problemas de continuidad.
7. `programStore.ts` guarda programas y prisma rectangular en localStorage, importa/exporta JSON y archivos NC. `viewStore.ts` mantiene toggles y presets aparte. No se observó dependencia de un backend para el flujo del simulador.

## Reutilización para torno

| Componente real | Reutilización | Cambio necesario |
|---|---|---|
| `GCodeEditor.tsx`, resaltado, gutter, scroll | Alta | Recibir props en vez de importar store; mapear bloques, corregir seek al editar, añadir diagnósticos por span |
| `CncLayout.tsx`, paneles, `src/components/ui/`, hooks y estilos | Alta con verificación | Resolver API de react-resizable-panels y dependencias de primitivas no usadas |
| `ProgramPanel.tsx`, `DiagList` | Parcial | Sustituir medidas rectangulares, texto fijo de fresa y ejemplos por datos del torno |
| `ControlBar.tsx`, controles/atajos | Parcial | DRO X/Z Ø, estado por bloques y reset consistente; eliminar controles no soportados del modo torno |
| `programStore.ts`, `ProgramManager.tsx` | Parcial | Persistencia versionada separada, stock cilíndrico, dialecto, errores de guardado visibles |
| `viewStore.ts`, `SceneOverlay.tsx` | Parcial | Opciones de vista útiles, presets adecuados al torno; no reutilizar selector como intérprete |
| `types.ts`, `Move.line/source`, snapshots por movimiento | Conceptual | Mantener trazabilidad, pero crear DTO X/Z físico y bloques explícitos; no forzar Y=0 en Move legacy |
| `parser.ts`, `sampleMove` | Referencia, no motor de torno | Sustituir semántica CNC por core Rust; la interpolación lineal es reutilizable como idea matemática |
| `store.ts` | Patrón Zustand reutilizable | Store nuevo de torno; no heredar telemetría `z<0`, tiempos ni auto-origen de fresado |
| `carve.ts`, `Workpiece`, `SpindleHead`, `MachineFrame`, `ToolGeometry` | Muy baja para torneado | Reemplazar geometría, contacto y remoción; heightmap XY no modela sólido de revolución |
| Three/R3F, iluminación/materiales/controles de cámara | Media, posterior | Transformación y encuadres nuevos; 2D antes de geometría 3D |
| `machines.ts`, catálogo | Metadatos de ejemplo | Capacidades declaradas no verificadas; no mostrar ciclos como implementados |
| `tools.ts`, `ToolManager.tsx` | UI de catálogo y IDs, parcialmente | Herramientas de torno necesitan punta, orientación, inserto, portaherramienta y offsets |
| `materials.ts`, `MaterialPanel.tsx` | Apariencia, nombres, filtros | Revisar datos; chipLoad por diente y stepover no son parámetros generales de torneado |
| `feeds.ts`, `FeedsCalculator.tsx` | Muy baja en fórmulas | Alimentación por diente × flautas × RPM es fresado; torno requiere modelo propio |
| `examples.ts`, `snippets.ts`, `reference.ts`, `GuidePanel.tsx` | Estructura educativa | Crear contenido del subconjunto real; ejemplos actuales declaran machine='Mill' |
| `next.config.ts`, exportación y deploy | Alta con cambios | Fijar toolchain, añadir generación WASM y checks reales de tipos/lint/tests |
| Prisma, websocket, mini-services | No necesarios | Artefactos auxiliares desconectados de la ruta principal; no añadir backend para satisfacerlos |

Hay tipos/herramientas de torno en `tools.ts:315–390`, pero `ToolGeometry` no tiene casos `lathe_*`: caen al cilindro genérico. El selector cambia `machineId` sin alterar interpretación ni remoción. La UI y el catálogo no equivalen a soporte real de torneado.

## Hallazgos priorizados

### P0 — Semántica permisiva incompatible con enseñanza precisa

- `tokenizeLine` (`parser.ts:29`) busca coincidencias sin verificar el texto sobrante. `G01 X10 garbage @` retorna `ok:true` sin diagnósticos. Ejes repetidos se resuelven con `find` y se usa el primero. `Math.round` convierte `G1.4` en G1. `errors` se crea pero no se llena.
- El switch M (`parser.ts:239`) no tiene diagnóstico default. M123 desaparece. M02/M30 ejecutan `break` del switch, no del bucle de líneas: las instrucciones siguientes siguen generando movimientos.
- G53–G59, compensaciones y G98/G99 se aceptan como no-op. Un desconocido G solo da warning; `G71 X10 Z-5` termina generando un rápido por el modo inicial. Para torno debe bloquear ejecución, no ofrecer una aproximación silenciosa.
- G90/G91 son abs/inc de fresadora. No se deben trasladar al torno sin perfil de control. `machines.ts` anuncia G70/G71/G76/G96, pero el parser no los implementa.

### P1 — Paso a paso y estado no representan bloques

- `stepForward` aumenta índice y posiciona al comienzo del siguiente movimiento. En un programa de dos movimientos, primer paso muestra final del primero asociado a la línea del segundo; segundo paso no llega al destino final. Las líneas solo estado no son pasos.
- `reset` cambia índice/t/tiempo pero no restaura position, currentLine ni telemetría cuando está pausado. Reproducido después de seek al final: cursor 0, posición todavía X20.
- `singleBlock` se detiene por movimiento; un ciclo produce varios por línea. optionalStop/blockSkip se alternan en UI, pero no participan en la interpretación/reproducción. La barra `/` se elimina y su bloque se ejecuta.
- `setSource` intenta calcular nuevo stock, pero el spread posterior `...patch` restaura `workpiece` original. Autodetección de origen y stock tampoco corresponde al setup de torno.
- `telemetryAt` define corte por no-rápido y Z negativo; no considera contacto radial, stock o encendido de husillo.

### P1 — Geometría y precisión

- `arcInfo` recorta `r²-(d/2)²` a cero. `G02 X10 Y0 R1` desde origen produce radio 5 sin advertencia. No valida todos los arcos imposibles; bounds solo de extremos no incluyen necesariamente máximos de un arco.
- F se convierte antes de procesar G20/G21 del mismo bloque: `G20 F1` deja feed=1 en lugar de 25,4 mm/min. G00 se estima a 5000 mm/min en parser y 8000 en store; catálogo contiene otras velocidades sin gobernar el cálculo.
- `buildToolpathLines` concatena avances discontinuos. Repro: `G01 X1 / G00 X10 / G01 X11` entrega puntos X=[0,1,11], dibujando un avance inexistente entre X1 y X11. Reemplazar por segmentos independientes.
- Remoción circular usa solo diámetro, no forma completa de herramienta ni orientación de inserto; no reutilizarla como remoción de torno.
- Memoria heightmaps: `(moves+1) × 121² × 4` bytes, aproximadamente 55,9 MiB por 1000 movimientos y 559 MiB por 10.000, antes de geometría/overhead. Coste de precálculo en el hilo de UI. Para perfil futuro usar checkpoints/deltas o recomputación acotada.

### P1 — Calidad de build y dependencias

- `next.config.ts` tiene `ignoreBuildErrors:true` y StrictMode desactivado. CI build-check solo instala y compila; no ejecuta lint, tipos explícitos ni tests.
- Errores reales de tipos en store y TOOL_FALLBACK; componentes redimensionables mezclan API antigua y nueva; varias primitivas shadcn importan paquetes no declarados.
- `bun.lock` existe, workflows usan Bun latest y `bun install` sin modo frozen. No hay toolchain Rust ni gestor JS fijado.

### P2 — Persistencia, alcance y publicación

- `programStore.saveProgram` devuelve un programa aunque writeAll silencie una cuota o almacenamiento bloqueado. Validación de importación es básica y no comprueba todas las restricciones numéricas. Preservar programas legacy y comunicar fallos.
- `layout.tsx` contiene un script remoto de analytics y metadatos/verificación/canonical del autor. Google Fonts se obtiene en build. El cálculo principal es cliente, pero eso no prueba operación completamente offline ni ausencia de solicitudes externas. Revisar identidad/telemetría en el futuro proyecto.
- `public/` incluye verificaciones, sitemap, robots, manifest y marca original. Separar atribución de reutilizar identidad o configuración de despliegue.
- `.github/workflows/dependabot-autopilot.yml` automatiza revisión/merge, condicionado al propietario original. No habilitarlo inadvertidamente en el derivado; política de actualización propia y checks de semántica primero.

## Comprobaciones ejecutadas y límites

Entorno: Node v24.19.0 y pnpm 11.25.0 del runtime de Codex. No había node/npm/bun/cargo/rustc/wasm-pack en PATH inicial. Se utilizó Node incluido; no se instaló Rust para una auditoría documental.

**Limitación de reproducibilidad:** se usó pnpm porque Bun no estaba disponible. `pnpm install --lockfile=false` resolvió rangos, no reprodujo bun.lock: Next 16.4.2 frente a 16.1.3 del lock; react-resizable-panels 4.14.6 frente al lock existente; TS 5.9.3. Esta es una línea base exploratoria, no una certificación del entorno upstream. Repetir con Bun fijado y frozen lockfile es el primer trabajo preparatorio. No se modificó package.json ni el lockfile Bun. pnpm generó pnpm-lock.yaml y pnpm-workspace.yaml no versionados únicamente en la copia de inspección; no forman parte de la propuesta de proyecto.

| Comando / prueba | Resultado real |
|---|---|
| `git clone` y SHA | Correctos |
| `pnpm install --lockfile=false` | Código 1: paquetes instalados, script nativo unrs-resolver ignorado por política de pnpm |
| `pnpm run lint`, `pnpm exec tsc ...`, `pnpm run build` | Código 1 previo al comando: pnpm intentó reinstalar y volvió a bloquear ese script |
| Binario directo `./node_modules/.bin/next build`, basePath vacío | Código 0, salida estática generada; omitió validación de tipos según configuración |
| Binario directo `./node_modules/.bin/tsc --noEmit --incremental false` | Código 2, 20 diagnósticos: paquetes ausentes en websocket/UI, API paneles, fallback de herramienta, setMaterial duplicado y estrechamiento booleano de playing |
| Binario directo `./node_modules/.bin/eslint .` | Código 1, dos errores react-hooks/set-state-in-effect en carousel.tsx y use-mobile.ts |
| Sondas de parser | 9 entradas ejecutadas; reproducen fin ignorado, M desconocido, basura, G71, unidades/F, radio imposible, slash, eje duplicado y G decimal redondeado |
| Sondas de store/geometría | Reproducidos paso final inaccesible, reset desincronizado y unión incorrecta de trayectoria |
| Recorrido de ejemplos | 28 ejemplos parseados con 0 errores, 0 warnings y extremos finitos; no demuestra que sus geometrías sean correctas |
| Suite de tests upstream | No existe en el snapshot; no se declaró una ejecución exitosa |
| WASM/Rust, ruta torno, navegador/E2E/WebGL | No implementados ni ejecutados en esta fase |
| Build con basePath distinto de vacío | Pendiente; se propone como gate para integración |

Logs y sondas están en `docs/evidence/`. Las sondas documentan comportamiento observado, no son la suite de aceptación del futuro motor. `probe-state.mjs` transpila módulos a un directorio temporal dentro del clone, ejecuta lógica sin UI y lo elimina al terminar. No modifica fuentes.

Reproducción, con Node moderno en PATH y dependencias del clone disponibles:

```sh
node --experimental-strip-types docs/evidence/parser-probes.mjs /ruta/al/clone
node docs/evidence/probe-state.mjs /ruta/al/clone
cd /ruta/al/clone
./node_modules/.bin/eslint .
./node_modules/.bin/tsc --noEmit --incremental false
NEXT_PUBLIC_BASE_PATH='' ./node_modules/.bin/next build
```

## Conclusión técnica

El mayor valor reutilizable está en la interfaz, edición, biblioteca y estructura cliente estática. Parser, modelo de stock, remoción y reproducción requieren semántica propia para torno. Rust es adecuado como núcleo independiente y testeable; no aporta precisión automáticamente: la aportan el dialecto explícito, los fixtures y un contrato que impida ignorar errores. La ruta de menor riesgo es un módulo de torno paralelo, preservando fresado y extrayendo UI en pasos revisables.
