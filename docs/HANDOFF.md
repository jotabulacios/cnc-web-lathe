# Handoff — 22/10/2026, tubo y mandrinado integrados

**Punto de entrada vigente para otra IA:** [HANDOFF_COMPLETO_2026-10-22.md](HANDOFF_COMPLETO_2026-10-22.md). Reúne el estado actual, el corte exacto de la tarea y los comandos. Las entradas históricas inferiores no reemplazan ese estado.

## Último avance: kernel de referencias aislado

Leer TOOL_REFERENCES.md y WORK_LOG.md. tool_reference.rs agrega solo matemática pura nativa: calibración real/registrada/desgaste y puntos de pieza/máquina; no se conecta a G-code, perfiles, proyectos ni UI.142 Rust/fmt/Clippy y23 WASM real correctos; hash final en el log.68E2E raíz y68subruta con el binario final correctos; preview actualizada y HTTP/MIME/hash comprobados. TOOL_OFFSETS_PLAN.md conserva las decisiones de integración pendientes. No habilitar T0102 o G41/G42 ni sumar el largo de un dibujo a la trayectoria.

## Última continuación: herramientas dimensionales y editor móvil

Leer WORK_LOG.md y TOOL_ASSEMBLIES.md. Se sustituyeron formas universales por seis conjuntos educativos propios en mm, proyección SVG/mallas Three compartidas, escala física y encuadre de cuerpo. T1…T5 cambian geometría y se restauran al retroceder. Se corrigió conservación de diagnóstico enfocado al reducir altura del editor. Rust/ABI no cambiaron.

137TS/check y23WASM correctos;68E2E raíz y68subruta correctos. Preview raíz actualizada; capturas de porta/cuchilla/barra en outputs. Ver evidencia tool-assemblies-2026-10-22. No hay correctores activos: TOOL_OFFSETS_PLAN.md fija propuesta de referencias y siguiente entrega acotada. No volver a implementar el refrentado tubular ni las geometrías actuales desde las secciones históricas inferiores.

## Continuación vigente: refrentado tubular y log incremental

Leer primero WORK_LOG.md y TUBULAR_FACING.md. El usuario pidió continuar y registrar avances al completar cada tramo. Refrentado tubular ya conectado al perfilv3; no reimplementarlo desde el diseño histórico. Cortes posteriores ignoran regiones exactamente vacías y conservan paredes positivas. Añadida práctica tubular-facing-and-boring (14 bloques, 45500π mm³), catálogo 13 (10 positivos y 3 diagnósticos). Formas/dimensiones de herramientas siguen pendientes en TOOL_GEOMETRY_BACKLOG.md, sin cambios visuales en esta entrega.

Ver resultados finales y siguiente paso en WORK_LOG.md. Las secciones inferiores conservan los hitos anteriores.

## Continuación más reciente: pendiente visual y kernel de refrentado

El usuario pidió registrar el problema dimensional de herramientas sin cambiar prioridades. Ver TOOL_GEOMETRY_BACKLOG.md. Se mantiene consolidación → refrentado tubular → herramientas/correctores.

## Avance del kernel — 22/10/2026

Se implementó únicamente AnnularProfile::face_to en geometría pura: conserva dominio/agujero, divide en el plano y representa el frente retirado con espesor cero. Tres pruebas nuevas verifican volumen analítico, idempotencia, corte total/Z0, interpolación cónica y rechazo de planos inválidos sin modificar el original. 132 pruebas Rust y Clippy correctos. pnpm check pasó (133 TS, typecheck y lint); 22 pruebas del WASM existente pasaron como regresión de la base, no como validación de esta nueva función, todavía no exportada ni integrada.

No está habilitado el refrentado tubular CNC/UI. Falta resolver cortes posteriores sobre intervalos vacíos, presupuesto/límite y casos numéricos adversos del método nuevo; luego semántica de prefijos/contacto/husillo/rollback, reconstrucción WASM y validación visual. La preview no cambió. Evidencia en evidence/tubular-facing-kernel-2026-10-22/.

