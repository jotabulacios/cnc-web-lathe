# Continuidad del proyecto — 20 de octubre de 2026

**Punto de entrada vigente para otra IA:** [HANDOFF_COMPLETO_2026-10-22.md](HANDOFF_COMPLETO_2026-10-22.md). Reúne el estado actual, el corte exacto de la tarea y los comandos. Las entradas históricas inferiores no reemplazan ese estado.

**Kernel siguiente ya preparado:** TOOL_REFERENCES.md (matemática nativa aislada,142 pruebas Rust totales). Correctores todavía sin integrar. WORK_LOG.md registra cada cierre y verificación del binario final.

**Última entrega:** conjuntos dimensionales educativos y corrección de diagnóstico móvil. Ver TOOL_ASSEMBLIES.md, WORK_LOG.md y TOOL_OFFSETS_PLAN.md. Las entradas siguientes son hitos anteriores.

**Actualización vigente:** refrentado tubular integrado, práctica nueva y catálogo total 13. Leer [log de trabajo](WORK_LOG.md), [operación](TUBULAR_FACING.md) y el inicio de HANDOFF.md antes de las entradas históricas siguientes.

Este documento es el punto de entrada para retomar el trabajo. Leer después `PROJECT.md` y `AGENTS.md` en la raíz. El usuario pidió conservar un registro antes de agotar el contexto.

## Estado actual prioritario

22/10/2026, ampliación educativa posterior: doce prácticas, con mandrinado evaluado, rápido a través de pared y retirada corregida por agujero. Tabla de comparación actual/referencia en cada paso, volumen medido desde geometría y confirmación final coherente con el último snapshot del DRO. Ver GUIDED_ANNULAR_PRACTICES.md y el inicio de HANDOFF.md. Entrega verificada:129Rust,133TS,22WASM,64E2E raíz y64subruta correctos; gates/builds correctos, raíz restaurada y preview/respaldos renovados. Oráculo racional de28.672trayectorias y plan NEXT_TUBULAR_FACING.md añadidos. El motor Rust/WASM del producto se preservó; los pendientes de prácticas en secciones inferiores son históricos.


22/10/2026, integración posterior: tubo/T5/mandrinado ya funcionan en la app. Ver TUBULAR_SIMULATION.md y la primera sección de HANDOFF.md. Nuevos compile_v2 y stock_profile_v3 aditivos; perfiles sólidos previos preservados. Input de diámetro interior, ejemplo boring.nc recuperable, SVG con hueco y malla con pared interior/tapas anulares, proyectosnuevosv2ydecoderlegacy. Contacto anular y precisión revisados con regresiones; las secciones inferiores que dicen «no disponible en pantalla» son históricas. Apariencia de herramientas sigue aplazada. Verificación final: 125 Rust, 112 TypeScript, 20 WASM y 61 E2E raíz/61 subruta correctos; gates/build correctos, raíz restaurada y preview/respaldos renovados. Evidencia en docs/evidence/tubular-integration-2026-10-22/. agy Argon y Flash se lanzaron a pedido del usuario pero agotaron el plazo sin informe; no contarlos como revisión completada.


22/10/2026, incremento posterior al rendimiento: base Rust de material tubular implementada. Leer ANNULAR_MATERIAL.md y el inicio de HANDOFF.md. Nuevo annular_profile.rs y extensión LinearProfile::raise; corte interior/exterior, volumen anular estable, validación, paredes cruzadas y límites con conservación del original.22pruebas nuevas y fixture compartida de tres secciones.106Rust,89TS,18WASM y58E2E raíz(37,8s) correctos; fmt/Clippy/typecheck/ESLint/build correctos. Evidencia annular-material-2026-10-22. Preview3100 actualizado y respaldos renovados. Subruta no repetida porque no cambian UI/rutas/ABI; conservar evidencia anterior.

El tubo y mandrinado aún NO están disponibles en la pantalla: falta contacto de movimientos contra paredes interior/exterior, reconstrucción de prefijos, herramienta/contrato versionado, WASM, proyecto y vistas. No confundir API geométrica Rust con operación CNC habilitada; no cambiar T1–T4 ni agregar T5 sin decidir compatibilidad. La fixture nueva no es una práctica G-code. El pulido visual de herramientas sigue aplazado.


22/10/2026: rendimiento medido, editor con filas visibles y alineación de barras nativas corregida. Entrega del 22/10/2026 cerrada: typecheck, ESLint y 89 pruebas TypeScript correctos; 58 E2E Chromium en raíz (46,1 s) y 58 bajo /cnc-edu/ (45,9 s) correctos, incluida apertura íntegra de 9000 líneas, selección Unicode/tabulación, resize y alineación visible con barras de 15 px. Cuatro casos de rendimiento adicionales correctos en raíz y cuatro en subruta (5,3 s cada lote). Export raíz restaurado, preview 3100 actualizado y servidor restablecido. HTTP 200 y MIME correctos para HTML/JS/WASM. QA real en pestaña nueva: documento de 1001 líneas, 33 filas dibujadas, G71 seleccionado en línea 999 y diferencia vertical de 0 px entre código y numeración. Captura outputs/torno-editor-largo-2026-10-22.png. Evidencia docs/evidence/performance-2026-10-22/. Sin cambios de semántica Rust/ABI ni apariencia de herramientas. Las 84 pruebas nativas y 18 WASM de la entrega anterior no se repitieron; se conservan sus logs, y el benchmark ejecutó el binario WASM real con nuevos casos. Fuentes y preview respaldados y ZIPs comprobados al cerrar. El usuario preguntó por la referencia de Amer Icon; ver REFERENCE_LATHE_SIM.md para la ruta a interiores, ranuras, puestas y mordazas. El pulido visual de herramientas continúa aplazado. Las entradas inferiores describen hitos anteriores.

