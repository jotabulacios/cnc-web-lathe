# Handoff completo para continuar CNC Web Lathe

Fecha de corte: 22 de octubre de 2026. Idioma de trabajo con el usuario: español informal de Argentina. Este documento reúne el estado vigente y el punto exacto de continuación. Fue contrastado con los archivos del repositorio al preparar la entrega; no es una propuesta desde cero.

## 0. Actualización posterior (22/10/2026, continuación con Claude Code)

**El inspector y la sección 3D YA ESTÁN implementados y verificados.** Prevalece esta nota sobre las secciones 1, 10, 11, 17 y 19, que describen el estado anterior.

- Inspector: TOOL_INSPECTOR.md (ToolInspector.tsx, ToolPreview.tsx, toolPreviewScene.ts, toolInspection.ts).
- Sección: SECTION_3D.md (modo `section` de revolutionMeshV3, sectionMesh.ts, botón en LatheThreeView).
- Cámara ortográfica y vista frontal Z/X: ORTHOGRAPHIC_CAMERA.md.
- Selección exterior/anular decidida en Rust (lab_profile): LAB_PROFILE.md.
- Correctores, tabla fija por estación (X en Ø, activación con el movimiento siguiente): TOOL_OFFSETS.md. Las secciones 1 y 8 sobre 'correctores no integrados' quedan superadas.
- Ciclos G71/G70 (desbaste exterior tipo I y acabado, edu-lathe-v2): CYCLES.md. La práctica de diagnóstico «no soportado» usa ahora G76.
- Radio de punta y G41/G42 (rectas): NOSE_RADIUS.md.
- Banco de trabajo con tema claro (P1, dirección B): WORKBENCH.md. Siguen P2/P3 (escena 3D y plano 2D claros, controles superpuestos). Fuentes de datos de herramientas: TOOL_DATA_SOURCES.md.
- Escena clara y controles superpuestos (P2/P3) y herramientas ISO nominales: WORKBENCH.md e ISO_TOOLS.md.
- Animación continua (AUTOMATIC_PLAYBACK.md) y G96/G97/G50/G99 con tiempo estimado (SPINDLE_TIME.md).
- Pendiente según REFERENCE_LATHE_SIM.md: vista dividida, hoja de cotas, ranurado con ancho, mordazas, varias puestas y contacto.
- Base verificada: 173 Rust, 164 TS, 28 WASM y 85 E2E en raíz y en /cnc-edu/. WASM 0f873359…4a753d.
- Siguiente: G41/G42 con radio de nariz (entrega 6 de TOOL_OFFSETS_PLAN.md), G71 tipo II o interior, G76; también afinar materiales y cabezas.
- Git sigue sin commits ni identidad de autor.

## 1. Leer primero: qué está hecho y qué NO

El simulador educativo X/Z funciona íntegramente en navegador. El MVP original está implementado y ampliado: Rust/WASM, Next.js, pasos/retroceso, perfiles de material, arcos exteriores acotados, tubos/mandrinado/refrentado tubular, SVG2D, Three.js3D, guardado local y13 prácticas.

Las herramientas ya tienen seis conjuntos dimensionales educativos propios en mm, compartidos entre2D y3D. Ya no se usa una única pirámide/caja que solo cambia de color. NO son CAD de fabricantes ni cuerpos de colisión validados.

Hay un kernel Rust puro de referencias/calibración, probado pero AISLADO. NO hay correctores aplicados a G-code, tabla de offsets editable, T0102 admitido, compensación G41/G42 ni desgaste integrado en la ejecución.

**Última tarea autorizada: inspector independiente de herramienta y sección3D. La ejecución fue interrumpida antes de implementar esas dos funciones. Solo se guardó su plan y una entrada en el log.** No existe todavía ToolInspector, preview aislada de conjunto ni sección/cutaway en la aplicación.

Último producto verificado:142 pruebas Rust,137 TypeScript,23 WASM real y68 E2E Chromium en raíz más68 en subruta. Ver sección de evidencia para distinguir pruebas previas de verificaciones de esta entrega documental.

## 2. Contexto del pedido y preferencias

El usuario comenzó pidiendo auditoría del proyecto rudra496/cnc, arquitectura Next.js + Three.js + Rust/WASM y un MVP educativo de torno de dos ejes. Primero se documentó la auditoría; después autorizó implementar y continuar. Eligió un repositorio independiente por la divergencia esperada respecto de fresadora.

Preferencias que deben conservarse:

- Avanzar con autonomía en el trabajo autorizado; no detenerse reiteradamente para preguntar si se continúa.
- Registrar avances y resultados a medida que se completan en WORK_LOG.md. No anotar una tarea como terminada antes de verificarla.
- Priorizar reutilización útil, pruebas automatizadas, separación de capas y futuras extensiones a ciclos/correctores/catálogos/CAM.
- La apariencia y procedencia dimensional de las herramientas le preocupa especialmente. Explicar qué es diseño educativo y qué tiene una fuente real.
- Le gustó el look técnico de la referencia de Amer Icon, especialmente herramienta/porta e inspector. La última autorización de trabajo visual vino después de revisar esa referencia.
- No publicar, hacer push ni modificar upstream/remotos sin autorización explícita. El trabajo local y la preview sí están autorizados.
- El usuario pidió este handoff para continuar con otra IA: esta entrega documenta y respalda, no retoma automáticamente la implementación interrumpida.

