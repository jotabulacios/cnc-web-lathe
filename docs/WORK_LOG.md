# Log de trabajo

## 2026-10-22 — continuación del refrentado tubular

- Registrado el problema de formas, dimensiones y escala de herramientas en TOOL_GEOMETRY_BACKLOG.md; se conserva la prioridad acordada.
- Base anterior verificada: 132 pruebas Rust, 133 TS, 22 WASM existente, typecheck/lint/Clippy.
- En curso: remoción sobre intervalos vacíos y reconstrucción CNC del refrentado. Los resultados de validación se añadirán al completar cada tramo.

- Completado: remoción anular conserva intervalos de espesor exactamente cero y rechaza cruces de paredes positivas. Integrado refrentado exterior completo G01 hacia el agujero en perfil v3, con husillo y rollback existentes. Pruebas nativas de prefijos, volumen analítico, retroceso por reconstrucción, rápido, corte parcial, T5 y repetición sin husillo correctas. En curso: recompilación WASM y E2E; todavía no se declara verificada la interfaz nueva.

- Verificado: 136 pruebas Rust, Clippy, typecheck/lint, 134 pruebas TS y 23 WASM real correctas. Se recompiló el binario con el refrentado. Nuevo caso de malla comprueba frente sin superficies fantasma, agujero abierto y superficie cerrada con volumen analítico. E2E nuevo de cara → mandrinado, 2D/3D, retroceso y guardado ya pasó; suite completa en curso.

- Completado: práctica «Refrentado y mandrinado de un tubo», con cotas anulares y volumen independiente 45500π mm³. Catálogo total 13 (10 positivos, 3 diagnósticos). El evaluador existente confirma solo al terminar y revoca al retroceder; WASM y E2E lo verificaron. Primera suite ampliada: 66 E2E raíz correctos.
- Refuerzo numérico posterior: face_to rechaza una pared positiva que la interpolación redondearía a espesor cero. Prueba adversa añadida; 137 Rust y Clippy correctos. Se está reconstruyendo WASM y repitiendo raíz/subruta con este binario final.

### Cierre verificado del incremento

- Binario final reconstruido: SHA-256 `14a1fe7943032606b6cbfacb0307adff2a6067015759f9f91a8cf7eb860596ba`.
- 137 Rust, 134 TypeScript, 23 WASM real correctos; fmt, Clippy, typecheck y lint correctos.
- 66 E2E Chromium raíz (48,5 s) y 66 bajo `/cnc-edu/` (50,1 s) correctos. Export raíz restaurado y preview3100 actualizada.
- QA manual en pestaña propia: práctica nueva 14/14, referencias confirmadas, volumen 45500π mm³; nueva cara y agujero comprobados en 2D y 3D. Capturas guardadas en outputs. Herramientas visuales sin cambios, pendiente dimensional documentado.
- Evidencia: `evidence/tubular-facing-2026-10-22/`. Se actualizaron README, documentación de operaciones, estado de situación y handoff.

### Punto de continuación

El refrentado tubular acotado está integrado; no repetir el kernel ni habilitar cortes radiales parciales por extensión accidental. Mantener oráculos de volumen y compatibilidad anteriores. Sigue la consolidación con prueba de uso docente y, según el orden acordado, el diseño dimensional de herramientas/portas y correctores antes de ciclos/CAM. No hay piloto docente, CI remoto ni validación en otros navegadores. Git sigue sin historial: no hay identidad de autor configurada y no se inventó una; no se creó remoto ni se publicó externamente.

## Continuación: herramientas dimensionales

- Iniciado el siguiente punto del orden acordado. Plan técnico guardado en TOOL_ASSEMBLY_PLAN.md antes de cambiar renderers. Se definirán conjuntos educativos en mm, sin atribuirlos a fabricantes; el motor y los correctores no cambian en este incremento.

- Completado: catálogo dimensional puro de seis conjuntos; ángulos y ancho visual verificados, esquina de referencia común. SVG y Three consumen los mismos polígonos/componentes; barra de mandrinado cilíndrica, cuchilla y porta frontal diferenciados.
- Verificado: 137 pruebas TypeScript, typecheck y lint correctos; 23 pruebas WASM del motor existente correctas. Rust/ABI no cambiaron. Las pruebas nuevas miden las mallas Three reales y comprueban escala, origen, encuadre 2D y liberación de recursos una sola vez.
- Primera corrida E2E: 65 correctos y 2 fallos. Detectó encuadre 2D dependiente del cuerpo activo y una lectura transitoria de fila virtual durante resize. Se está estabilizando el encuadre con los cuerpos de todos los movimientos y haciendo que la comprobación de alineación espere las filas actuales; no se elimina el criterio de alineación. Revalidación en curso.

