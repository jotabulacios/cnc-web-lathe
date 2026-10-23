# Inspector de herramienta — 22/10/2026

Primera mitad del incremento de TOOL_INSPECTOR_SECTION_PLAN.md. Presentación pura: no cambia Rust, WASM, contratos, perfiles, evaluación ni proyectos guardados.

## Qué hace

- Panel «Inspector de herramienta» bajo el catálogo, cerrado por defecto. Mientras está cerrado no monta nada.
- Por defecto sigue la herramienta activa en la punta (incluye cambios T y retroceso). El selector «Herramienta a inspeccionar» elige otra de forma LOCAL: no llama a la selección de herramienta inicial, no invalida la ejecución ni mueve el cursor.
- Silueta Z/R en mm a escala real del conjunto con cotas de envolvente, ejes y la esquina ideal Z0/R0 local (rotulada como origen local, no posición de máquina).
- Vista previa 3D aislada con cámara ortográfica (isométrica, frente Z/R, planta Z/tangencial, giro y zoom) y ejes de 10 mm en la esquina ideal.
- Tabla de medidas por parte y envolvente Z/R/tangencial, ángulo de punta y procedencia (diseño educativo propio, revisión del conjunto).

## Implementación

| Archivo | Responsabilidad |
|---|---|
| src/lib/lathe/toolInspection.ts | Puro: selección activa/local, medidas desde TOOL_ASSEMBLIES, encuadre ortográfico |
| src/lib/lathe/toolPreviewScene.ts | Escena Three aislada; reutiliza createToolObject, sin stock ni createThreeScene |
| src/components/ToolPreview.tsx | Ciclo de vida WebGL: import dinámico, montaje al abrir, dispose al cerrar, reintento |
| src/components/ToolInspector.tsx | Panel, selector local, SVG con LatheToolGlyph, tabla |

Como máximo hay dos contextos WebGL: la pieza 3D y la preview. Al cerrar el inspector, la preview libera geometrías, materiales, observer y contexto. Sin WebGL quedan la silueta, las medidas y un botón de reintento, y la ejecución sigue disponible.

## Verificación

- 4 pruebas TS nuevas (tests/toolInspection.test.ts), con oráculos de envolvente para T1/T5/T3 calculados a mano desde los polígonos, coincidencia con las mallas Three reales de los 6 conjuntos y encuadre a distintas relaciones de aspecto.
- 3 E2E nuevos: tests/e2e/tool-inspector.spec.ts (cerrado por defecto, sigue T y retroceso, inspección local sin alterar fuente/cursor/DRO/setup/herramienta inicial, cotas 3D T5 [0,64]×[−10,0]×[−8,0] mm, coexistencia con la pieza 3D y liberación del contexto) y un caso sin WebGL en no-webgl.spec.ts.
- Resultado: 142 Rust, fmt y Clippy correctos; 141 TS con typecheck/lint; 23 WASM reales; 71 E2E en raíz y 71 bajo /cnc-edu/. El WASM no cambió (hash 6ef8129d…715d). Logs y capturas en evidence/tool-inspector-2026-10-22/.

## Revisión independiente posterior

Un agente revisor (solo lectura) no encontró bugs bloqueantes. Se aplicaron sus mejoras:
- try/catch de setTool con mensaje propio y diferido en el efecto;
- encuadre que incluye las puntas de los ejes de 10 mm;
- estado «custom» al arrastrar o girar, para que el botón de vista no quede desactualizado;
- foco conservado al reintentar;
- tabla con caption y encabezados de fila.

En los E2E se agregaron: celdas exactas de la envolvente, data-view del canvas, data-attempt al reintentar y 8 ciclos de abrir/cerrar con la pieza 3D activa, sin perder el contexto principal.

## Límites

Las medidas describen el conjunto visual educativo, no alcance, colisiones ni compensación. La cámara principal de la pieza sigue en perspectiva. La sección 3D está implementada: ver SECTION_3D.md.