Leer también PROJECT.md y AGENTS.md antes de modificar código. Las instrucciones actuales del usuario prevalecen sobre los documentos históricos.

## 3. Ubicaciones y recuperación

| Recurso | Ubicación actual |
|---|---|
| Repositorio activo, fuente de verdad | /home/jotape/Documents/cnc-codex-starter |
| Carpeta del chat/entrega | /home/jotape/Documents/Codex/2026-10-20/quiero-convertir-este-fork-de-cnc |
| Copia upstream de referencia | carpeta del chat/work/upstream-cnc |
| Preview estática independiente del build | carpeta del chat/work/preview |
| Documentos entregados al usuario | carpeta del chat/outputs/docs |
| ZIP de fuentes | carpeta del chat/outputs/cnc-web-lathe-source.zip |
| ZIP estático ejecutable por HTTP | carpeta del chat/outputs/cnc-web-lathe-preview.zip |
| Herramienta de publicación local | carpeta del chat/work/publish_preview.py |
| Herramienta de respaldo | carpeta del chat/work/update_artifacts.py |

La carpeta inicial del chat NO es el repositorio del producto. Usar workdir explícito al ejecutar comandos.

Los ZIPs son portables, pero los helpers Python y los comandos de entorno de esta máquina contienen rutas absolutas. En otra máquina, adaptar rutas y usar la documentación del proyecto. El ZIP de fuentes lleva la carpeta raíz cnc-web-lathe/; el ZIP de preview contiene directamente index.html y los assets exportados.

La fuente excluye los archivos ignorados: node_modules, target, .next, out y public/wasm no son un respaldo de dependencias/toolchains. El ZIP de preview sí contiene los assets WASM ya compilados. Para desarrollar desde fuentes se requiere reconstruirlos.

### Git: atención

Git está inicializado en main, pero **todavía NO hay commits, HEAD válido ni remoto**. Los directorios del producto aparecen como archivos sin seguimiento. No interpretar git diff vacío como ausencia de trabajo. No usar clean/reset para preparar el entorno.

En la revisión anterior no había identidad de autor configurada; no se inventó una. Queda pendiente consolidar un historial revisable con la identidad apropiada. Los ZIPs son respaldo, no sustituyen ese historial. No crear un remoto ni publicar como parte de una limpieza rutinaria.

## 4. Qué se reutilizó del otro repositorio

Upstream: https://github.com/rudra496/cnc
SHA auditado: b59fefb5043ce53ddd3adf34079398838a69729d.

El código extraído y registrado es src/components/GCodeEditor.tsx, desde src/components/cnc/GCodeEditor.tsx del upstream. Se adaptó a props, sin su store Zustand; se añadieron accesibilidad, U/W, seguimiento de línea, diagnósticos Rust, virtualización y correcciones de scroll/resize.

El parser/intérprete Rust, reconstrucción del material, contratos, reproducción, laboratorio, vistas de torno y evaluación de ejercicios son implementaciones nuevas. NO se copió el parser de fresado ni su heightmap/store global. Three.js/OrbitControls son dependencias MIT; usar la misma biblioteca no implica haber copiado la escena original.

Conservar THIRD_PARTY_NOTICES.md, docs/REUSE_NOTICES.md, licenses/ y las licencias públicas de la distribución estática. No incorporar catálogos/activos comerciales sin procedencia/licencia comprobada.

La copia upstream no recibió cambios funcionales; al verificarla solo tenía pnpm-lock.yaml y pnpm-workspace.yaml sin seguimiento, generados en la auditoría. No reescribirla ni sincronizar cambios del producto hacia allí.

## 5. Arquitectura y flujo de datos

```
Fuente G-code + setup + sourceRevision
          ↓
adaptador TS validado → cnc-wasm → cnc-core Rust
          ↓                         ↓
bloques/snapshots/motions       parser + estado modal
          ↓
reducer de reproducción: cursor por BLOQUE, revisión, runId
          ↓
reconstrucción del prefijo en Rust → perfil/material + diagnósticos
          ↓
adaptador valida revisión/cursor/attempt y geometría
          ↓
SVG2D / Three.js3D / DRO / evaluación educativa
```

- cnc-core es puro: sin navegador, reloj, archivos ni control de máquina.
- cnc-wasm es una frontera delgada. No colocar semántica CNC en el wrapper.
- TypeScript valida y presenta resultados; no mantiene un segundo parser ni otro motor de corte.
- El estado usa reducer puro; no se introdujo Zustand del upstream.
- Revisión, cursor e intento evitan aceptar respuestas antiguas después de editar, retroceder o reintentar.
- Los bloques solo de estado también cuentan como pasos. No usar número de línea como cursor: comentarios y líneas vacías no son bloques ejecutables.
- Perfiles se reconstruyen por prefijo para retroceso/reset; no hacer operaciones inversas aproximadas en el renderer.
- La reproducción es por bloques/segundo didácticos; NO duración física determinada por F.
- No hay backend, cuentas, base de datos ni Worker. Un Worker se pospuso tras medir rendimiento.