Git todavía no tiene commits ni identidad de autor configurada; no se inventó identidad ni se creó remoto. Archivos y evidencia se respaldan en outputs.

## Estado prioritario — prácticas anulares y comparación por paso

El usuario pidió seguir trabajando. Se completaron dos ampliaciones educativas sobre el motor tubular: práctica evaluada de mandrinado y diagnóstico de rápido a través de pared con referencia corregida. Ver GUIDED_ANNULAR_PRACTICES.md. El código Rust del producto y la ABI WASM no cambiaron en esta entrega; sí se añadieron pruebas nativas/fixtures y se amplió evaluación/UI.

Catálogo total12: nueve recorridos positivos y tres diagnósticos. Archivos nuevos annular-exercises.json, annular-corrections.json y annular-diagnostics.json. IDs boring-and-turning (15bloques), diagnose-annular-rapid (falla5/eval4, spanL5col1–8) y rapid-through-bore (7bloques). El botón de mandrinado carga ahora la práctica evaluada, no una copia libre sin evaluación. Se mantiene recuperación del documento y guardado de identidad.

expectedAnnularProfile agrega referencias interiores/exteriores y volumen como tercer criterio excluyente del catálogo; no se pueden mezclar tramos/muestras exteriores/anulares. annularMeasures.ts mide perfiles resueltos, sin CNC. Comprobación requiere ambas paredes, volumen medido desde geometría y headerRust, resultado2/perfil3, revisión/cursor actuales y estado final. Se reforzó además la coherencia entre finalState y último afterState (incluidos datos del DRO), tras una revisión que reprodujo una inconsistencia aceptada por el evaluador anterior. La salida de Rust ya era coherente.

AnnularReferences.tsx compara cotas actuales y objetivo:2secciones coinciden al inicio del mandrinado,4tras el agujero y6tras el cilindrado. Coincidencia geométrica no equivale a programa terminado; retroceder desdeM30 quita confirmación. Al editar/cambiar material se retiran mediciones anteriores. En diagnóstico muestra material confirmado hasta4yexigeel aviso exacto en5paraobservado, sin llamarlo completo.

Entrega verificada:129 pruebas Rust,133 TypeScript y22 WASM real correctas; fmt, Clippy con warnings como errores, typecheck y ESLint correctos. Build estático correcto;64 E2E Chromium raíz(46,2s) y64 bajo/cnc-edu/(49,1s) correctos. Export raíz restaurado y preview3100 actualizado. No se recompiló WASM porque no cambió Rust del producto/ABI: las22pruebas ejecutaron el binario real anterior, cuyo hash se conserva.

Se agregó además annular_contact_oracle.rs:28.672trayectorias contra referencia exacta de semiplanos/racionales,28.506resultados definidos coincidentes y166incertidumbres explícitas. Incluye tubos/sólidos/conos/espesor cero/ápice con coordenadas enteras acotadas; no prueba todos los hombros ni cuerpos de herramienta. Log contact-oracle.log.

QA manual en pestaña propia9: mandrinado5/15con4cotas coincidentes y2pendientes;15/15conreferencias confirmadas; diagnóstico observado en5conperfil confirmado hasta4yG00 X60 seleccionado; corrección7/7confirmada. Capturas outputs/torno-cotas-mandrinado-2026-10-22.png,torno-mandrinado-confirmado-2026-10-22.png ytorno-diagnostico-tubo-2026-10-22.png. Una pestaña temporal anterior desapareció; se recreó una propia y no se recargó el borrador del usuario. Evidencia docs/evidence/guided-annular-2026-10-22/. Fuentes/docs/preview respaldados y ZIPs comprobados al cerrar.

Siguiente cambio geométrico recomendado: seguir NEXT_TUBULAR_FACING.md antes de implementar refrentado. Incluye contrato, oráculos y una trampa concreta: los cortes posteriores no deben tratar como cruce de pared los intervalos de frente vacío. El diseño todavía no está implementado. No reimplementar T5, tubo, prácticas anulares o este diagnóstico. Herramientas visuales siguen aplazadas. No hay tareas externas agy nuevas; sus dos timeouts anteriores siguen documentados como no-revisiones.