Prácticas de diagnóstico terminadas. Entrega cerrada: 84 pruebas Rust, 89 TypeScript y 18 WASM real correctas; fmt, Clippy, typecheck y ESLint correctos. Builds estáticos y 57 E2E Chromium raíz (35,7 s) y 57 bajo /cnc-edu/ (38,3 s) correctos, incluida persistencia de la práctica. Export raíz restaurado y preview 3100 actualizado. QA real en pestaña nueva: SPINDLE_OFF en línea 4, selección G01 Z-20 F120, perfil congelado tras 3 bloques; corrección recorrida 8/8 con perfil confirmado; G71 seleccionado y ejecución bloqueada. Evidencia docs/evidence/diagnostic-practices/, capturas outputs/torno-diagnostico-husillo.png y torno-diagnostico-codigo.png. Sin ampliación de códigos ni cambios a semántica Rust o ABI WASM. ZIPs de fuentes y preview renovados y comprobados al cerrar. Ver DIAGNOSTIC_PRACTICES.md; el plan NEXT_INCREMENT.md ya se implementó. El usuario pidió dejar el aspecto de herramientas para después.

Atajos y arranque del editor terminados. Entrega final de teclado y arranque: 85 TypeScript, typecheck y ESLint correctos; 55 E2E Chromium raíz (33,3 s) y 55 subruta /cnc-edu/ (34,4 s) correctos, incluida la carga JS demorada. Export raíz restaurado y preview 3100 publicado; HTML, JS y WASM responden 200 con MIME correctos. QA real: recargar, editar inmediatamente T1/T2/M30, interpretar con Ctrl+Enter y avanzar con F8 conserva el texto y llega a T1 en 1/3; avance posterior muestra T2 en 2/3. F8/Mayús+F8 también comprobados en navegador. Evidencia docs/evidence/shortcuts/. Rust/WASM no se modificaron respecto de las 82/17 pruebas previas. Captura outputs/torno-atajos-ejecucion.png. Fuentes y preview respaldados y ZIPs comprobados al cerrar. Ver EXECUTION_SHORTCUTS.md y NEXT_INCREMENT.md para continuar. Las cifras de las secciones inferiores corresponden a hitos previos.

Herramientas visibles: catálogo T0–T4, figuras compartidas con 2D, etiqueta en la punta y ampliación del plano de escritorio. Entrega cerrada: 85 pruebas TypeScript, typecheck y ESLint correctos. Build estático y 52 E2E Chromium correctos en raíz (32,5 s) y 52 bajo /cnc-edu/ (33,0 s); export raíz restaurado y preview local 3100 actualizado. Rust y WASM no se modificaron: la evidencia anterior de 82 Rust y 17 WASM sigue en guided-operations/. QA en pestaña nueva: selección T2, ampliación del plano y cambios T1/T2/T3/T4 reales; punta T4 al bloque 4/5 mientras T2 permanece inicial. Clic sobre la inicial ya elegida conserva el cursor. Capturas outputs/torno-herramientas-2d-t2.png y torno-herramientas-2d-t4.png. Evidencia tools-2d/. Fuentes y preview respaldados en ZIP al cerrar. Ver TOOL_VISIBILITY.md.

Ampliación del catálogo a seis ejemplos: arco convexo y refrentado+cilindrado con cambios T. Referencias de arco mediante muestras y volumen analítico, independiente del número de cuerdas; comparación de herramienta final. Ver HANDOFF.md y GUIDED_EXERCISES.md. Entrega cerrada: 82 Rust, 85 TypeScript, 17 WASM y 50 E2E raíz + 50 subruta correctos; QA visual y preview 3100 actualizados. Logs guided-operations/. Las reparaciones previas están cerradas y sus logs fixes-2026 siguen válidos para ese hito. No rehacerlas.

## Ubicación y decisiones aceptadas

- Código activo: `/home/jotape/Documents/cnc-codex-starter`.
- Carpeta del chat: `/home/jotape/Documents/Codex/2026-10-20/quiero-convertir-este-fork-de-cnc`.
- Referencia original sin cambios funcionales: `work/upstream-cnc/` dentro del chat, procedente de `https://github.com/rudra496/cnc`, commit `b59fefb5043ce53ddd3adf34079398838a69729d`.
- Se eligió un repositorio independiente con reutilización selectiva, porque el torno diverge del simulador de fresado. Git local inicializado, sin remotes ni publicación. Los archivos siguen sin commit: conservarlos antes de cualquier limpieza.
- Frontend Next.js/React/TypeScript; núcleo Rust puro; wrapper WASM delgado. SVG para 2D; Three.js para superficie de revolución del perfil actual.
- Solo se adaptó el editor G-code del upstream. Licencia MIT y atribución preservadas en `THIRD_PARTY_NOTICES.md` y `licenses/`. Parser, reproducción y perfil son propios.

## Trabajo terminado

1. Auditoría real del upstream y documentos de arquitectura, dialecto, reutilización y plan incremental en `docs/`.
2. `crates/cnc-core`: scanner con procedencia, interpretación G00/G01, snapshots modales, X/Z absolutos, U/W incrementales. X/U en diámetro; radio físico interno. G21/G18/G98, F mm/min, S RPM, M03/M04/M05, M02/M30. Códigos no soportados producen diagnósticos; errores bloquean ejecución completa.
3. `crates/cnc-wasm`: exports `compile` y `stock_profile`, validación de peticiones y contrato versionado.
4. Adaptador TS y reducer de reproducción: revisión del documento, descarte de resultados obsoletos, paso/anterior/reset. El renderer no interpreta G-code.
5. Pantalla educativa de torno: editor, configuración editable del cilindro y origen, DRO, trayectoria, plato/herramienta esquemáticos, explicaciones y avisos. Corregidos resaltado y desplazamiento del editor para programas largos.
6. Perfil exterior ideal por tramos en Rust: cilindrado G01 a radio constante hacia Z negativo con husillo encendido y RPM positivas. Recomputación determinista al retroceder o reiniciar. Se muestra material restante y retirado.
7. Fixture `fixtures/lathe/two-step-turning.nc`: 13 bloques; resultado final Ø50 entre Z−100/−40, Ø40 entre −40/−20 y Ø30 entre −20/0. El programa anterior diagonal queda como regresión del intérprete y perfil parcial.

## Límites reales actuales