### Fronteras versionadas importantes

| Interfaz | Alcance |
|---|---|
| compile / edu-lathe-v1 / apiVersion1 | Compilador histórico, sin T5 |
| compile_v2 / edu-lathe-v2 / apiVersion2 | Compilador aditivo con T5 |
| stock_profile / profileVersion1 | Perfil histórico cilíndrico |
| stock_profile_v2 / profileVersion2 | Perfil exterior lineal, conos/arcos/refrentado sólido |
| stock_profile_v3 / profileVersion3 | Perfil anular interior/exterior; rectas y refrentado tubular acotado |

La app compila en v2. Si el material es sólido y no hay T5, engine.ts reconstruye con el perfil exterior v2 y la petición legacy adecuada. Si hay tubo, T5 inicial o cualquier bloque que active T5, usa perfilv3 para TODO el programa. Por ello un arco anterior a un T5 también queda fuera del modelo anular: no se cambia de representación a mitad del prefijo.

El diámetro interior se separa del Stock histórico al compilar y se envía como innerDiameterMm explícito a stock_profile_v3. No agregarlo silenciosamente al DTO antiguo: la frontera rechaza campos desconocidos. El wrapper deserializa a JSON Value antes de la estructura estricta para comprobar las claves JS realmente recibidas.

## 6. Semántica CNC actual

- Ejes X/Z absolutos. X y U están programados en diámetro; geometría interna en radio físico. U/W son incrementales.
- Milímetros, G21/G18/G98. F en mm/min, S en RPM.
- G00/G01 y G02/G03 con restricciones documentadas.
- M03/M04/M05 y final M02/M30.
- Arcos G18 con I radial y K axial, centros relativos al inicio; no R, círculos completos ni cruce del eje.
- Remoción exterior de arcos monótonos en Z mediante cuerdas: sagita perpendicular0.01mm, hasta512 segmentos. Esa cota NO garantiza igual error en radio o volumen.
- T0…T4 exteriores educativos; T5/T05/T0505 es mandrinado con agujero inicial. T0 vuelve al genérico, no es una torreta física simulada.
- Formatos T se validan desde el lexema: no aceptar signos, decimales o longitudes arbitrarias. El sufijo de corrector debe coincidir con estación en el dialecto actual; T0102 sigue siendo error.
- M06 es confirmación educativa opcional; no anima ni certifica giro de torreta.
- Instrucciones desconocidas/conflictos impiden ejecución: no ignorarlas silenciosamente.

### Material y transacciones

Sólidos: cilindrado, escalones, conos, arcos exteriores admitidos y refrentado ideal hasta X0. Tubos: agujero ya existente, mandrinado T5, corte exterior longitudinal hacia Z negativo y refrentado exterior completo hacia el agujero. Sin taladrado implícito, arcos anulares, radial parcial ni cortes inversos que remuevan.

Un rápido no remueve; penetración real en pared produce RAPID_IN_STOCK. El corte efectivo exige husillo encendido y RPM positivas. Contacto/aire no debe confundirse con remoción. Se conserva el último bloque completo ante fallo: no devolver una fracción mecanizada de un bloque fallido.

Incertidumbres numéricas devuelven diagnóstico y congelan el perfil; no redondear una pared positiva a vacío. Límites:256KiB de fuente,10000 bloques, magnitudes≤1e9,4096 tramos y2 millones de operaciones de geometría. La malla de material tiene presupuesto de32MiB y puede rechazar escalas que no sean representables en float32.

### Refrentado tubular: YA implementado

AnnularProfile::face_to y profile_v3 lo integran. G01 radial hacia X menor, Z constante dentro del material, herramienta exterior. El inicio debe cubrir el máximo exterior de TODO el frente y el final alcanzar el mínimo interior de ese frente; no basta con entrar parcialmente en pared. T5 no se convierte en herramienta frontal.

El frente retirado conserva el dominio axial con interior=exterior. Esos tramos son vacío y los cortes posteriores los omiten exactamente; una pared muy fina positiva sigue siendo material. SVG/Three no deben dibujar allí superficies fantasma.

Cara→mandrinado y mandrinado→cara pueden dejar el mismo material/volumen con distinto radio almacenado en el intervalo vacío: comparar material, no el radio arbitrario de una banda de área cero.

## 7. Herramientas dimensionales: YA integradas

Fuente: src/lib/lathe/toolAssemblies.ts. Son diseños educativos propios en mm, no inferidos de fabricantes. Conservan tipos de inserto con ángulo explícito, espesores, partes prismáticas y barra cilíndrica axial.

