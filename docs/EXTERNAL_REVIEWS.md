# Revisiones externas — 20 de octubre de 2026

El usuario autorizó emplear OpenCode/DeepSeek y Antigravity (`agy`) para colaborar. Se encargaron revisiones acotadas; no implementaciones paralelas sobre los mismos archivos.

## Antigravity mediante agy

Tarea: contrastar continuidad y documentación del perfil con el código Rust. El primer intento de lectura directa no produjo revisión porque la CLI negó un comando que requería permiso en modo headless. Se resolvió proporcionando el contenido de PROJECT.md, AGENTS.md, CONTINUIDAD.md, STOCK_PROFILE_MODEL.md y profile.rs en el prompt, con instrucciones de no usar herramientas. No se ampliaron permisos ni se modificó configuración.

Resultado: revisión completada sin contradicciones identificadas en los archivos proporcionados. Coincidieron las reglas de cilindrado, el perfil transaccional, los límites y el contrato documentado. Esto es revisión de texto/código suministrado, no acceso directo al repositorio ni ejecución de pruebas. La CLI usó su modelo predeterminado; no se atribuye un modelo concreto que no reportó. Informe en evidence/agy-continuity-review.log.

## OpenCode

Tarea: revisión de E2E, servidor de export, configuración Playwright y carga/reintento WASM. Modelo elegido explícitamente: opencode/deepseek-v4.1-flash-free, disponible en el catálogo local de la CLI. No se infiere una garantía de precio fuera de esa identificación.

Revisión completada con lectura real de archivos. No pudo ejecutar tests porque Node/Rust no estaban en el PATH de su proceso; consultó los logs. La CLI terminó con código 1 pero sí imprimió un informe final, que se conserva en evidence/opencode-e2e-review.md. Una búsqueda web de la CLI fue cancelada; sus afirmaciones sobre comportamiento de navegadores no se toman como verificadas.

Evaluación de hallazgos por el mantenedor:

- Reintento del glue JS: hipótesis de fallo no reproducida en Chromium. Se agregó una prueba que aborta cnc_wasm.js, elimina la interceptación y reintenta sin recargar: pasó con el código original. Se conserva la regresión; Firefox/WebKit pendientes. No se agregó cache-busting sin evidencia de necesidad.
- Mensaje de carga demasiado específico: confirmado por lectura. Se cambió a «No se pudo preparar el programa», válido tanto para fallo de carga como para excepciones de contrato, preservando el detalle.
- Test de compilación obsoleta: puede observar un estado transitorio antes de que termine toda la cadena asíncrona. El reducer tiene pruebas deterministas de revisión obsoleta; sigue pendiente reforzar el E2E con señal de finalización, sin sleeps arbitrarios ni hooks públicos de pruebas.
- Perfil/reintento, red colgada, verificación visual de trayectoria/línea y otros navegadores: huecos registrados, no errores demostrados de geometría. No se promete cobertura completa.
- El comando E2E requiere export compilado; está documentado y el workflow construye antes de probar. No se cambió para reconstruir automáticamente en cada ejecución, que duplicaría trabajo al verificar raíz y subruta.
- El servidor es exclusivo de pruebas y espera un basePath válido de Next sin barra final; normalización de hosting real queda fuera de esa herramienta.

Se encargó además una revisión de temporización sin herramientas con los archivos adjuntos. No devolvió un informe dentro de 180 segundos y se terminó el proceso. No se cuenta como revisión completada. Las pruebas del mantenedor se documentan separadamente.


## Propuesta de código de agy

Para reproducción automática, agy recibió playback.ts y sus pruebas en el prompt, sin herramientas. Propuso código y cinco tests. Se incorporó tras revisar y corregir las guardas de tick y la idempotencia de play; se agregó una sexta regresión. La integración React y los E2E se hicieron por el mantenedor. Evidencia: evidence/agy-autoplay-proposal.log. Ver AUTOMATIC_PLAYBACK.md para comportamiento y límites.


## Incremento de revolución 3D

OpenCode/DeepSeek completó una revisión de plan sin herramientas a partir de la descripción suministrada. Se incorporaron pruebas de degenerados, costura, winding, presupuesto, contexto perdido y carga tardía. Su punto sobre «prefijo» como sólido truncado no aplica: el contrato devuelve todo el stock del último prefijo de bloques confiable.

agy propuso una malla TS y cuatro pruebas analíticas. Se aprovechó la separación entre mantos/hombros y la idea de pruebas, pero se corrigieron winding, degenerados de tapas, presupuesto y validación. La implementación final usa preasignación de typed arrays y cinco tests más fuertes. Una revisión posterior de lifecycle produjo hipótesis de intercalación síncrona y monotonicidad de cursor que no se sostienen en el modelo actual; no se aplicaron automáticamente. Ver REVOLUTION_3D.md para evaluación concreta.