Perfil v2 admite cilindrado/conos, arcos monótonos en Z por cuerdas y refrentado frontal hasta X0. No admite radiales parciales o avance inverso que retiren material, compensación de punta, offsets, ciclos ni CAM. Herramientas ilustrativas; punta ideal en geometría. Hay persistencia local, nueve prácticas guiadas (siete positivas y dos diagnósticos) y 3D de revolución, sin simulación volumétrica ni validación de máquina real. Ver ARC_DIALECT.md para precisión perpendicular, clasificación real del contacto y limitación al repetir ciertos arcos. Ante operaciones no resolubles conserva el último bloque confiable con advertencia.

## Evidencia de la entrega de perfil

- 24 pruebas Rust: 1 unitaria, 12 de intérprete y 11 de perfil.
- 23 pruebas TypeScript y 7 pruebas sobre el WASM real.
- fmt, clippy con warnings como errores, typecheck, ESLint y build estático correctos.
- Recorrido manual en navegador: cortes de ambos escalones, anterior, reset, aviso de corte diagonal y final M30.
- Logs en `docs/evidence/profile-*.log`. Estos resultados corresponden a la entrega de perfil; no certifican cambios posteriores ni CI remota.

## Historial de verificación de las primeras entregas

La entrega de E2E quedó implementada y comprobada: Playwright 1.64.1, seis casos Chromium sobre el export estático y WASM real, todos correctos en raíz y bajo `/cnc-edu/` (12 ejecuciones). Scripts, servidor de pruebas e integración CI están en el código. Consultar `E2E_BROWSER.md` y `evidence/e2e-*.log`. CI remota aún no ejecutada.

Incremento actual: reproducción automática por bloques implementada con pausa y velocidades didácticas. agy aportó una propuesta del reducer/pruebas; se revisó y ajustó antes de integrarla. Ver AUTOMATIC_PLAYBACK.md. Verificación final: typecheck, ESLint y 29 pruebas TS correctas; 11 E2E correctos en raíz y 11 bajo /cnc-edu/. Se agregó además regresión de reintento del glue JavaScript, que pasó con el cargador existente en Chromium. Los exports Next para ambas rutas se compilaron correctamente. Evidencia: evidence/autoplay-*.log. No se modificó el núcleo Rust en esta entrega.

Incremento posterior: vista opcional de revolución Three.js implementada; ver REVOLUTION_3D.md. Verificación final: 34 pruebas TS, typecheck y ESLint correctos; 16 E2E correctos en raíz y 16 bajo /cnc-edu/. Se verificaron perfil por pasos, anterior/reset, alternancias, fallo de módulo/WebGL, contexto perdido y carga demorada. Export raíz restaurado para la vista local. Evidencia en evidence/revolution-*.log. El núcleo Rust sigue sin cambios.

Próxima entrega sugerida: revisar la UX 2D/3D con el usuario y agregar más ejercicios o mejorar el modelo de corte antes de sumar códigos. Mantener cada incremento pequeño. Arcos, offsets, ciclos, catálogos y CAM siguen pendientes; no asumirlos autorizados como una reescritura conjunta.

Se convocó OpenCode con `opencode/deepseek-v4.1-flash-free` para revisar E2E, y `agy` en modo plan para revisar continuidad/perfil. La revisión de agy terminó sin contradicciones sobre los archivos suministrados en el prompt; no ejecutó herramientas ni pruebas. OpenCode/DeepSeek completó la revisión E2E; se evaluaron sus observaciones y se conservaron sus límites. Una segunda revisión acotada de temporización no respondió dentro de 180 segundos y no se cuenta como completada. Ver EXTERNAL_REVIEWS.md para distinguir revisión de texto de evidencia de ejecución.

## Cómo levantar y verificar

Con Node 24.19, pnpm 11.25, Rust 1.99.1, target wasm32-unknown-unknown y wasm-pack 0.13.1:

```sh
pnpm install --frozen-lockfile
pnpm build:wasm
pnpm dev
```

Abrir `http://127.0.0.1:3000`, pulsar «Interpretar programa» y avanzar. Existe además una vista estática de esta sesión en `http://127.0.0.1:3100/`; comprobar que siga vivo el servidor antes de usarla. No es una publicación pública.

```sh
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
pnpm check
pnpm build
pnpm test:wasm
```

En este equipo los runtimes no están necesariamente en PATH. Node está en `/home/jotape/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin`; pnpm en `dependencies/bin/fallback` del mismo runtime. La instalación Rust de esta sesión está en `work/toolchain/cargo` y `work/toolchain/rustup` dentro del chat; definir CARGO_HOME y RUSTUP_HOME a esas rutas y agregar el bin de Cargo al PATH sin cambiar la configuración global.

## Entregables y precauciones al retomar

Las copias para el usuario están en `outputs/docs/`, `outputs/cnc-web-lathe-source.zip` y `outputs/cnc-web-lathe-preview.zip` dentro del chat. El ZIP fuente excluye dependencias y WASM generado; el preview incluye el export estático compilado. Regenerarlos después de cada entrega para evitar divergencias.

No reiniciar desde cero ni reemplazar archivos por el upstream. No borrar trabajo sin commit. No modificar el clon de referencia. No hacer push, deploy ni configurar remotes sin autorización explícita. Las pestañas previas del navegador pueden contener programas editados por el usuario; abrir una pestaña separada para QA.


## Trabajo continuo solicitado posteriormente

El usuario pidió seguir trabajando hasta que indique parar. No detener el desarrollo solo por completar un incremento; mantener entregas verificadas y este documento actualizado.

Después de la entrega de revolución se agregó herramienta 3D: marcador de punta y cuerpo ilustrativo, sincronizado con X/Z de Rust; 35 pruebas TS y 16 E2E raíz correctos en esa entrega (tool-three-*.log). La posición física usa radio, no vuelve a dividir X. La herramienta lejana se oculta y se indica fuera del encuadre; no es prueba de colisión.