## Hito anterior — integración tubular


El usuario pidió continuar sin detenerse en la base geométrica. Ahora tubo y mandrinado están conectados a Rust, WASM, guardado y vistas2D/3D. Leer TUBULAR_SIMULATION.md: reemplaza como siguiente paso las tareas pendientes de la base anular inferior (histórica).

- Nuevos compile_v2(apiVersion2/edu-lathe-v2), T5/T05/T0505 boring-id y stock_profile_v3 con innerDiameterMm hermano del programa. compile1 y perfiles1/2 intactos; rechazan resultados v2 como frontera nativa para no confundir T5 con exterior.
- App ejecuta compiladorv2; para sólidos sinT5 usa reconstrucción legacyv2. Tubo, T5 inicial o activado por algún bloque seleccionan perfilv3 para TODO el programa. V3 solo G00/G01 longitudinales; los arcos congelan aunque estén antes de T5. Husillo exigido al corte; no taladrado implícito, refrentado tubular, radiales/inversos con remoción ni cuerpo de barra/holder.
- annular_profile::penetrates comprueba ambas paredes y detecta extremos en aire atravesando pared. Dos falsos negativos sub-ulp encontrados en revisión independiente se corrigieron y tienen regresiones. Igualdad interpolada no prueba contacto; incertidumbre congela. Bloques transaccionales con candidato opcional (sin clonar en cada bloque vacío).
- SetupDraft.innerDiameter opcional; ausente=0 para legados. El adaptador separa stock.innerDiameterMm antes de compilar y lo envía explícitamente a geometría. Nuevo botón Cargar ejemplo de mandrinado en Pieza y origen, conserva documento anterior y carga fixture boring.nc. Es práctica libre, no ejemplo evaluado todavía.
- Guardados nuevos de la app declaran proyecto/dialecto2 de forma explícita incluso siT5 solo aparece en fuente. Decoder1 sigue funcionando, storagekey histórica. encodeProject/saveProject aceptan versión opcional para conservar consumidores anteriores. No analizar G-code en TypeScript para adivinar la versión.
- Nuevos profilePathV3/revolutionMeshV3 con agujero, paredes interiores, tapas anulares y caras expuestas de escalones. SVG material/hatch/removed deben usar evenodd. Malla≤32MiB y fallback2D ante rango float32 insuficiente. T5 usa símbolo ilustrativo neutro; aspecto de herramientas sigue aplazado.
- Fixture de15bloques: Ø50/Ø20×100, T5 a Ø30 en40mm y T1 a Ø40 en20mm. Volumen52500π→47500π→43000π, final135088,4841043611mm³. Retroceso/reinicio reconstruyen. Capturas outputs/torno-tubo-2d-2026-10-22.png ytorno-tubo-3d-2026-10-22.png; QA en pestaña propia7, sin modificar borrador del usuario.

Entrega verificada: 125 pruebas Rust, 112 TypeScript y 20 sobre WASM real correctas; fmt, Clippy con warnings como errores, typecheck y ESLint correctos. Build completo WASM/Next correcto. 61 E2E Chromium en raíz (41,5 s) y 61 bajo /cnc-edu/ (45,2 s) correctos con el binario final. Export raíz restaurado y preview 3100 actualizado. Capturas del build final verificadas en pestaña propia, volumen135088,4841043611 mm³ tras bloque11. Evidencia en docs/evidence/tubular-integration-2026-10-22/.

El usuario pidió agy con Gemini. Se verificaron CLI/modelos y se lanzaron Argon High (150 s) y Flash High (90 s) en modo plan con código suministrado, sin herramientas ni permisos ampliados. Ambos agotaron el plazo sin informe: no cuentan como revisiones completadas, aunque la CLI salió con código0. Ver EXTERNAL_REVIEWS.md y sus logs. Los agentes Codex sí completaron contribuciones y revisión; no hay ediciones pendientes.

Fuentes, documentos/evidencia y preview respaldados; ZIPs comprobados al cerrar. No hubo push, despliegue externo ni cambios del upstream.