Informes completos: evidence/opencode-revolution-plan.log, evidence/agy-revolution-proposal.log y evidence/agy-three-review.log. Son revisiones/propuestas, no ejecuciones de pruebas. Los checks efectivos del mantenedor están en evidence/revolution-*.log.


## Ejemplos y proyectos locales

agy aportó contenido para los tres ejercicios, adaptado sin afirmaciones de calidad de superficie. OpenCode revisó el plan de ejercicios y ayudó a explicitar que son recorridos de observación, no un corrector universal, y a fijar tolerancia, normalización y recuperación. Informes: evidence/agy-exercises-content.log y evidence/opencode-exercises-review.log.

Para proyectos locales, agy revisó el plan y aportó casos de coherencia/recuperación/límites. Se midieron bytes UTF8 con TextEncoder y no se añadió descarga automática al fallar storage, pese a esos puntos de su propuesta. La revisión posterior de código con DeepSeek no entregó informe en 120s; se registra el timeout sin atribuir aprobación. La verificación efectiva está en projects-*.log.


## Importación de programas G-code

Se pasó el código de ProjectActions y programFile.ts a agy para revisión acotada de carreras y codificación, sin herramientas ni cambios de archivos. La CLI alcanzó timeout90s sin devolver hallazgos. No se cuenta como revisión terminada ni como evidencia de corrección. Validación propia: pruebas puras y E2E program-files-*.log.


## Arcos G02/G03

Antes de implementar se pidió a agy un memorando de decisión en modo plan y solo lectura, con el modelo Gemini 4 Argon (High). Leyó `PROJECT.md`, `AGENTS.md`, los documentos de plan/estado y los módulos Rust del intérprete y del perfil. Informe en `work/agy-arcs-plan.log` (58 líneas), dentro del workspace del chat.

Coincidió en que los arcos son el próximo incremento según el hito 4 de `PROJECT.md` y la sección 6.1 de `IMPLEMENTATION_PLAN.md`, y propuso: solo I/K en la primera entrega, I radial, congelar el perfil en lugar de aproximarlo, y aplanar en 4.2. Se adoptaron esas ideas.

Evaluación del mantenedor:

- **Tolerancia de cuerda de 0,005 mm**: no se adoptó como número elegido. La tolerancia y el número de tramos deben derivarse de la geometría y quedar acotados; eso se decide en 4.2.
- **Mezcla de incrementos**: el memorando proponía interpretar y aplanar en el mismo plan. Se separó en 4.1 (intérprete + trayectoria, perfil congelado) y 4.2 (remoción), para que ningún corte se simule en silencio.
- **Torreta trasera**: lo afirmó sin verificar el viewport. La vista real tiene Z a la derecha, radio arriba y plato a la izquierda; la convención se documentó a partir de eso.
- **Semántica Fanuc**: el memorando marcó como pendiente verificar I en radio o diámetro. Se mantiene como pregunta abierta en `ARC_DIALECT.md`; el dialecto es propio y no se declara compatibilidad.
- **Nombres de diagnóstico**: se usaron los propuestos, más `MISSING_ARC_CENTER` y `POSITION_RANGE` para separar centro ausente de centro inválido y de cruce del eje.

El memorando es una revisión de plan, no una ejecución de pruebas ni una validación del código final.


## Tubo y mandrinado — 22/10/2026

El usuario volvió a pedir Antigravity con Gemini en paralelo. Se verificó la CLI instalada (`agy --help`) y su catálogo (`agy models`), y se lanzó `gemini-4-argon-high` en modo plan, con código suministrado y sin herramientas/ediciones. Agotó150s sin entregar un informe. Se intentó una revisión más breve del clasificador con `gemini-3.8-flash-high`, también en modo plan y sin herramientas: agotó90s sin informe. Ambos procesos devolvieron código0 pero sus únicos textos fueron mensajes de timeout; **no cuentan como revisiones completadas ni como validación del simulador**. No se ampliaron permisos ni se cambió configuración. Prompts e informes vacíos/timeout preservados en `evidence/tubular-integration-2026-10-22/agy-*`.

En paralelo, agentes Codex sí completaron revisión e implementación separadas: contacto/Rust (solo lectura), persistencia/contratos y proyecciones2D/3D. La revisión de contacto encontró dos falsos negativos sub-ulp que se corrigieron con regresiones; la revisión de integración encontró metadata de proyecto antigua al usar T5 solo en el texto, corregida haciendo explícita versión2 al guardar desde la app. Se revisaron/integraron sus cambios y la validación efectiva corresponde a las pruebas nativas, WASM y navegador registradas en esa carpeta.