Incremento en curso: tres ejemplos guiados (cilindrado, dos escalones, U/W), manifiesto en fixtures/lathe/exercises.json, módulos exercises.ts y GuidedPractice.tsx. Los ejemplos cargan código completo; no son autograder de soluciones libres. La comprobación usa resultados Rust actuales y se revoca al editar o retroceder. Hay una copia recuperable del programa y setup/borrador (incluido inválido) en memoria, intercambiable para deshacer recuperación. El usuario preguntó por la herramienta durante este incremento; se priorizó e implementó, luego se retomaron ejemplos.

Ejemplos cerrados: 40 pruebas TS, 25 Rust y 8 WASM correctos, clippy y builds correctos; 19 E2E en raíz y 19 en subruta. Se verificó U/W manualmente y se corrigió la etiqueta de archivo/Restaurar para que sigan el ejemplo activo. Ver GUIDED_EXERCISES.md. Siguiente incremento: manejo local de proyectos/programas con formato JSON versionado y guardado explícito en navegador. Sin autosave que pise trabajo, sin backend y sin importar resultados ejecutados. No iniciar arcos/ciclos sin especificar su geometría/dialecto y pruebas.


## Incremento local de proyectos — completado

Se implementaron project.ts (codec JSON estricto, límites, adapter storage) y ProjectActions.tsx (guardado/recuperación explícitos, descarga y archivo). Entrega cerrada: 44 pruebas TS, typecheck/lint/builds correctos; 24 E2E en raíz y 24 en /cnc-edu/. Ver LOCAL_PROJECTS.md. Se extrajeron LabDocument/copia/reemplazo/sameSetup a document.ts para compartir con ejercicios. SetupSchema ahora se exporta de contract.ts y se reutiliza en catálogo y proyectos (límites del setup editable, X inicial en diámetro <=1e9). Los imports de LatheLab/tests fueron actualizados. Las lecturas de archivo se guardan con requestId y documentVersion incrementado sincrónicamente al editar, configurar, cargar o compilar. No se restaura cursor/resultados ni se autoejecuta.

Se agregaron unit tests de codec/storage (roundtrip, límites UTF8, versiones/campos extra, draft válido incoherente e inválido preservado) y E2E local reload/export-import/quota/archivo corrupto/lectura obsoleta. Los casos nuevos pasaron. El checkpoint de ZIP se actualiza al cerrar cada incremento. Próxima mejora: límite temporal y reintento de carga del motor para que una red colgada no deje «Preparando» indefinidamente; separar la política de carga de la semántica CNC y probar abortos/resultados tardíos. Mantener la continuidad del trabajo hasta que el usuario indique parar.


## Incremento de carga WASM — completado

Se agregaron loader.ts (createTimedLoader), tests/loader.test.ts (4 casos), dos E2E al final de lathe.spec.ts para assets colgados, y WASM_LOADING.md. engine.ts ahora usa deadline20s, AbortController/fetch controlado y ArrayBuffer (API generada admite BufferSource, comprobada en public/wasm/v1/cnc_wasm.d.ts). Glue retry con ?attempt=N y checks de abort después de cada etapa. 48 pruebas TS, typecheck/lint/builds y 26 E2E en cada ruta correctos. Los ZIP se refrescan al cerrar cada incremento.


## Servidor de preview estable — importante

Se cambió únicamente el servidor de preview creado en esta sesión: ahora 127.0.0.1:3100 sirve `work/preview/` del chat, no el `out/` que los builds borran temporalmente o reemplazan por una subruta. Sesión exec actual 80172. Servidor: `python3 -m http.server 3100 --bind 127.0.0.1 --directory work/preview` desde el chat.

Después de un build RAÍZ correcto, ejecutar `python3 work/publish_preview.py` desde el chat para actualizar la vista. El script copia assets de forma atómica, mantiene hashes anteriores para pestañas ya abiertas y publica index.html al final. Rechaza el build /cnc-edu/. Las verificaciones bajo subruta pueden usar out/ sin interrumpir el puerto3100. Se verificaron HTTP200 de HTML/assets y MIME del WASM. No se tocaron pestañas/programas del usuario ni datos guardados locales.


## Registro histórico: editor desde diagnósticos

Implementados editorLocation.ts/editorSelection, focusRequest con revisión en GCodeEditor, botones de diagnósticos de programa/perfil y normalización LF en document.ts/LatheLab. 52 pruebas TS, typecheck/lint/build y 29 E2E en raíz correctos; QA visual confirmó selección de G71 y fila roja sin cambiar el texto. Subruta en curso. Codec JSON conserva fuente; al aplicar al editor se normalizan CRLF/CR porque el DOM ya lo hace, evitando diferencias con los bloques que ve Rust. Se actualizó la comparación de documentos y de original del ejercicio. Últimos ZIP: deadline/carga completados, anteriores a este incremento.

Tests puros y E2E agregados y correctos en raíz. Siguiente: leer work/editor-subpath-build.log y ejecutar E2E con NEXT_PUBLIC_BASE_PATH=/cnc-edu; luego restaurar build raíz, publicar snapshot con work/publish_preview.py, QA visual y actualizar docs/ZIP. No servir out directamente en3100.


## Apertura de programas y punto de partida del perfil cónico

ProjectActions comparte su guardia de solicitudes entre JSON, G-code y guardado local. programFile.ts decodifica bytes UTF-8 estrictos, retira BOM y normaliza saltos; no interpreta códigos. Tres tests puros y cuatro E2E nuevos. Vista estable en3100 sirve work/preview, independiente de builds de subruta. Publicar solo export raíz mediante work/publish_preview.py. agy recibió revisión de archivos pero terminó sin respuesta por timeout90s, no validación completada. Un subagente local revisa diseño del próximo perfil cónico sin editar archivos.


## Perfil v2: punto de retoma durante integración