Siguiente: convertir el ejemplo de mandrinado en práctica evaluada con cotas interiores y volumen anular, manteniendo la evaluación exterior existente. Después definir refrentado tubular/arcos interiores con fixtures propias. No volver a implementar geometría, T5 o persistencia; no ampliar a mordazas/ciclos/compensación en un mismo cambio.

## Hito anterior — primera base geométrica

## Estado actual — material tubular, 22/10/2026

Tras la autorización de continuar, se implementó una base geométrica pura y probada: `crates/cnc-core/src/annular_profile.rs`. Ver ANNULAR_MATERIAL.md antes de seguir. `AnnularProfile` valida secciones con radios interior/exterior lineales, construye sólido/tubo, calcula volumen anular, reduce exterior y amplía interior. `LinearProfile::raise` reutiliza el algoritmo de envolvente/intersección sin transformar radios con una constante. Cruce de pared => `AnnularError::WallCrossing` y perfil anterior intacto. Límites/presupuesto compartidos; tramos de espesor cero admitidos como resultado. Fixture `fixtures/annular-material.json`: Ø50/Ø20×100, agujero Ø30 en40mm, exterior Ø40 en20mm; volúmenes52500π→47500π→43000π.

Esto NO está conectado todavía al intérprete, WASM, configuración, persistencia ni vistas: la aplicación sigue simulando stock exterior sólido. No anunciar mandrinado disponible ni añadir un input interior sin conectar el motor. ABI compile1/stock_profile1/stock_profile_v2 intactas, sin cambios de herramientas ni de proyecto JSON. No hay APIv3 publicada. El aspecto de herramientas sigue aplazado.

Verificación final:106 pruebas Rust (22 nuevas),89 TypeScript y18 WASM real correctas; fmt, Clippy con warnings como errores, typecheck y ESLint correctos. Build WASM/estático correcto y58 E2E Chromium raíz correctos(37,8s). No se repitió subruta: no cambiaron rutas/UI/carga; los58 de la entrega anterior permanecen en performance-2026-10-22. Evidencia nueva en docs/evidence/annular-material-2026-10-22/. Export raíz publicado a preview3100; respaldos renovados.

Siguiente incremento: clasificación de movimientos rectos contra ambos límites anulares y reconstrucción de prefijos con rollback por bloque. Probar extremos en aire atravesando una pared, rápidos por el agujero, contacto en hombros, husillo y acceso. Decidir contrato versionado para herramienta interior: el enum actual es estricto y T1–T4 son exteriores; no habilitar T5 silenciosamente en compile1. Después export WASM aditivo, migración de proyecto y UI2D/3D. No reutilizar perfilv2 restando un agujero: clasificaría mal rápidos por el interior. No volver a escribir esta base ni las pruebas ya cerradas.

## Hito anterior — rendimiento, 22/10/2026

El usuario pidió continuar y preguntó por https://x.com/amer_icon/status/2113058335129993521. Se revisaron sus cuatro imágenes y se documentó viabilidad/ruta en REFERENCE_LATHE_SIM.md. No se implementó una réplica ni se reutilizó código o recursos de ese producto. El pulido visual de herramientas sigue aplazado.

Se añadieron benchmark-cases.mjs, benchmark-engine.mjs y una suite Chromium opcional. Tras medir, se limitó el dibujo del editor a filas visibles; se preserva textarea completo y navegación. QA real encontró y corrigió el límite de scroll del gutter con barra horizontal; no quitar la compensación de alto ni la prueba de coordenadas visibles. Ver PERFORMANCE.md, incluida la limitación del fill masivo de automatización.