- Reproducción del fallo móvil: al pasar de editor de 609 px a 298 px de alto, el scroll nativo se conservaba y la selección G71 quedaba fuera del área visible; no era solo una carrera de la prueba. Se añadió seguimiento del diagnóstico enfocado al cambiar altura, sin forzar el scroll ordinario ni sustituir otra selección. Se mantiene la prueba estricta de alineación y virtualización.
- Encuadre 2D estabilizado con las dimensiones de las herramientas de todos los movimientos previstos. El caso de cara/mandrinado volvió a pasar con comparación de trayectoria SVG idéntica al retroceder.

### Cierre verificado: conjuntos dimensionales

- 137 TypeScript, typecheck y lint correctos; 23 WASM real correctos como regresión. Rust no se modificó y conserva el binario de refrentado previamente validado con137 pruebas nativas.
- 68 E2E Chromium raíz (51,2 s) y68 bajo /cnc-edu/ (51,4 s) correctos, incluida la corrección del editor móvil. Export raíz restaurado y preview actualizada.
- QA manual en pestaña propia11: porta de desbaste a escala, cuchilla con abrazadera, barra axial en agujero mecanizado al bloque5. Las formas ya no son una pirámide/caja común. Capturas guardadas en outputs; sin modificar borradores del usuario. Los conjuntos son educativos propios, no CAD de fabricante.
- Modelo visual, procedencia, ejes, medidas y límites documentados en TOOL_ASSEMBLIES.md. Registro original TOOL_GEOMETRY_BACKLOG.md actualizado sin borrar el hallazgo anterior. Se corrigieron referencias comerciales imprecisas de la documentación histórica.

### Diseño siguiente registrado

- TOOL_OFFSETS_PLAN.md distingue punta programada, referencia de montaje y calibración; documenta ecuaciones y un oráculo radial independiente. Con calibración correcta, una herramienta más larga no desplaza el perfil.
- No se habilitan correctores en esta entrega. Primer paso recomendado: transformación pura en Rust y referencia de montaje, luego contrato aditivo y configuración estática; los cambios T/corrector durante ejecución requieren semántica explícita antes de programarlos. G41/G42 y ciclos siguen aparte.

## Continuación: kernel puro de referencias

- Implementado tool_reference.rs sin conexión al intérprete ni nuevos exports/DTOs. Se separan registro geométrico, desgaste, medición de punta desde montaje, punto programado y punta física. Origen axial explícito; todas las cantidades radiales son radios físicos en mm.
- Cinco pruebas nuevas correctas:144 combinaciones exactas, signos/diámetro, calibración errónea radial/axial, desgaste independiente, datos inválidos, rango, cruce de eje y pérdida de precisión. Suite completa142 Rust, fmt y Clippy correctos.
- WASM recompilado y23 pruebas reales correctas; hash nuevo6ef8129ddc59891d5c42e60986bbf8b7fa4e8d3398e32538fce21db62f2e715d. La función de referencias no se exporta ni cambia los comandos admitidos. Se repite la aplicación con el binario final.
- Documentada API, unidades, ecuaciones, fallos y límites en TOOL_REFERENCES.md. El modelo visual sigue sin referencia de montaje asignada automáticamente; no hay correctores aplicados a programas ni G41/G42.

### Cierre del kernel y regresión final

- Con el binario final:68 E2E raíz(51,1s) y68 bajo /cnc-edu/(50,8s), correctos. Export raíz restaurado. Preview3100 sirve HTML y WASM200 con MIME correctos y hash6ef8129ddc59891d5c42e60986bbf8b7fa4e8d3398e32538fce21db62f2e715d.
- Resultado acumulado:142 Rust,137 TypeScript,23 WASM real; fmt/Clippy/typecheck/lint correctos. Logs separados por incremento en evidence/tool-assemblies-2026-10-22/ y evidence/tool-reference-kernel-2026-10-22/.
- Documentación, capturas y respaldos de fuentes/preview actualizados. No se publica externamente ni se crea remoto.

### Punto de partida siguiente