Nuevo kernel linear_profile.rs con presupuesto acumulado y lower envelope. profile_v2.rs reconstruye prefijos y transacciones por bloque. stock_profile_v2 export aditivo, stock_profile sigue legacy. Schema/adaptador computeStockProfileV2 y ProfileResponseV2; consumidores UI migrados a v2 en archivos locales, sin publicación aún. profilePathV2.ts proyecta extremos radiales y gaps. Agente taper_mesh implementó revolutionV2.ts/tests, revisados e integrados a threeScene. Perfil de ejercicios acepta ambas versiones y compara ambos extremos contra los ejemplos cilíndricos actuales. Fixtures taper-turning.nc8bloques no está en catálogo todavía. Tests de perfil parcial en navegador cambiados de diagonal (ahora soportada) a radial (todavía limitado); no se eliminó cobertura. tests/e2e/taper.spec.ts tiene3 casos nuevos: volumen/rewind/reset, ápice y ambigüedad numérica con perfil congelado. Próximo: ver logs profile-v2-ui-* y corregir cualquier error; root build/E2E, subruta, restaurar raíz, QA manual, docs, publicar preview y ZIP.


## Perfil cónico v2 — incremento cerrado

La verificación pendiente quedó completada sin reimplementar nada: `NEXT_PUBLIC_BASE_PATH=/cnc-edu pnpm build:web` seguido de `pnpm test:e2e` con el mismo prefijo dio 36 casos correctos (18,3 s), y el export raíz se restauró con `pnpm build:web` sin prefijo, con otros 36 casos correctos (18,0 s). Logs en `evidence/profile-v2-ui-e2e-subpath.log` y `evidence/profile-v2-ui-e2e-root.log`.

La QA visual se hizo sobre el export raíz, en una pestaña nueva para no tocar programas editados por el usuario, cargando `fixtures/lathe/taper-turning.nc` por la ruta real de «Abrir programa G-code» con el setup por defecto Ø50 × 100 mm. Resultado: tras 4 bloques la tabla muestra Ø50 entre −100/−60 y Ø20 → Ø40 entre −60/0; la malla 3D da 39000π mm³; retroceder un bloque devuelve el perfil del bloque 3 y avanzar otra vez restaura el volumen exacto; el reinicio vuelve al cilindro inicial. No hubo errores de consola ni de página.

Como el volumen de un tronco de cono es simétrico al invertirlo, el volumen por sí solo no distingue la dirección del cono. Se añadió un control: la silueta 3D medida sobre el canvas se comparó con un programa de cono invertido, que invierte la medida. La comprobación es por tanto sensible y la dirección del cono coincide entre la vista 2D y la 3D. Capturas en `outputs/torno-cono-2d.png`, `torno-cono-3d.png` y `torno-cono-interfaz.png`.

Documentación actualizada para reflejar el soporte de conos: README, STOCK_PROFILE_MODEL, REVOLUTION_3D, IMPLEMENTATION_STATUS, CONTINUIDAD y LINEAR_PROFILE_PLAN.

Pendiente para el siguiente incremento: publicar el snapshot raíz en 3100 con `work/publish_preview.py` y renovar los ZIP de entrega. Después, la mejora posible acordada es incorporar el fixture cónico al catálogo guiado, lo que exige evolucionar `expectedSpans` y su prueba nativa para radios inicial/final sin duplicar el intérprete en TypeScript. Los arcos G18 requieren elegir y verificar primero la semántica I/K/R.


## Cuarto ejemplo guiado: cono exterior — completado

Se incorporó el fixture cónico al catálogo como «Cono exterior» (8 bloques, Ø50 × 100 mm). `expectedSpans` ahora acepta dos formas: el tramo cilíndrico anterior (`radiusMm`) y el tramo lineal (`rStartMm`/`rEndMm`), mediante un `union` estricto de Zod. La comparación se extrajo a `expectedSpansMatch`, que resuelve el radio único o los dos extremos según la forma y aplica la misma tolerancia a ambos; `assessExercise` la usa, así que los tres ejemplos cilíndricos conservan su comportamiento.

La prueba nativa elige el camino según el catálogo: los cilíndricos se comparan contra `profile_at` (v1) y el cónico contra `profile_at_v2`, en todos los prefijos. La prueba equivalente sobre WASM real (`tests/wasm.test.ts`) hace la misma distinción: v2 para el cónico, v1 para los cilíndricos. Sigue sin haber un intérprete en TypeScript.

Resultado esperado del ejemplo: Ø50 entre Z−100 y Z−60, y cono de Ø20 en Z−60 a Ø40 en Z0; la tabla muestra «20 → 40». Una inversión del cono tiene el mismo volumen porque el tronco de cono es simétrico, pero no la misma geometría; hay un test que lo distingue y da `mismatch`.

Verificación: 46 pruebas Rust, 10 sobre WASM real, 69 TypeScript (dos nuevas), typecheck, lint, clippy y fmt correctos; 37 E2E en raíz y 37 bajo `/cnc-edu/`. El E2E nuevo recorre el ejemplo, exige «Recorrido completo · perfil confirmado», comprueba la fila «20 → 40» y el volumen 39000π, y revoca la confirmación al retroceder. QA visual manual en pestaña nueva, sin errores de consola: capturas en `outputs/torno-cono-ejemplo-guiado.png`, `torno-cono-ejemplo-2d.png` y `torno-cono-ejemplo-3d.png`.

Documentación actualizada: README, STOCK_PROFILE_MODEL, IMPLEMENTATION_STATUS, LINEAR_PROFILE_PLAN, GUIDED_EXERCISES, ISSUE_CHECKLIST y HANDOFF. Snapshot raíz publicado en 3100 y ZIP renovados.

Próxima capacidad sugerida: arcos G02/G03 en G18. Requiere fijar antes la semántica I/K/R, el sentido de giro con X en diámetro y el plano, y verificarla contra el dialecto elegido antes de escribir el kernel.



## Arcos G02/G03 — incremento 4.1 completado

Con el objetivo de `PROJECT.md` a la vista («arcs, offsets and more operations incrementally»), se pidió a agy/Gemini 4 Argon un memorando de decisión en modo plan y solo lectura. El informe quedó en el workspace del chat (`work/agy-arcs-plan.log`, 58 líneas) y coincidió en el orden: arcos antes que offsets. Se aceptaron sus puntos sobre I/K incremental, I radial, validación y aplanado futuro; se corrigieron su tolerancia elegida sin fundamento, la mezcla de 4.1 con remoción y una suposición sobre la torreta que no había verificado contra el viewport real.