Entrega del 22/10/2026 cerrada: typecheck, ESLint y 89 pruebas TypeScript correctos; 58 E2E Chromium en raíz (46,1 s) y 58 bajo /cnc-edu/ (45,9 s) correctos, incluida apertura íntegra de 9000 líneas, selección Unicode/tabulación, resize y alineación visible con barras de 15 px. Cuatro casos de rendimiento adicionales correctos en raíz y cuatro en subruta (5,3 s cada lote). Export raíz restaurado, preview 3100 actualizado y servidor restablecido. HTTP 200 y MIME correctos para HTML/JS/WASM. QA real en pestaña nueva: documento de 1001 líneas, 33 filas dibujadas, G71 seleccionado en línea 999 y diferencia vertical de 0 px entre código y numeración. Captura outputs/torno-editor-largo-2026-10-22.png. Evidencia docs/evidence/performance-2026-10-22/. Sin cambios de semántica Rust/ABI ni apariencia de herramientas. Las 84 pruebas nativas y 18 WASM de la entrega anterior no se repitieron; se conservan sus logs, y el benchmark ejecutó el binario WASM real con nuevos casos. Fuentes y preview respaldados y ZIPs comprobados al cerrar.

## Hito anterior: prácticas de diagnóstico

Prioridad del usuario: aplazar el pulido visual de herramientas y continuar funcionalidad. Dos prácticas (SPINDLE_OFF y UNSUPPORTED_CODE/G71) más una referencia corregida, sin códigos nuevos. Ver DIAGNOSTIC_PRACTICES.md. Entrega cerrada: 84 pruebas Rust, 89 TypeScript y 18 WASM real correctas; fmt, Clippy, typecheck y ESLint correctos. Builds estáticos y 57 E2E Chromium raíz (35,7 s) y 57 bajo /cnc-edu/ (38,3 s) correctos, incluida persistencia de la práctica. Export raíz restaurado y preview 3100 actualizado. QA real en pestaña nueva: SPINDLE_OFF en línea 4, selección G01 Z-20 F120, perfil congelado tras 3 bloques; corrección recorrida 8/8 con perfil confirmado; G71 seleccionado y ejecución bloqueada. Evidencia docs/evidence/diagnostic-practices/, capturas outputs/torno-diagnostico-husillo.png y torno-diagnostico-codigo.png. Sin ampliación de códigos ni cambios a semántica Rust o ABI WASM. ZIPs de fuentes y preview renovados y comprobados al cerrar. Las cifras de las secciones inferiores describen hitos anteriores.

## Punto de entrada

Leer este documento, PROJECT.md y AGENTS.md. CONTINUIDAD.md conserva el historial; sus entradas anteriores describen etapas pasadas. REVIEW_2026-10-20.md registra fallos encontrados en el árbol anterior. REVIEW_FIXES_2026-10-20.md registra la reparación posterior: no confundir los resultados de ambas revisiones.

El usuario pidió corregir los problemas y continuar según el mejor plan. Se repararon persistencia, gates, formato T, refrentado de contacto y clasificación de arcos reales. Además se completó el selector de herramienta inicial de la interfaz. No reimplementar ni iniciar otra auditoría del upstream.

## Rutas y preservación

- Repo activo: `/home/jotape/Documents/cnc-codex-starter`.
- Chat: `/home/jotape/Documents/Codex/2026-10-20/quiero-convertir-este-fork-de-cnc`.
- Upstream original de referencia: `<chat>/work/upstream-cnc`, SHA b59fefb5043ce53ddd3adf34079398838a69729d. Sin modificaciones funcionales.
- Git local sin commits ni remotes; fuentes untracked. No limpiar/resetear. Respaldos: outputs/cnc-web-lathe-source.zip y cnc-web-lathe-preview.zip.
- Documentación original repo/docs; copia entregable outputs/docs del chat.

## Arquitectura y capacidades actuales

Next.js/React/TypeScript, núcleo Rust puro, wrapper WASM delgado, SVG 2D y Three.js 3D opcional. Cálculo local sin backend. Reutilización selectiva y atribuida del editor de rudra496/cnc (MIT); no fork sincronizado.

Dialect edu-lathe-v1: G00/G01/G02/G03, X/Z absolutos, U/W incrementales, X/U en diámetro y radio físico interno. G21/G18/G98, F mm/min, S RPM, M03/M04/M05, M02/M30. Arcos I radial/K axial relativos al inicio, sin R ni círculos completos; ver ARC_DIALECT.md. T con1/2/4dígitos y estaciones0..4, corrector igual a estación; M06 didáctico opcional. No afirmar compatibilidad industrial Fanuc.