La geometría dimensional educativa está integrada; el kernel de referencias es una base aislada, no un corrector CNC activo. Falta fijar una referencia de montaje explícita por conjunto, diseñar configuración estática/contrato aditivo y preservar programas legacy. No saltar directamente a cambios de registro durante ejecución: antes hay que decidir su efecto sobre montaje/punta y el inicio del siguiente movimiento. Ver TOOL_OFFSETS_PLAN.md y TOOL_REFERENCES.md. El piloto docente y Git/CI remoto siguen pendientes.

## Revisión de referencia visual solicitada por el usuario

- Revisadas ambas imágenes del post Amer Icon2111804281640624523 en el navegador. Observados conjunto de mandrinado con asiento/cabeza, materiales contrastados, modo Ortho seleccionado, controles/vista de sección e inspector2D/3D.
- Registrada comparación y ruta visual en REFERENCE_TOOL_LOOK_2026-10-22.md. La captura no prueba dimensiones ni el algoritmo de colisiones. No se incorporan assets ni se modifica el simulador en esta revisión.
- Candidato visual: inspector de conjunto y sección3D para ver punta/barra interiores; luego cámara ortográfica, materiales y cabezas/asientos paramétricos. Mantener matemática de calibración fuera del renderer.

## Continuación: inspector y sección3D

- Plan previo guardado en TOOL_INSPECTOR_SECTION_PLAN.md. Se conserva semántica Rust/WASM y geometría de material; inspector independiente de selección inicial/ejecución y sección solo de presentación.

## Handoff completo solicitado por el usuario

- Se interrumpió la implementación para preparar la continuidad con otra IA. El incremento inspector/sección solo tenía plan y entrada de log: no hay componentes, renderers ni tests nuevos de esas funciones.
- Creado HANDOFF_COMPLETO_2026-10-22.md con20 secciones: producto y límites vigentes, arquitectura/contratos, reutilización/procedencia, semántica CNC, herramientas y kernel aislado, mapa de archivos, oráculos, entorno/comandos, evidencia, preview/ZIPs, estado Git y tarea siguiente con aceptación.
- Se contrastaron fuentes, ausencia de inspector/sección, SHA de upstream, estado Git, versiones/scripts, workflow real check.yml y hash del WASM. No se volvieron a ejecutar suites de producto por esta entrega solo documental; los resultados verificados previos quedan identificados con logs.
- HANDOFF.md, CONTINUIDAD.md e índice docs/README.md apuntan al documento completo como entrada vigente. Se renuevan copias y ZIPs para transferir el proyecto.

## Inspector de herramienta implementado

- Retomado tras el handoff. El usuario confirmó: primero el inspector y, para la sección 3D, una malla de media revolución con tapas en lugar de clipping.
- Nuevos toolInspection.ts (puro), toolPreviewScene.ts (Three ortográfico aislado, reutiliza createToolObject), ToolPreview.tsx y ToolInspector.tsx; integrado en LatheLab bajo el catálogo. Estilos en globals.css. Sin cambios en Rust/WASM/contratos.
- Pruebas: 4 TS nuevas (141 en total) y 3 E2E nuevos. Con build final: 142 Rust, fmt/Clippy, 23 WASM y 71 E2E en raíz (54,3 s) y 71 bajo /cnc-edu/ (53,8 s), todos correctos. Export raíz restaurado. Hash WASM sin cambios.
- QA visual con capturas de T1/T5 en escritorio y 400 px. Ajustada la escala de rótulos SVG para que no dependa de la proporción del conjunto, y la alineación de la tabla.
- Documentado en TOOL_INSPECTOR.md; evidencia en evidence/tool-inspector-2026-10-22/. Sigue la sección 3D.

## Sección longitudinal 3D implementada

- Decisión del usuario: malla de media revolución con tapas. revolutionMeshV3 recibe un modo `section` (θ∈[π,2π], tapas de corte con zipper sin juntas en T). sectionMesh.ts unifica v2/v3 y conserva el volumen físico completo. threeScene usa grupos de material (cobre en el corte). El botón «Sección longitudinal» está en LatheThreeView y su estado en LatheLab.
- Revisión independiente del inspector (agente de solo lectura): sin bugs bloqueantes. Aplicadas sus mejoras de robustez, encuadre, accesibilidad y fuerza de los E2E (detalle en TOOL_INSPECTOR.md).
- Pruebas nuevas: 3 de malla de sección v3, 1 v2 y 2 E2E de sección, más los casos endurecidos del inspector y sin WebGL. Con el build final: 142 Rust, fmt/Clippy, 145 TS, 23 WASM y 73 E2E en raíz (53,8 s) y 73 bajo /cnc-edu/ (54,1 s), todos correctos. Export raíz restaurado; hash WASM sin cambios.
- QA visual: mandrinado en los bloques 5 y 11 con sección (barra y punta T5 visibles en el agujero, tapas solo sobre material) y refrentado tubular en el bloque 9. Capturas en evidence/section-3d-2026-10-22/.
- Handoff actualizado con la sección 0, que prevalece sobre su estado anterior.