La convención quedó escrita en `docs/ARC_DIALECT.md`: G02 horario y G03 antihorario vistos desde +Y, con Z a la derecha y X (radio) arriba; `I` radial y `K` axial, ambos incrementales al inicio del bloque y no modales; `ε_arc = 1e-6 mm`; el barrido se normaliza al arco menor a 360°. Se rechazan arco completo, centro inválido, radio inconsistente, I/K fuera de G02/G03 y arcos cuyo barrido cruza el eje. No se implementa `R`: es ambiguo cerca de 180° y desplaza el centro cuando el punto final no cierra.

El incremento se partió deliberadamente en dos. En 4.1 el intérprete resuelve la geometría, el contrato TS la valida con `superRefine`, el DRO y la explicación muestran G02/G03 con centro, radio y barrido, y la vista 2D dibuja el arco con el comando SVG `A`. El perfil de material **no** aproxima el arco por su cuerda: v1 y v2 se congelan antes del primer bloque de arco con `ARC_IN_PROFILE`, aunque el arco esté en el aire, porque todavía no se puede demostrar que no remueva material. La trayectoria y el stepping siguen funcionando.

El `sweep-flag` del SVG es `clockwise ? 1 : 0` porque el eje Y del SVG crece hacia abajo. Se verificó visualmente en un contexto nuevo: el G03 convexo de Ø40 a Ø20 se dibuja hacia arriba-izquierda y el G02 cóncavo de Ø60 a Ø40 hacia la esquina del material, ambos del lado correcto. El encuadre incluye la caja de la circunferencia completa para no recortar el vientre.

Verificación: 57 pruebas Rust (11 nuevas en `crates/cnc-core/tests/arcs.rs`), 11 sobre WASM real, 72 TypeScript, typecheck, ESLint, clippy y fmt correctos; 39 E2E Chromium en raíz y 39 bajo `/cnc-edu/`. Logs en `docs/evidence/arcs-*.log`.


## Remoción de material para arcos — incremento 4.2 completado

Implementado, verificado y publicado:

- **Aplanado determinista por cuerdas**: arcos monótonos en Z se aproximan en el perfil v2 por cuerdas inscriptas con tolerancia geométrica perpendicular $\delta = 0.01\,\text{mm}$ (`ARC_CHORD_TOLERANCE_MM`) y un presupuesto de hasta 512 segmentos (`MAX_ARC_SEGMENTS`). La tolerancia se mide perpendicular a la cuerda, no unidimensionalmente en el radio, asegurando volumen analítico coherente.
- **Monotonicidad y corte**: solo se aplanan arcos monótonos en Z. Si un arco contiene una inversión axial o sobrepasa los 512 segmentos, el bloque congela transaccionalmente con `ARC_IN_PROFILE` o `PROFILE_LIMIT`. Arcos en el aire no tocan el stock ni exigen husillo; arcos que penetran exigen husillo encendido y RPM positivas.
- **Visualización 2D y 3D**: `LatheLab` muestra los últimos 20 tramos lineales con aviso explicativo. La vista 3D genera la revolución por frustos con volumen cercano al analítico (ej. G03 convexo: 186875,13 mm³ vs 186885,38 mm³, error relativo $5.48 \times 10^{-5}$).
- **Compatibilidad legacy**: `profile_at` v1 mantiene intacto su congelamiento en `ARC_IN_PROFILE`. Se preserva el contrato v2 sin agregar un v3.

Verificación completa: **61 pruebas Rust** (15 en `arcs.rs`), **12 pruebas sobre WASM real**, **72 pruebas TypeScript**, typecheck, ESLint, clippy y fmt correctos; **40 E2E Chromium en raíz y 40 bajo `/cnc-edu/`**. QA visual automatizado en snapshot publicado en 3100 sin errores de consola ni de página. Capturas en `outputs/torno-arco-4.2-*.png` y logs en `docs/evidence/arcs-v2-removal-*.log`. Export raíz restaurado, preview actualizado y ZIP renovados.


## Refrentado frontal (Facing) — incremento 5.1 completado

El usuario solicitó avanzar con nuevas features funcionales de máquina. Se convocó previamente a OpenCode con `deepseek-v4.1-flash-free` en modo lectura para auditar la base de código; recomendó el refrentado frontal pasante hasta X0 como la operación de mayor valor funcional y menor fricción arquitectónica.

Implementado, verificado y publicado:

- **Operación `face_to(z_cut)` y `max_radius_in` en `LinearProfile`**: todo el material en $[z_{\text{corte}}, 0]$ es reemplazado por tramos de radio cero, estableciendo la nueva cara frontal en $Z = z_{\text{corte}}$.
- **Intérprete y perfil v2**: movimientos `G01` puramente radiales hacia el centro (`from.r_mm > to.r_mm`) que llegan exactamente a $X0$ (`to.r_mm == 0.0`) dentro de $-L < z_{\text{corte}} \le 0$ son admitidos como refrentado. Exigen husillo encendido (`M03`/`M04`) si cortan material y que la herramienta arranque en o fuera del material existente en esa zona. Movimientos radiales en el aire o en zonas ya refrentadas no requieren husillo ni alteran la pieza. Cortes parciales que no alcancen X0 siguen bloqueados con `UNSUPPORTED_PROFILE_CUT`.
- **Explicación didáctica y renderizado 2D/3D**: `explain.ts` detalla el refrentado frontal. La vista 2D SVG omite el tramo de radio cero del polígono de material y la vista 3D genera la cara frontal en $z_{\text{corte}}$ con volumen analítico exacto ($61875\pi\,\text{mm}^3$ para 1 mm de refrentado en Ø50, error relativo $1.5 \times 10^{-16}$). Pasadas de cilindrado posteriores cortan normalmente sobre la pieza refrentada.
- **Verificación completa**: **65 pruebas Rust** (14 en `linear_profile.rs`, 11 en `profile_v2.rs`), **13 pruebas sobre WASM real**, **73 pruebas TypeScript**, typecheck, ESLint, clippy y fmt limpios; **42 E2E Chromium en raíz y 42 bajo `/cnc-edu/`**. QA visual automatizado en Chromium sobre `:3100` con capturas en `outputs/torno-refrentado-*.png`. Documentación en `docs/FACING_DIALECT.md` y logs en `docs/evidence/facing-*.log`. Export raíz restaurado, preview actualizado y ZIPs renovados.