Perfil v2: cilindros/escalones/conos, arcos monótonos en Z aproximados por cuerdas y refrentado frontal G01 hasta X0. Herramienta puntual ideal. Husillo requerido al retirar material. Rollback al bloque anterior ante errores o límites. Contrato compile v1 y export stock_profile legacy v1 preservados; stock_profile_v2 aditivo.

Catálogo visual T0–T4 disponible en ambas vistas; en 2D hay figuras más grandes, etiqueta junto a la punta y ampliación del plano en escritorio. Ver TOOL_VISIBILITY.md.

Editor con spans UTF16 y navegación a diagnósticos; setup editable; paso/anterior/reset; reproducción por bloques; nueve prácticas (siete referencias positivas y dos diagnósticos); recuperación de documento anterior; guardar localmente y JSON v1; import/export G-code UTF-8; vista 3D con marcador de herramienta y fallback/contexto perdido probados. Herramienta inicial seleccionable en Pieza y origen; T la reemplaza desde su bloque. Cambiar setup invalida ejecución. Las5herramientas son educativas; geometría de corte ideal, sin offsets ni ancho físico de cuchilla.

## Mejora actual: visibilidad de herramientas

El usuario no veía los tipos en 2D. Se extrajo LatheToolGlyph, compartido por el catálogo visible ToolLibrary y LatheViewport; se conserva la punta exacta con figuras ilustrativas. Tarjetas eligen setup inicial, con invalidación/persistencia existentes; no cambian el código ni activan directamente la herramienta en mitad de ejecución. Inicial (aria-pressed) y activa (En la punta) se distinguen. T3 no añade corte de ancho físico. El encuadre reserva espacio para holder y etiqueta; la escala física X/Z no se deforma. Ampliar/reducir plano en escritorio solo cambia presentación.

Entrega cerrada: 85 pruebas TypeScript, typecheck y ESLint correctos. Build estático y 52 E2E Chromium correctos en raíz (32,5 s) y 52 bajo /cnc-edu/ (33,0 s); export raíz restaurado y preview local 3100 actualizado. Rust y WASM no se modificaron: la evidencia anterior de 82 Rust y 17 WASM sigue en guided-operations/. QA en pestaña nueva: selección T2, ampliación del plano y cambios T1/T2/T3/T4 reales; punta T4 al bloque 4/5 mientras T2 permanece inicial. Clic sobre la inicial ya elegida conserva el cursor. Capturas outputs/torno-herramientas-2d-t2.png y torno-herramientas-2d-t4.png. Evidencia tools-2d/. Fuentes y preview respaldados en ZIP al cerrar.

## Incremento posterior: teclado y arranque del editor

F8 avanza, Mayús+F8 retrocede; ambos reutilizan canStep y playbackReducer y pausan reproducción manualmente. Se ignora repetición por tecla sostenida y no se capturan Ctrl/Alt/⌘+F8. Pistas visibles y aria-keyshortcuts. Ctrl/⌘+Enter conserva la interpretación existente.

QA detectó edición perdida si se rellenaba el textarea inmediatamente tras reload antes de hidratar. GCodeEditor exporta readonly/aria-busy y useSyncExternalStore habilita al cliente. Regresión E2E demora JS y verifica edición posterior conservada; no añadir timeout fijo para este caso. Ver EXECUTION_SHORTCUTS.md. Entrega final de teclado y arranque: 85 TypeScript, typecheck y ESLint correctos; 55 E2E Chromium raíz (33,3 s) y 55 subruta /cnc-edu/ (34,4 s) correctos, incluida la carga JS demorada. Export raíz restaurado y preview 3100 publicado; HTML, JS y WASM responden 200 con MIME correctos. QA real: recargar, editar inmediatamente T1/T2/M30, interpretar con Ctrl+Enter y avanzar con F8 conserva el texto y llega a T1 en 1/3; avance posterior muestra T2 en 2/3. F8/Mayús+F8 también comprobados en navegador. Evidencia docs/evidence/shortcuts/. Rust/WASM no se modificaron respecto de las 82/17 pruebas previas. Captura outputs/torno-atajos-ejecucion.png. Fuentes y preview respaldados y ZIPs comprobados al cerrar.