## Cámara ortográfica de la vista 3D

- Selector perspectiva/ortográfica y «Vista frontal Z/X» en LatheThreeView; doble cámara en threeScene; orthographicFrame movido a orthographic.ts y compartido con el inspector. Detalle en ORTHOGRAPHIC_CAMERA.md.
- La QA visual detectó que la vista frontal quedaba cenital: la distancia se medía después de mover la cámara. Corregido, y el E2E camera.spec.ts verifica data-camera-direction=0,0,1.
- Con el build final: 142 Rust, fmt/Clippy, 145 TS, 23 WASM y 74 E2E en raíz (54,9 s) y 74 bajo /cnc-edu/ (55,4 s), todos correctos. Export raíz restaurado; hash WASM sin cambios. Logs y capturas en evidence/orthographic-camera-2026-10-22/.

## Selección del modelo de material movida a Rust

- Nuevo lab_profile.rs (lab_profile_at, needs_annular_model, LabProfile) y export WASM lab_profile. engine.ts deja de aplicar la regla T5. Detalle en LAB_PROFILE.md.
- Con el WASM reconstruido: 145 Rust, fmt/Clippy, 145 TS, 24 WASM y 74 E2E en raíz (55,5 s) y 74 bajo /cnc-edu/ (55,6 s), todos correctos. Export raíz restaurado. Hash 6b186174…eee9de.
- Siguiente: correctores. Antes de implementar, se presentan al usuario las decisiones semánticas abiertas de TOOL_OFFSETS_PLAN.md (unidades de la tabla, activación durante la ejecución, Tsstt).

## Correctores de herramienta: tabla fija por estación

- Decisiones del usuario: tabla fija por estación, X en diámetro, activación con el movimiento siguiente.
- Rust: tool_offsets.rs (ToolOffset, physical_tip, transformación atómica de la trayectoria física), Setup.tool_offsets y State.tip_position aditivos, rechazo en v1, lab_profile aplica la tabla.
- TS: contrato, borrador con errores por campo, proyecto v2, ToolOffsetsEditor en «Pieza y origen», vistas con punta física y DRO programado más la lectura «Punta física».
- Un revisor independiente encontró que un arco trasladado podía cruzar el eje: corregido con prueba. También se ajustó el mensaje del arco inicial, se limpió tipPosition en fallos y se documentaron el refrentado a X0 con corrector y T0.
- QA visual: el móvil rompía la grilla del DRO por una regla :has; corregido con una fila completa.
- Con el build final: 153 Rust, fmt/Clippy, 147 TS, 25 WASM y 75 E2E en raíz (58,4 s) y 75 bajo /cnc-edu/ (56,3 s), todos correctos. Export raíz restaurado. Hash 018a9ce5…f348f. Detalle en TOOL_OFFSETS.md.

## Ciclos G71/G70

- Formato Fanuc de dos bloques, desbaste exterior tipo I, expansión en Rust a movimientos comunes de un solo bloque (cycles.rs). Block.cycle aditivo. lab_profile exterior reutiliza la compilación v2 etiquetada como v1, para que v1 no rechace ciclos ni pierda correctores.
- Dos defectos encontrados por las pruebas durante el desarrollo:
  - esquinas interpoladas a ulps del contorno disparaban la guarda de ambigüedad: pasadas 0,001 mm antes en tramos inclinados, sin cambio de pieza;
  - el contorno arrancaba sin la sobremedida W: corregido.
- La práctica de diagnóstico «código no soportado» pasa de G71 a G76, y los E2E equivalentes también.
- Práctica guiada nueva cycle-roughing-finishing (catálogo solo v2).
- Revisión independiente: 3 bugs reales (bucle de niveles sin tope que podía congelar la UI, F del G71 ignorado en el perfil, G70 antes del perfil que lo ejecutaba dos veces) y 3 menores (`%`, diagnósticos duplicados, orden de errores). Todos corregidos con pruebas; límites restantes documentados.
- Con el WASM final: 160 Rust, fmt/Clippy, 147 TS, 26 WASM y 77 E2E en raíz y 77 bajo /cnc-edu/, todos correctos. Hash afdc926c…90ea8a. Detalle en CYCLES.md.

