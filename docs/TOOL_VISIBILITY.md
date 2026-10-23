# Herramientas visibles en 2D y catálogo

## Problema y resultado

El usuario no distinguía los tipos T1–T4 en la vista 2D. Existían marcadores pequeños sin código junto a la punta y el selector inicial estaba dentro de «Pieza y origen».

Se añade un catálogo visual plegable T0–T4, inicialmente abierto, con formas y colores compartidos con el marcador 2D. Cada tarjeta elige la herramienta inicial mediante el mismo cambio de setup existente; no modifica el código. La tarjeta inicial se indica con `aria-pressed`, mientras «En la punta» identifica el estado de ejecución. Son estados distintos: un bloque T2 puede activar acabado aunque T4 siga siendo la herramienta inicial.

La vista longitudinal muestra una ilustración 1,5 veces mayor y una etiqueta con T corto y tipo. La punta clara permanece exactamente en la posición X/Z interpretada. El encuadre reserva 72 unidades SVG arriba, 48 a la derecha y 6 a la izquierda para mantener visible el marcador, incluso con coordenadas extremas. La escala física de radio y Z sigue siendo idéntica; el tamaño de la herramienta es ilustrativo e independiente de esa escala.

En escritorio, «Ampliar plano 2D» usa la relación de aspecto natural del SVG y el ancho del panel. «Reducir» restaura la altura compacta. Este control de presentación no cambia el programa, cursor, revisión ni material calculado. En pantallas estrechas ya se utiliza el ancho natural y el control no se ofrece.

## Separación de responsabilidades

- `LatheToolGlyph.tsx`: ilustración SVG reutilizada por catálogo y vista 2D, sin estado ni semántica CNC.
- `ToolLibrary.tsx`: elección inicial y presentación de estados; utiliza `TOOL_CATALOGUE`.
- `LatheLab.tsx`: reutiliza `changeSetup`, invalidación de revisión y persistencia existentes.
- `LatheViewport.tsx` / `viewport.ts`: proyección y espacio de presentación.
- Rust y WASM no cambian. T sigue resolviéndose en el intérprete, también al retroceder o reiniciar.

El dibujo no añade radio de punta, ancho de cuchilla, compensación, restricciones de corte ni colisiones. T3 conserva su etiqueta educativa de ranurado, pero la geometría calculada continúa siendo puntual. El catálogo lo explica antes de seleccionar.

## Verificación

La prueba de catálogo recorre T1–T4, conserva el código, comprueba cambio T2 durante ejecución, diferencia herramienta inicial de activa, retrocede a T4 y exige invalidación al seleccionar T1. Las pruebas de encuadre conservan escala física 1:1 y verifican espacio superior y derecho con coordenadas extremas. Una segunda prueba amplía/reduce el plano, exige que el marcador crezca y conserva el bloque y la herramienta. La suite existente cubre persistencia, 3D, setup, reproducción y diagnóstico.

Entrega cerrada: 85 pruebas TypeScript, typecheck y ESLint correctos. Build estático y 52 E2E Chromium correctos en raíz (32,5 s) y 52 bajo /cnc-edu/ (33,0 s); export raíz restaurado y preview local 3100 actualizado. Rust y WASM no se modificaron: la evidencia anterior de 82 Rust y 17 WASM sigue en guided-operations/. QA en pestaña nueva: selección T2, ampliación del plano y cambios T1/T2/T3/T4 reales; punta T4 al bloque 4/5 mientras T2 permanece inicial. Clic sobre la inicial ya elegida conserva el cursor. Capturas outputs/torno-herramientas-2d-t2.png y torno-herramientas-2d-t4.png. Evidencia tools-2d/. Fuentes y preview respaldados en ZIP al cerrar.