## Cambios de la reparación anterior

- project.ts admite draft.toolId; archivos anteriores lo heredan de setup.toolId al cargar. Normalización al guardar, strict y coherencia intactos, incluidos borradores numéricos inválidos. validateSetupDraft rechaza identificadores desconocidos.
- max_radius_in ignora solapamientos de longitud cero; repetir cara exacta y Z0 no exige husillo, profundizar sí.
- syntax Word conserva numeric_width. T0001/T0004 son corrector inválido, T101/T00101 son formato inválido; alias válidos conservados.
- arc_min_radius usa los radios exactos from/to y solo mínimos interiores. Nativo y WASM aceptan la regresión X0 y rechazan cruces negativos reales.
- profile_v2 arc_penetrates comprueba analíticamente arco–tramo en extremos y puntos estacionarios, con presupuesto y guard numérico conservador. Husillo/dirección antes de aplanado. Si hay corte real no representado por las cuerdas, PROFILE_NUMERICAL_AMBIGUITY y rollback; arco real en aire no corta por una cuerda espuria.
- Lint reparado sin desactivar reglas. Regresiones añadidas en nativo, WASM y navegador.
- Selector inicial del catálogo en LatheLab, persistido y probado; no agrega semántica de corte.

## Incremento actual: ejemplos guiados de arco y refrentado

Dos fuentes nuevas arc-convex.nc/facing-turning.nc y catálogo6ejemplos. Ver GUIDED_EXERCISES.md. Nuevo expectedProfile con muestras y volumen para arco, expectedSpans conserva los otros5; XOR estricto de criterios. expectedFinalToolId paraT0202delarco/T0101finalderefrentado. profileMeasures.ts integra/evalúa perfil resuelto sin lógica CNC. V2 en pruebas de todos los ejemplos; regresión v1 de los3originales intacta. UI muestra cotas/tolerancias Ø y referencia de volumen en detalle opcional.

Verificación final: 82 pruebas Rust, 85 TypeScript y 17 sobre WASM real correctas; typecheck, ESLint, fmt y Clippy correctos. Build estático y 50 E2E Chromium correctos en raíz (28,9 s) y otros 50 bajo /cnc-edu/ (28,6 s). Export raíz restaurado y preview local 3100 actualizado. QA manual en pestaña nueva: arco 9/9 con T0202, siete cotas y volumen 186875,13075798462 mm³ dentro de ±20 mm³ de la referencia; refrentado 13/13 con T0101 final, tramos Ø50/Ø40/Ø0 y volumen 57600π mm³. Capturas en outputs/torno-ejemplo-arco-guiado.png y torno-ejemplo-refrentado-guiado.png. Evidencia en docs/evidence/guided-operations/. Sin ampliación del intérprete ni del modelo de remoción. Los resultados de reparación de la sección siguiente corresponden a la entrega anterior.

## Verificaciones de la reparación anterior

- 82 Rust pasan; fmt y Clippy con warnings como errores correctos.
- 79 TypeScript pasan; typecheck y ESLint correctos.
- 16 pruebas WASM real pasan, con binario reconstruido.
- Build raíz correcto y48 E2E Chromium raíz correctos (25.8s).
- Las correcciones antes del selector pasaron47 E2E raíz y47 subruta.
- 48 E2E también correctos bajo /cnc-edu/ (25.4s). Export raíz restaurado y preview3100 actualizado; HTTP/MIME verificados. QA manual del selector, cilindrado5bloques y herramienta de acabado en2D/3D correcta. ZIPs renovados y comprobados al cerrar.

Evidencia de esta entrega en docs/evidence/fixes-2026/. Scratch/logs originales en chat/work/fixes-2026/. La revisión anterior fallida queda separada en docs/evidence/review-2026/.

## Límites importantes