## Radio de punta y G41/G42

- Decisiones del usuario: tramos rectos con la compensación activa, activación y cancelación con el movimiento siguiente, orientación fija por herramienta. Módulo nose.rs, con la trayectoria de contacto consumida por el modelo de material puntual. State.compensation, Motion.lead y ToolOffset.noseRadiusMm son aditivos. COMP_LEAD_IN_STOCK está en los perfiles v2 y v3.
- Durante el desarrollo:
  - los acuerdos pasaron a cuerdas, porque el modelo anular no admite arcos;
  - el acuerdo pasó a pertenecer al corte previo, para que una salida en rápido no atraviese la esquina;
  - los solapes con rápidos se resuelven con un enlace.
- Revisión independiente: 4 bugs serios y 4 menores, más el sobrecorte de la esquina interna compensada, todos corregidos con pruebas. Detalle en NOSE_RADIUS.md.
- Pie de los planos 2D y 3D actualizado: ya no dice «sin compensación de punta».
- Con el WASM final: 168 Rust, fmt/Clippy, 148 TS, 27 WASM y 78 E2E en raíz y 78 bajo /cnc-edu/, todos correctos. Hash c38dfb16…c84d899.
- En paralelo: revisión visual contra las referencias de Amer Icon (docs/visual-review-2026-10-22/, sin copiar sus imágenes) y diagnóstico de GitHub solo de lectura. Ambas están pendientes de decisiones del usuario.

## Banco de trabajo a pantalla completa y tema claro

- Decisión del usuario: dirección B (clara) y distribución con visor a la izquierda y pestañas a la derecha. Detalle en WORKBENCH.md.
- E2E migrados a pestañas por un agente con uso exclusivo de Playwright (helper tests/e2e/workbench.ts). Comparado con el respaldo previo, cada spec conserva el mismo número de `expect`.
- Ajustes posteriores:
  - nombre accesible de la pestaña con errores («Programa (1 error)»);
  - etiqueta de herramienta del 2D movida a la franja de títulos, fuera del recorte del área de dibujo, porque tapaba la pieza (aviso del usuario).
- Investigación de datos de Sandvik en TOOL_DATA_SOURCES.md: no se redistribuyen datos de fabricante; se recomienda la opción ISO nominal.
- Checks: 168 Rust, 148 TS, 27 WASM y 78 E2E en raíz y 78 bajo /cnc-edu/, todos correctos. WASM sin cambios (c38dfb16…). Capturas en evidence/workbench-2026-10-22/.

## Escena clara y controles superpuestos (P2/P3)

- Plano 2D técnico con rayado de sección, escena 3D clara con ambiente generado, aristas y materiales por rol, y controles 3D sobre el lienzo. Detalle en WORKBENCH.md.
- Un E2E de abrir y cerrar el inspector superó el tiempo límite con el mapa de ambiente de 256 px en WebGL por software. Se bajó a 64 px.
- Checks: 148 TS, 78 E2E en raíz (1,4 min) y 78 bajo /cnc-edu/ (1,3 min). Rust y WASM sin cambios. Capturas en evidence/scene-light-2026-10-22/.
- En paralelo, un agente escribe el módulo puro de designaciones ISO 1832/5608 (opción A de TOOL_DATA_SOURCES.md).

## Herramientas ISO nominales (opción A)

- Un agente escribió el módulo puro isoDesignation.ts con 8 pruebas. Revisado: corrigió con razón el sentido del alto del mango (tangencial, coherente con el modelo existente).
- Integración: isoTools.ts (resolución por estación), conjuntos pasados de forma explícita a 2D/3D/biblioteca/inspector/preview, IsoToolsEditor en Herramientas, botón para copiar rε a correctores, persistencia en draft. Detalle en ISO_TOOLS.md.
- Checks: 168 Rust, 158 TS, 27 WASM y 79 E2E en raíz y 79 bajo /cnc-edu/, todos correctos.

## Animación continua y G96/G99 con tiempo estimado (en paralelo)