| T | Forma actual resumida |
|---|---|
| T0 | Genérico exterior: porta12×12, largo radial50, rombo lado6/punta80° |
| T1 | Exterior: porta12×12, largo radial60, rombo lado8/punta80° |
| T2 | Acabado: porta12×12, largo radial55, rombo lado6/punta55° |
| T3 | Cuchilla axial3mm, cuerpo radial y abrazadera; ancho solo visual |
| T4 | Porta axial y triángulo de punta80° |
| T5 | Barra Ø8×60, cabeza e inserto55°; eje local R−6 respecto de punta |

Consultar polígonos y espesores exactos en el código/TOOL_ASSEMBLIES.md: las longitudes nominales no equivalen automáticamente al alcance total desde la punta.

La esquina ideal es el origen local. Three: x=Z, y=R, z=tangencial. SVG: x=Z, y=−R. La escala de todos los cuerpos en Three es1/max(longitud,diámetro), igual que el material; SVG usa la misma escala física de sus ejes. Los iconos se encuadran individualmente, por lo que sus tamaños de tarjeta no comparan dimensiones.

createToolObject genera mallas compartidas, marca el origen y libera geometrías/materiales al sustituir/desmontar. El frame2D incluye cuerpos de los movimientos previstos para evitar que el material salte al cambiar T. Three encuadra cuerpo/material y opera giro/zoom alrededor del objetivo de cámara.

**El motor aún corta con punta ideal.** No hay radio de nariz, corte por ancho de cuchilla, cuerpo de colisión, acceso físico validado, flexión, acabado superficial ni compensación. La barra visible no demuestra que un montaje sea realizable.

## 8. Referencias/calibración: kernel listo, integración pendiente

crates/cnc-core/src/tool_reference.rs contiene resolve_reference, ToolVector, ToolCalibration y ReferenceState. No está exportado a WASM ni conectado a interpreter/profile/proyectos/UI.

Convención educativa:

```
L_reg = registro_geométrico + desgaste
Q = W + P − L_reg
P_física_máquina = Q + L_real
P_física_pieza = P_física_máquina − W
```

P es punto programado; Q referencia de montaje; L_real vector medido montaje→punta. W solo tiene desplazamiento axial; eje radial permanece R0. Las cantidades radiales son radios mm, nunca diámetro. Con calibración perfecta no se desplaza arbitrariamente la trayectoria por usar un porta más largo.

Oráculo: P_R20, L_real_R−60 y L_reg_R−59.9 → Q_R79.9, punta_R19.9 y Ø39.8. El error radial0.1 produce0.2 en diámetro. Esto fija un modelo educativo, no compatibilidad de signos de un control comercial.

Cinco pruebas nuevas cubren144 combinaciones exactas, signos, error axial/radial, desgaste separado, datos inválidos, rango, cruce del eje y pérdida de precisión. La inversión y concordancia usan guardas aritméticas, no tolerancias físicas. No sumar el largo del dibujo a movimientos existentes.

Falta referencia de montaje por conjunto, configuración inicial, contrato aditivo y decisión explícita para activar/cambiar registros durante ejecución. TOOL_OFFSETS_PLAN.md y TOOL_REFERENCES.md son el punto de partida después del incremento visual autorizado.

## 9. UI, editor, archivos y evaluación

- Setup editable: diámetro exterior/interior, longitud, X inicial en diámetro, Z inicial y herramienta inicial. Editar invalida ejecución anterior.
- Reproducción: siguiente, anterior, reset, play/pause; F8, Shift+F8 y Ctrl/⌘+Enter.
- Editor con spans UTF-16 de Rust y navegación a diagnósticos. No cambiar a offsets de bytes en el navegador.
- Fuente completa en textarea; resaltado y numeración virtualizados. Se verificó archivo de9000 líneas.
- Corrección reciente: al reducir altura del editor, conserva visible el diagnóstico si sigue enfocado y mantiene esa selección. No forzar el scroll ordinario ni otra selección.
- Proyectos JSON hasta2MiB; programas UTF-8 hasta256KiB, import/export nc/tap/gcode. Normalización de saltos y spans tiene pruebas.
- Guardado manual en localStorage y recuperación del documento anterior. No hay autosave/cloud garantizado.
- Proyectos nuevos v2, decoder legacyv1 conservado. Clave histórica cnc-web-lathe.project.v1 se mantiene: no renombrarla por estética.
- Borradores inválidos de setup se preservan junto a la última configuración válida. No confundir draft visual con setup ejecutable.
-13 prácticas:10 recorridos positivos y3 diagnósticos intencionales. El catálogo se carga al build en src/app/page.tsx; agregar una fixture sin catálogo no la hace aparecer en UI.
- Evaluación exige fuente/setup originales, revisión/cursor actuales, geometría y estado final detenido/terminado/retirado. Se comprueba finalState contra el último afterState.
- expectedAnnularProfile es excluyente con criterios exteriores. Requiere ambas paredes, volumen derivado de geometría y cabecera Rust; geometría correcta antes de M30 no confirma el recorrido.
- Un diagnóstico observado no se presenta como programa completo. El perfil puede estar confirmado solo hasta evaluatedBlocks.