## Biblioteca de herramientas y llamadas T/M06 — incremento 5.2 completado

El usuario solicitó continuar de forma autónoma con nuevas capacidades de torno. Se implementó la biblioteca de herramientas educativas y el soporte completo de llamadas a herramientas según la convención Fanuc / ISO de torno.

Implementado, verificado y publicado:

- **Sintaxis Fanuc / ISO**:
  - Formato 4 dígitos `Tsstt` (estación `ss` 01..99 y corrector `tt` 01..99). En `edu-lathe-v1` se exige `ss == tt`: `T0101`, `T0202`, `T0303`, `T0404`, y `T0000` (cancela herramienta / vuelve a neutra). Offset discrepante emite `INVALID_TOOL_OFFSET`.
  - Formatos directos 1 y 2 dígitos: `T1`, `T01`, `T2`, `T02`, `T3`, `T03`, `T4`, `T04`, `T0`.
  - Código de cambio `M06` (grupo modal `"tool_change"`): admite `T0101 M06`, `M06 T0101`, o `M06` aislado.
  - Diagnósticos controlados: `INVALID_TOOL_NUMBER` (flotantes, negativos o >9999), `INVALID_TOOL_OFFSET` (offset inconsistente), `UNSUPPORTED_TOOL` (estaciones > 4), `DUPLICATE_WORD` (más de una palabra T por bloque) y `MODAL_CONFLICT` (doble M06).
- **Catálogo de 5 herramientas educativas**:
  1. `generic-od` (T0/T0000): Neutra exterior (por defecto en setup).
  2. `roughing-od` (T0101/T1): Desbaste exterior romboidal 80° (CNMG).
  3. `finishing-od` (T0202/T2): Acabado exterior romboidal agudo 55° (DNMG).
  4. `grooving-od` (T0303/T3): Ranurado y tronzado recto 3 mm.
  5. `facing-od` (T0404/T4): Refrentado frontal trigonal 80° (WNMG).
- **Persistencia modal y retrocompatibilidad**:
  - `State` en Rust usa `#[serde(skip_serializing_if = "Option::is_none", default)] pub tool_id: Option<String>` para no alterar fixtures JSON previos (`first-program.result.json` sigue coincidiendo al 100% byte por byte).
  - Cada `Motion` recibe el `tool_id` activo del bloque.
  - En TypeScript: `toolIdSchema = z.enum(...)`, validado en `setupSchema`, `state` (nullish) y `motion`.
- **Adaptaciones visuales y de UI**:
  - `LatheViewport` renderiza geometrías y colores específicos de inserto: rombo 80° dorado, rombo 55° cian, cuchilla recta naranja y trígono 80° púrpura; conserva el marcador de punta ideal con `data-testid="tool-marker"` y `data-tool-id`.
  - `LatheThreeView` y `threeScene` actualizan dinámicamente el color del inserto y el atributo `data-tool-id` en el canvas 3D.
  - `LatheLab` agrega lectura de herramienta activa al DRO de telemetría (`data-testid="dro-tool-name"` y `dro-tool-code"`) y en el resumen de pieza/setup.
  - `explain.ts` explica el cambio de herramienta y el inserto seleccionado.
- **Verificación completa**:
  - **66 pruebas Rust** (incluyendo `tests/tools.rs` con 5 pruebas exhaustivas).
  - **14 pruebas WASM** (incluyendo `WASM supports tool library calls, updates state modal toolId and assigns toolId to motions`).
  - **74 pruebas TypeScript** (incluyendo `tests/tools.test.ts`).
  - **43 E2E Chromium en raíz y 43 bajo `/cnc-edu/`** (incluyendo `tests/e2e/tools.spec.ts`).
  - QA visual en `:3100`: capturas `torno-herramientas-2d-t01.png`, `torno-herramientas-2d-t03.png`, `torno-herramientas-3d.png` en `outputs/`.
  - Preview publicado en `:3100`, export raíz restaurado y ZIPs verificados con `publish_preview.py` y `update_artifacts.py`.


## Revisión independiente, reparación y selector inicial — entrega cerrada

La revisión encontró persistencia rota por draft.toolId, lint fallido, clasificación de arcos por cuerdas que ocultaba penetración, falsos avisos al repetir refrentado, ancho de T perdido e inconsistencia nativo/WASM en X0. Se corrigieron todos y se agregaron regresiones; ver REVIEW_FIXES_2026-10-20.md. REVIEW_2026-10-20.md queda como registro histórico de los fallos anteriores, no estado actual.

Selector de herramienta inicial añadido en Pieza y origen, con invalidación por revisión y persistencia canónica. Guardados anteriores heredan setup.toolId; T mantiene semántica modal y puede reemplazar la herramienta desde su bloque. Se preservó el esquema estricto y la configuración válida durante borradores numéricos incompletos.

Verificación final real:82Rust,16WASM,79TS correctos; typecheck/ESLint/fmt/Clippy correctos;48E2E raíz(25.8s) y48subruta(25.4s). Raíz restaurada, publicación3100 conHTTP/MIME correctos. QA manual en pestaña nueva: T0202 inicial y primer cilindrado aX40/Z-40; 3Dfinishing-od, volumen53500π. Capturas enoutputs/torno-herramienta-inicial-corregida.png ytorno-correcciones-3d.png. Evidencia fixes-2026; ZIPs renovados.

Limitación explicitada y probada: repetir arco inferior puede congelar por residual entre círculo real y cuerdas, sin falsear el resultado. Las cotas de precisión documentadas son perpendiculares, no garantías radiales/volumétricas universales. Próximo incremento recomendado: ejercicios guiados de arcos/refrentado, antes de ciclos y compensación.


## Cierre: seis ejemplos guiados