La sagita perpendicular de cuerdas es0.01mm; no hay garantía universal de error radial ni volumen relativo. Límite512segmentos/arco,4096spans y2Moperaciones. Una comparación dudosa congela de forma explícita, no demuestra aire. Repetir un arco inferior puede detectar residual entre círculo y cuerdas anteriores: con husillo se puede congelar como PROFILE_NUMERICAL_AMBIGUITY; sin husillo diagnostica penetración si se demuestra. Documentado y probado. Esta limitación no se resuelve ignorando cortes pequeños ni aumentando recursos indefinidamente.

Sin G41/G42, offsets, ciclosG71/G70/G76, compensación de punta, CAM, catálogos comerciales ni conectividad de máquina. No hay simulación volumétrica3D, geometría física de holder/colisión certificada, ni tiempo de mecanizado real. Radiales parciales/inversos que retiran material siguen limitados. No tocar todo el intérprete para agregar una capacidad aislada.

## Siguiente paso recomendado

No quedan verificaciones pendientes de esta entrega. NEXT_INCREMENT.md es el plan histórico ya implementado; DIAGNOSTIC_PRACTICES.md describe el resultado. No volver a crear esos casos. El usuario aplazó el pulido visual de herramientas.

La medición recomendada ya se hizo: ver PERFORMANCE.md y conservar sus casos. No introducir Worker solo para mover el mismo objeto grande entre hilos: la copia y el renderizado también cuestan. La entrada masiva vía locator.fill sigue siendo una limitación de automatización/entrada por investigar, distinta de abrir NC, que sí se verifica con 9000 movimientos.

La ruta funcional propuesta a partir de la referencia está en REFERENCE_LATHE_SIM.md. La base geométrica y fixture de material interior ya están implementadas; ver ANNULAR_MATERIAL.md y el estado prioritario de este handoff. Sigue pendiente la integración de movimientos, contratos versionados, proyectos y vistas. No saltar directamente a mordazas/colisiones ni afirmar compatibilidad genérica de programas de las capturas.

## Runtime y comandos

```sh
export CARGO_HOME=/home/jotape/Documents/Codex/2026-10-20/quiero-convertir-este-fork-de-cnc/work/toolchain/cargo
export RUSTUP_HOME=/home/jotape/Documents/Codex/2026-10-20/quiero-convertir-este-fork-de-cnc/work/toolchain/rustup
export PATH="$CARGO_HOME/bin:/home/jotape/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/home/jotape/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH"
cd /home/jotape/Documents/cnc-codex-starter
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
pnpm check
pnpm build
pnpm test:wasm
pnpm test:e2e
pnpm bench:engine
CNC_BENCH_REPORT_DIR=test-results/benchmark pnpm bench:browser
```

Rust1.99.1, Node24.19, pnpm11.25, wasm-pack0.13.1 fijados. Bajo subruta: NEXT_PUBLIC_BASE_PATH=/cnc-edu pnpm build:web y mismo prefijo pnpm test:e2e. Restaurar luego pnpm build:web sin prefijo.

## Preview, artefactos y colaboración

3100 sirve chat/work/preview, independiente del repo/out temporal de builds. Desde chat, publicar únicamente export raíz verificado con `python3 work/publish_preview.py`; conserva hashes de assets para pestañas abiertas y no toca borradores. Si falta servidor: `python3 -m http.server 3100 --bind 127.0.0.1 --directory work/preview`. E2E usa servidor separado3199. No recargar pestañas del usuario para QA; abrir otra.

Copiar primero chat/work/<incremento>/*.log a repo/docs/evidence/<incremento>/; update_artifacts.py no descubre automáticamente estas carpetas nuevas. Renovar docs/evidencia y ZIPs mediante chat/work/update_artifacts.py después de restaurar raíz. Los entregables para enlazar al usuario están bajo chat/outputs.

Usuario autorizó ayuda de agentes y OpenCode/agy. En esta reparación dos subagentes trabajaron en archivos separados: contacto arco y lexema T/extremos; el padre revisó/integró y ejecutó checks. Un segundo examen independiente de contacto no encontró un bloqueo nuevo y dejó explícita la limitación de repetición de arcos. No hay ediciones de agentes pendientes. Las consultas externas que agotaron timeout no cuentan como revisiones completadas.

No hubo push, remoto, despliegue externo ni cambios al upstream.