- **Animación (agente):**
  - motionAnimation.ts es puro y exacto en arcos; useToolAnimation hace el avance por cuadros.
  - El 2D mueve solo el marcador de la herramienta y el 3D usa `setToolPosition` sin reconstruir la malla.
  - Toggle «Animar trayectoria», respeto de reduced-motion, retroceso y reset sin animación.
  - Duración: avance 60 mm/s y rápidos 180 mm/s, acotada entre 150 y 600 ms (y a 0,8 del intervalo de reproducción automática).
  - Con correctores o nariz, el desplazamiento se interpola en el tiempo: arranca y termina exactamente en las puntas resueltas. Detalle en AUTOMATIC_PLAYBACK.md.
- **Husillo y avance:** G96/G97/G50/G98/G99 y tiempo estimado en Rust (timing.rs). Detalle en SPINDLE_TIME.md.
- El spec E2E de husillo tenía un refrentado parcial (no admitido por el modelo de material); se cambió por un refrentado hasta X0, que además prueba el límite G50 en el centro.
- Las pruebas existentes conservan todas sus verificaciones (comparado con el respaldo anterior).
- Checks: 173 Rust, fmt/Clippy; 164 TS; 28 WASM; 85 E2E en raíz y 85 bajo /cnc-edu/. Hash WASM 0f873359…4a753d.
- La referencia de lathesim (REFERENCE_LATHE_SIM.md) se revisó contra el estado actual. Las etapas A–C están cubiertas, salvo el ranurado con ancho real. Faltan puestas, mordazas, contacto y hoja de cotas, además de la vista dividida.

## Prácticas de cono y arco con criterio de taller

- El cono estaba invertido (decrecía hacia el plato) y el arco redondeaba hacia el plato: los dos obligaban a cortar con el flanco trasero de una cuchilla exterior a derechas. Se reescribieron con desbaste (T0101) y acabado (T0202). Detalle en GUIDED_EXERCISES.md.
- Pruebas actualizadas: exercises.rs (oráculos analíticos), profile_v2.rs (prefijos del cono nuevo; v1 se detiene en el bloque 15 con UNSUPPORTED_PROFILE_CUT), exercises/wasm TS y E2E de cono y operaciones guiadas.
- Checks: fmt/Clippy; 173 Rust; 164 TS; 28 WASM; 85 E2E en raíz y 85 bajo /cnc-edu/. Capturas en evidence/practices-shop-2026-10-22/.
- Pendiente propuesto: aviso de ángulo de trabajo (corte fuera del espacio libre del inserto), primer paso hacia los chequeos de colisión.

## Vista dividida 2D + 3D

- El selector suma «Dividida». Muestra plano 2D y pieza 3D sincronizados, lado a lado o apilados (≤ 900 px de ventana o ≤ 640 px de visor). Detalle en SPLIT_VIEW.md.
- Ranuras fijas en `.stage-view`: de 3D a Dividida no se recrea el contexto WebGL y se conservan la cámara, la proyección y la sección. El redimensionado usa el `ResizeObserver` existente.
- No se persiste el modo de vista. Rust y WASM sin cambios.

## Aviso de ángulo de trabajo (`TOOL_WORKING_ANGLE`)

- Módulo puro `working_angle.rs` en cnc-core: envolventes nominales por herramienta (vértices del inserto en el plano Z/R) y un aviso por bloque cuando un avance G01/G02/G03 atraviesa el tocho inicial en una dirección que obligaría a cortar con el flanco trasero. Es un aviso: el programa sigue siendo ejecutable. Detalle, ángulos supuestos y limitaciones en WORKING_ANGLE.md.
- T0101 (κr 95°, 80°) admite bajar hasta 5° hacia el plato; T0202 (κr 93°, 55°) hasta 32°; T0404 refrenta; T0303 solo radial ±3° o axial. T0 y T0505 son ideales y no se revisan.
- El cono anterior avisa en la línea 4 con T0101 (no con T0202 ni con T0); el arco anterior avisa en la línea 5 con T0202. Todas las prácticas actuales quedan sin aviso. `first-program.nc` con T0101 como setup avisa en `U-4 W-10` (chaflán que baja hacia el plato); con su setup T0 no.
- Sin cambios en la UI ni en el contrato TS: el esquema ya admitía avisos y el editor los muestra en ámbar.
- Checks: fmt/Clippy; 182 Rust; 164 TS; 29 WASM; 85 E2E en raíz. No se corrió la variante bajo /cnc-edu/.