## 10. Referencia visual y prioridad vigente

Enlace revisado: https://x.com/amer_icon/status/2111804281640624523/photo/1 y la segunda foto del carrusel. El lector web devolvió403, pero el navegador permitió ver ambas imágenes. No se descargaron ni copiaron assets.

Observaciones: barra/cabeza/asiento/inserto diferenciados, acero con reflejos, porta oscuro e inserto destacado, modo Ortho seleccionado, sección/cutaway e inspector con parámetros y previews2D/3D. Las imágenes no prueban procedencia dimensional ni algoritmo/fiabilidad de colisiones.

El usuario aprobó seguir en esa dirección. **La siguiente tarea inmediata es el inspector y luego la sección3D**, antes de volver a integrar correctores. No invertir esa prioridad usando el párrafo de un handoff anterior.

Documento de comparación: REFERENCE_TOOL_LOOK_2026-10-22.md. Plan ya escrito: TOOL_INSPECTOR_SECTION_PLAN.md.

## 11. Punto EXACTO de interrupción y siguiente entrega

En el último turno se leyeron las implementaciones existentes y se guardó TOOL_INSPECTOR_SECTION_PLAN.md + una entrada en WORK_LOG.md. El usuario interrumpió para pedir este documento. No se creó código de inspector, preview ni sección. No hay tests nuevos de esas funciones ni build que las incluya.

### A. Inspector independiente

Alcance recomendado:

1. Details/panel dedicado, cerrado por defecto. Abrirlo no cambia setup, cursor, código o ejecución.
2. Sigue herramienta activa por defecto. Poder inspeccionar otra con selección LOCAL, diferenciada de «elegir herramienta inicial». No reutilizar onSelect del catálogo para ese propósito.
3. Silueta2D ampliada, preview3D aislada, referencia en Z0/R0 local y medidas/procedencia. No mostrar ese origen local como posición de máquina.
4. Reutilizar TOOL_ASSEMBLIES, LatheToolGlyph y createToolObject. No crear un catálogo geométrico nuevo solo para el inspector.
5. La preview solo se monta al abrir y se destruye al cerrar. Carga dinámica de Three; dos contextos simultáneos como máximo si la pieza también está en3D, con gestión explícita de recursos.
6. Si falla WebGL, conservar SVG y medidas y dar retry sin perder ejecución.
7. Una cámara ortográfica es apropiada para la preview técnica; no hace falta cambiar aún toda la cámara principal ni el tema visual.

Nombres como ToolInspector.tsx, ToolPreview.tsx o toolPreviewScene.ts serían archivos nuevos propuestos, NO archivos existentes. Evitar importar createThreeScene con un stock ficticio solo para simular un visor de herramienta: compartir generador de objeto/recursos, separar responsabilidades.

Pruebas mínimas: abrir/cerrar, T y retroceso, inspección local sin modificar herramienta activa/inicial, unidades/origen, fallo/reintento WebGL y desmontaje. Conservar contexto/snapshot de la práctica antes y después de inspeccionar.

### B. Sección longitudinal de presentación

Propuesta del plan: retirar de la visualización el semiespacio tangencial delantero, conservando trasero y tapas de sección sobre las bandas reales. Mantener herramienta completa en su misma pose para leer mandrinado interior.

Decisiones de implementación AÚN no tomadas: construir una malla de media revolución con tapas, o usar clipping de material más tapas geométricas independientes. No afirmar que ya existe un algoritmo elegido/probado.

Consideraciones:

- Procesar perfiles resueltos; no recalcular CNC en TS.
- Soportar exteriorv2 y anularv3, conos, hombros, huecos y regiones exactamente vacías.
- Tapar la sección solo donde hay material; no tapar el agujero ni crear superficies en el frente ya eliminado.
- No recortar la herramienta junto con el material.
- Conservar data-profile-volume como volumen físico COMPLETO del perfil. La sección solo muestra una parte.
- Si se prueba una malla de media revolución, su volumen geométrico firmado es la mitad de la malla completa correspondiente. Considerar la aproximación poligonal angular al comparar con volúmenes analíticos en π; no exigir exactitud que la teselación no tiene.
- Comprobar costuras, orientación de normales, triángulos degenerados y cierre de tapas. No depender de igualdades aproximadas que rellenen paredes pequeñas.
- Mantener el presupuesto total de buffers; no añadir tapas fuera del límite de32MiB sin contabilizarlas.
- Toggle local de vista: no invalidar documento ni modificar perfiles, DRO, evaluación o archivos guardados. Pasar a2D y volver debe tener un comportamiento de presentación definido.
- Limpiar materiales/clipping/geometrías/observers al desmontar y restaurar vista normal.

E2E demostrable: cargar mandrinado, avanzar5 bloques, alternar sección y ver barra/punta interior conservando volumen47500π, cursor5 y estado. Repetir en refrentado tubular para verificar frente vacío y agujero; retroceso/reset; fallback sinWebGL; raíz/subruta.