Verificación final: 82 pruebas Rust, 85 TypeScript y 17 sobre WASM real correctas; typecheck, ESLint, fmt y Clippy correctos. Build estático y 50 E2E Chromium correctos en raíz (28,9 s) y otros 50 bajo /cnc-edu/ (28,6 s). Export raíz restaurado y preview local 3100 actualizado. QA manual en pestaña nueva: arco 9/9 con T0202, siete cotas y volumen 186875,13075798462 mm³ dentro de ±20 mm³ de la referencia; refrentado 13/13 con T0101 final, tramos Ø50/Ø40/Ø0 y volumen 57600π mm³. Capturas en outputs/torno-ejemplo-arco-guiado.png y torno-ejemplo-refrentado-guiado.png. Evidencia en docs/evidence/guided-operations/. Sin ampliación del intérprete ni del modelo de remoción.

Siguiente incremento propuesto: prácticas de diagnóstico de husillo apagado y código no soportado con explicación y navegación al bloque; no añadir aún ciclos o compensación.


## Cierre: herramientas visibles en 2D

Entrega cerrada: 85 pruebas TypeScript, typecheck y ESLint correctos. Build estático y 52 E2E Chromium correctos en raíz (32,5 s) y 52 bajo /cnc-edu/ (33,0 s); export raíz restaurado y preview local 3100 actualizado. Rust y WASM no se modificaron: la evidencia anterior de 82 Rust y 17 WASM sigue en guided-operations/. QA en pestaña nueva: selección T2, ampliación del plano y cambios T1/T2/T3/T4 reales; punta T4 al bloque 4/5 mientras T2 permanece inicial. Clic sobre la inicial ya elegida conserva el cursor. Capturas outputs/torno-herramientas-2d-t2.png y torno-herramientas-2d-t4.png. Evidencia tools-2d/. Fuentes y preview respaldados en ZIP al cerrar.

Archivos funcionales: LatheToolGlyph.tsx, ToolLibrary.tsx, LatheViewport.tsx, LatheLab.tsx, viewport.ts y estilos. Sin cambios al intérprete o remoción. Las siguientes prácticas de diagnóstico siguen planificadas; no están implementadas.


## Cierre: atajos y protección de edición al arrancar

Entrega final de teclado y arranque: 85 TypeScript, typecheck y ESLint correctos; 55 E2E Chromium raíz (33,3 s) y 55 subruta /cnc-edu/ (34,4 s) correctos, incluida la carga JS demorada. Export raíz restaurado y preview 3100 publicado; HTML, JS y WASM responden 200 con MIME correctos. QA real: recargar, editar inmediatamente T1/T2/M30, interpretar con Ctrl+Enter y avanzar con F8 conserva el texto y llega a T1 en 1/3; avance posterior muestra T2 en 2/3. F8/Mayús+F8 también comprobados en navegador. Evidencia docs/evidence/shortcuts/. Rust/WASM no se modificaron respecto de las 82/17 pruebas previas. Captura outputs/torno-atajos-ejecucion.png. Fuentes y preview respaldados y ZIPs comprobados al cerrar.

No quedan verificaciones pendientes del código entregado. NEXT_INCREMENT.md detalla las futuras prácticas de diagnóstico; todavía no están implementadas. No confundir la etiqueta «En la punta» con la selección inicial del catálogo. No limpiar el repositorio untracked.


## Cierre: prácticas de diagnóstico

Entrega cerrada: 84 pruebas Rust, 89 TypeScript y 18 WASM real correctas; fmt, Clippy, typecheck y ESLint correctos. Builds estáticos y 57 E2E Chromium raíz (35,7 s) y 57 bajo /cnc-edu/ (38,3 s) correctos, incluida persistencia de la práctica. Export raíz restaurado y preview 3100 actualizado. QA real en pestaña nueva: SPINDLE_OFF en línea 4, selección G01 Z-20 F120, perfil congelado tras 3 bloques; corrección recorrida 8/8 con perfil confirmado; G71 seleccionado y ejecución bloqueada. Evidencia docs/evidence/diagnostic-practices/, capturas outputs/torno-diagnostico-husillo.png y torno-diagnostico-codigo.png. Sin ampliación de códigos ni cambios a semántica Rust o ABI WASM. ZIPs de fuentes y preview renovados y comprobados al cerrar.

No queda implementación parcial pendiente. Siguiente trabajo propuesto: medir rendimiento en programas largos antes de decidir Worker. La apariencia de herramientas queda aplazada. No reabrir la auditoría upstream ni reimplementar casos ya cerrados.


## Cierre del 22/10: rendimiento y referencia externa

Entrega del 22/10/2026 cerrada: typecheck, ESLint y 89 pruebas TypeScript correctos; 58 E2E Chromium en raíz (46,1 s) y 58 bajo /cnc-edu/ (45,9 s) correctos, incluida apertura íntegra de 9000 líneas, selección Unicode/tabulación, resize y alineación visible con barras de 15 px. Cuatro casos de rendimiento adicionales correctos en raíz y cuatro en subruta (5,3 s cada lote). Export raíz restaurado, preview 3100 actualizado y servidor restablecido. HTTP 200 y MIME correctos para HTML/JS/WASM. QA real en pestaña nueva: documento de 1001 líneas, 33 filas dibujadas, G71 seleccionado en línea 999 y diferencia vertical de 0 px entre código y numeración. Captura outputs/torno-editor-largo-2026-10-22.png. Evidencia docs/evidence/performance-2026-10-22/. Sin cambios de semántica Rust/ABI ni apariencia de herramientas. Las 84 pruebas nativas y 18 WASM de la entrega anterior no se repitieron; se conservan sus logs, y el benchmark ejecutó el binario WASM real con nuevos casos. Fuentes y preview respaldados y ZIPs comprobados al cerrar.

Siguiente punto de partida: contrato aditivo de material interior/tubular según REFERENCE_LATHE_SIM.md. Benchmark reproducible listo; Worker no implementado. No usar la captura de otro producto como especificación completa ni volver a crear prácticas de diagnóstico ya entregadas.