### C. Después

Afinar materiales, cabezas/asientos y controles de cámara según evidencia visual. Luego continuar referencias de montaje/correctores con contrato aditivo. Ciclos/catálogos/CAM son posteriores, no parte del inspector ni de este handoff.

## 12. Mapa de archivos para trabajar

| Área | Archivos |
|---|---|
| Orquestación React | src/components/LatheLab.tsx |
| Página/catalogo estático | src/app/page.tsx |
| Estilos | src/app/globals.css |
| Editor reutilizado | src/components/GCodeEditor.tsx |
| Catálogo de selección inicial | src/components/ToolLibrary.tsx |
| Símbolo/proyección de conjunto | src/components/LatheToolGlyph.tsx |
| Vista2D/encuadre | src/components/LatheViewport.tsx; src/lib/lathe/viewport.ts |
| Vista3D/lifecycle React | src/components/LatheThreeView.tsx |
| Escena material/cámara | src/lib/lathe/threeScene.ts |
| Datos/modelo de herramientas | src/lib/lathe/tools.ts; toolAssemblies.ts; toolObject.ts |
| Perfiles y mallas TS | profilePathV2.ts; profilePathV3.ts; revolutionV2.ts; revolutionV3.ts |
| Contratos/carga/adaptación | src/lib/lathe/contract.ts; profile.ts; annularProfile.ts; engine.ts; loader.ts |
| Estado/documentos | src/lib/lathe/playback.ts; document.ts; setup.ts; project.ts; programFile.ts |
| Aprendizaje | exercises.ts; diagnosticExercises.ts; annularMeasures.ts; GuidedPractice.tsx; AnnularReferences.tsx |
| Rust parser/estado | crates/cnc-core/src/syntax.rs; interpreter.rs; types.rs |
| Geometría pura | crates/cnc-core/src/linear_profile.rs; annular_profile.rs |
| Reconstrucción | crates/cnc-core/src/profile.rs; profile_v2.rs; profile_v3.rs |
| Referencias aisladas | crates/cnc-core/src/tool_reference.rs |
| Wrapper WASM | crates/cnc-wasm/src/lib.rs |
| Fuentes/referencias de prácticas | fixtures/lathe/*.nc y catálogos JSON |
| Test de conjuntos | tests/toolAssemblies.test.ts; tests/e2e/tools.spec.ts |
| Test de material3D | tests/revolutionV2.test.ts; tests/revolutionV3.test.ts |
| E2E próximos | tests/e2e/annular.spec.ts; annular-guided.spec.ts; no-webgl.spec.ts; long-editor.spec.ts |
| Checks remotos preparados | .github/workflows/check.yml |

Los nombres abreviados de TS en filas anteriores están bajo src/lib/lathe/ salvo componentes indicados. Leer el código antes de cambiar firmas: no asumir un archivo nombrado en un plan como existente.

## 13. Casos de aceptación y oráculos independientes

### Cilindrado/mandrinado existente

fixtures/lathe/boring.nc:15 bloques ejecutables sobre Ø50/Ø20×100, inicio X60/Z5. T5 amplía a Ø30 hastaZ−40; T1 deja exteriorØ40 hastaZ−20.

Volúmenes: inicial52500π → tras mandrinado47500π → final43000π mm³. Final≈135088.4841043611mm³. Los comentarios ocupan líneas pero no pasos.

### Cara y mandrinado tubular

fixtures/lathe/tubular-facing.nc:14 bloques ejecutables. Práctica tubular-facing-and-boring.

| Cursor | Material esperado | Volumen |
|---|---|---|
| 0–4 | Inicial | 52500π |
| 5–8 | CaraZ−5, frente vacío | 49875π |
| 9–14 | AgujeroØ30 hastaZ−40 | 45500π |

Final:60mm de Ø50/Ø20 y35mm de Ø50/Ø30;5mm delanteros vacíos. Volumen=60×(25²−10²)π+35×(25²−15²)π. La práctica confirma al bloque14, no al9 aunque el perfil ya coincida.

### Rápido anular

rapid-through-wall.nc / diagnose-annular-rapid: fallo solicitado en bloque5, perfil confirmado hasta4, RAPID_IN_STOCK en línea5 columnas1–8, material inicial intacto. rapid-through-bore.nc / rapid-through-bore es la corrección de7 bloques: retirar por Z antes de cruzar radialmente.

Estos casos deben conservarse al tocar visualización. No reemplazar sus referencias por la salida calculada del mismo algoritmo que se prueba.

## 14. Entorno reproducible y comandos

Versiones fijadas/validadas: Node24.19.0, pnpm11.25.0, Rust1.99.1, wasm-pack0.13.1. Next16.4.2, React19.3.1, TS5.9.3, Three0.186.1 y Zod4.4.3. Consultar package.json/lockfiles si una continuación posterior los modifica; no actualizar versiones durante una tarea visual sin necesidad.

En esta máquina, el toolchain Rust se instaló dentro del chat y Node está en el runtime de Codex. Para recuperar los ejecutables en bash:

```bash
export CARGO_HOME=/home/jotape/Documents/Codex/2026-10-20/quiero-convertir-este-fork-de-cnc/work/toolchain/cargo
export RUSTUP_HOME=/home/jotape/Documents/Codex/2026-10-20/quiero-convertir-este-fork-de-cnc/work/toolchain/rustup
export PATH="$CARGO_HOME/bin:/home/jotape/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/home/jotape/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH"
cd /home/jotape/Documents/cnc-codex-starter
node --version
pnpm --version
rustc --version
wasm-pack --version
```

En otra máquina usar sus instalaciones, no copiar estas variables a ciegas. rust-toolchain.toml fija componentes y target WASM.

### Instalación limpia y desarrollo

```bash
pnpm install --frozen-lockfile
# Solo si no está instalado:
cargo install wasm-pack --version 0.13.1 --locked
pnpm build:wasm
pnpm dev
```

Dev por defecto: http://127.0.0.1:3000. Para usar3100 con Next habría que liberar ese puerto conscientemente; actualmente lo usa la preview estática. No matar servidores ajenos por rutina.

### Checks

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
pnpm check
pnpm build:wasm
pnpm test:wasm
pnpm build:web
pnpm test:e2e
```

pnpm check ejecuta typecheck, ESLint y tests TS. pnpm build reconstruye WASM y después Next; build:web solo Next. Tras cambiar Rust de producto/ABI, no validar usando un binario viejo. Los nuevos archivos de prueba TS deben agregarse al script test de package.json, que enumera archivos explícitamente.

### E2E y subruta

Playwright usa Chromium,2 workers, puerto3199 y scripts/serve-export.mjs. Necesita out/ ya construido; no compila por sí solo. reuseExistingServer=false evita probar otro servidor accidentalmente.

```bash
pnpm exec playwright install chromium
pnpm build
pnpm test:e2e
NEXT_PUBLIC_BASE_PATH=/cnc-edu pnpm build:web
NEXT_PUBLIC_BASE_PATH=/cnc-edu pnpm test:e2e
# Restaurar la salida final para la preview local de raíz:
pnpm build:web
```

En CI puede ser necesario playwright install --with-deps chromium. El workflow preparado lo hace. No está ejecutado en GitHub porque no hay remoto. Si falla una prueba, conservar trace/screenshot y corregir causa; no rebajar criterios para ocultar una regresión.

El proyecto es export estático: servir por HTTP, no file:// ni next start. next.config.ts usa output:export, trailingSlash y basePath desde NEXT_PUBLIC_BASE_PATH. JS glue y WASM deben resolverse también bajo subruta y servir MIME correcto.

## 15. Preview local y respaldos

Al redactar el handoff estaba activo un servidor Python en3100, sirviendo work/preview desde la carpeta del chat. Su PID puede cambiar; no depender del número observado. Para arrancar si no existe:

```bash
cd /home/jotape/Documents/Codex/2026-10-20/quiero-convertir-este-fork-de-cnc
python3 -m http.server 3100 --bind 127.0.0.1 --directory work/preview
```

Después de un build de raíz verificado:

```bash
# Desde la carpeta del chat, no desde el repo:
python3 work/publish_preview.py
python3 work/update_artifacts.py
```

publish_preview.py copia out/ al snapshot, conserva assets hash anteriores para pestañas abiertas y publica HTML al final. Rechaza un build bajo /cnc-edu/: reconstruir raíz primero. No modificar work/preview a mano como fuente del producto.

update_artifacts.py copia docs, genera ZIP de fuentes desde git ls-files cached/others no ignorados, genera ZIP estático desde out y verifica CRC de ambos. No necesita commits para incluir las fuentes actuales. Los helpers no están dentro del repo portable; son utilidades de esta entrega.

Respetar borradores/pestañas del usuario. Abrir una pestaña propia para QA; recargar una pestaña ajena puede perder cambios no guardados. Las IDs de pestañas usadas antes no son un contrato portable.

## 16. Evidencia de la última base verificada

Última suite nativa:142 correctas. TS:137 correctas con typecheck/lint. WASM real:23 correctas. E2E del binario final:68 raíz(51.1s) y68 bajo /cnc-edu/(50.8s), correctas. fmt y Clippy con -D warnings correctos.

SHA-256 del binario public/wasm/v1/cnc_wasm_bg.wasm:

```
6ef8129ddc59891d5c42e60986bbf8b7fa4e8d3398e32538fce21db62f2e715d
```

En esta entrega documental se volvió a comprobar el hash del archivo, el mapa de fuentes, el estado Git y la ausencia de componentes inspector/sección. NO se repitieron todas las suites por cambios solo documentales; los resultados anteriores tienen logs:

- docs/evidence/tool-reference-kernel-2026-10-22/: última regresión completa con binario final, Rust/fmt/Clippy/WASM/builds/E2E/hash.
- docs/evidence/tool-assemblies-2026-10-22/: modelos compartidos,3 pruebas TS nuevas, E2E y reproducción/corrección del editor móvil.
- docs/evidence/tubular-facing-2026-10-22/: integración del refrentado y práctica.
- docs/evidence/guided-annular-2026-10-22/: evaluación anular y oráculo exacto de contacto anterior.

El oráculo de contacto contrastó28672 trayectorias acotadas,28506 clasificaciones definidas coincidentes y166 incertidumbres explícitas. No es una prueba de toda geometría ni de cuerpos de herramienta.

Capturas disponibles en outputs del chat:

- torno-porta-exterior-dimensional-2026-10-22.png
- torno-barra-mandrinado-dimensional-2026-10-22.png
- torno-cuchilla-dimensional-2026-10-22.png
- torno-refrentado-tubular-2d-2026-10-22.png
- torno-refrentado-tubular-3d-2026-10-22.png

## 17. Límites y deuda reales

- Herramientas simplificadas de diseño propio; cabeza/asiento aún básicos, sin norma/modelo comercial verificado.
- No hay inspector ni sección3D todavía; el stock opaco oculta la punta dentro del agujero.
- Cámara principal perspectiva; un toggle ortográfico todavía no existe.
- No hay animación continua entre puntos, chips/remoción volumétrica general ni simulación de fuerzas.
- Correctores, radio de nariz, G41/G42, G71/G70/G76, catálogos/CAM y múltiples puestas pendientes.
- Cobertura de navegador centrada en Chromium; Firefox/WebKit y prueba docente no verificados.
- No hay publicación pública ni CI remoto ejecutado.
- Git sin historial consolidado; documentación histórica con estados superados.
- Algunos casos numéricos de arcos/remoción repetida se detienen explícitamente por ambigüedad. No ocultar esos diagnósticos para aparentar cobertura.

## 18. Documentación histórica y revisiones externas

HANDOFF.md y CONTINUIDAD.md crecieron por entradas sucesivas. IMPLEMENTATION_STATUS.md conserva la primera base y tiene afirmaciones antiguas sobre setup fijo, falta de3D o ausencia de remoción. NEXT_TUBULAR_FACING.md es diseño histórico ya implementado. TOOL_GEOMETRY_BACKLOG.md registra el problema original y su actualización posterior.

**Si una entrada antigua contradice este handoff, contrastar el código y los documentos específicos actuales antes de actuar.** No reimplementar T5, tubo, refrentado, conjuntos dimensionales ni kernel de referencias por leer una sección histórica.

Revisiones/propuestas de agy/Antigravity y OpenCode están documentadas en EXTERNAL_REVIEWS.md y evidence. Algunas aportaciones se adaptaron y otras ejecuciones terminaron sin informe. No atribuir una revisión exitosa a un timeout ni asumir un modelo concreto o que esos procesos están activos. Comprobar disponibilidad real si se vuelve a delegar; asignar archivos/tareas disjuntos y revisar aportes antes de integrarlos.

## 19. Checklist para la próxima IA

1. Leer este archivo, PROJECT.md y AGENTS.md. Ubicarse en el repo correcto.
2. Inspeccionar fuentes/estado real y procesos/puertos; conservar trabajo existente y borradores.
3. Leer TOOL_INSPECTOR_SECTION_PLAN.md, REFERENCE_TOOL_LOOK_2026-10-22.md y TOOL_ASSEMBLIES.md.
4. Empezar por inspector aislado; recordar que NO está implementado.
5. Verificar su independencia de setup/cursor, lifecycle y fallback antes de integrar sección.
6. Diseñar sección de presentación con tapas y presupuesto, manteniendo volumen físico y perfil sin cambios.
7. Ejecutar checks apropiados y E2E raíz/subruta para cambios visuales integrados; capturar QA en pestaña propia.
8. Anotar en WORK_LOG.md cada avance, fallos encontrados y verificaciones exactas. Si algo queda parcial, decir qué archivos cambiaron y qué falta.
9. Actualizar continuidad y respaldos; restaurar export raíz antes de publicar preview local.
10. Volver a referencias/correctores solo después del alcance visual, salvo nueva prioridad del usuario.

## 20. Prompt breve para iniciar otro agente

> Continuá CNC Web Lathe desde /home/jotape/Documents/cnc-codex-starter. Leé PROJECT.md, AGENTS.md y docs/HANDOFF_COMPLETO_2026-10-22.md antes de tocar código. El producto ya tiene Rust/WASM, perfiles sólidos/anulares, refrentado tubular y herramientas dimensionales educativas. El kernel de referencias existe pero no aplica correctores. La próxima tarea autorizada es el inspector independiente de herramientas y después sección3D, según docs/TOOL_INSPECTOR_SECTION_PLAN.md; ambas funciones todavía no tienen implementación. Conservá contratos/ejecución/perfiles, registrá cada avance verificado en docs/WORK_LOG.md y completá checks/QA antes de declarar una entrega terminada. No rehagas los hitos implementados ni publiques remotamente. Usá el handoff para entorno, evidencia, archivos, pruebas y respaldos.
