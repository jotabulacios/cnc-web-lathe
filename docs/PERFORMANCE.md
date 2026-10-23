# Rendimiento del motor y programas largos

Medición local del 22/10/2026. La aplicación sigue siendo Next.js/React + Rust/WASM, sin backend. No se cambió el dialecto, el cálculo de material ni la ABI. La referencia visual y la ruta funcional hacia interiores, puestas y mordazas se documentan en REFERENCE_LATHE_SIM.md.

## Método y reproducción

`pnpm bench:engine` usa el WASM real con dos calentamientos y siete muestras por caso. Valida los contratos, comprueba el dominio y usa volúmenes analíticos de cilindros/frustos para casos completos. Devuelve JSON con versión de runtime, CPU, hash WASM y tiempos. El perfil incluye una nueva compilación del programa porque así funciona el export actual; no se presenta como tiempo puro de geometría.

`CNC_BENCH_REPORT_DIR=<carpeta> pnpm bench:browser` usa una compilación estática existente (`pnpm build:web`), Chromium y un único worker de pruebas. Mide los mismos exports en el navegador y luego el flujo real de abrir un archivo NC e interpretar hasta el perfil del bloque 0. El flujo UI tiene una muestra por caso e incluye lectura del archivo, React/SVG, validación, compilación y el primer perfil. Las pruebas comprueban resultados, no imponen umbrales de milisegundos dependientes de hardware. Para reproducir entrada por automatización se puede usar `CNC_BENCH_INPUT=fill`.

Las ejecuciones base y posterior de importación se hicieron por separado, sin paralelizar la medición. Los valores son evidencia local, no promesa de rendimiento universal. Las capturas de antes y después usaron el editor anterior y el editor con ventana de líneas, respectivamente; se restauró el código actual y el export raíz después de medir la base.

## WASM en Node, medianas de siete muestras (ms)

Runtime: v24.19.0; plataforma linux/x64; CPU AMD Ryzen 5 PRO 5650U with Radeon Graphics. Hash del WASM: `5bccdf6ae7e7fde7b9dfe4414c54efa2c3808d84e0bde75ceeefc40cab684d3d`.

| Caso | Bloques | Compile + serialización | Validación resultado | Perfil + recompilación | Copia estructurada | Perfil |
|---|---:|---:|---:|---:|---:|---|
| air-100 | 102 | 1.04 | 2.69 | 0.23 | 0.80 | Completo |
| air-1000 | 1002 | 4.33 | 8.44 | 0.82 | 6.97 | Completo |
| air-9000 | 9002 | 33.66 | 54.76 | 5.28 | 58.93 | Completo |
| contour-100 | 105 | 0.46 | 0.55 | 0.21 | 0.65 | Completo |
| contour-500 | 505 | 2.14 | 2.47 | 1.46 | 3.12 | Completo |
| contour-1000 | 1005 | 4.24 | 4.55 | 4.46 | 6.42 | Completo |
| contour-1800 | 1805 | 7.48 | 11.29 | 8.48 | 12.23 | PROFILE_LIMIT |

La memoria lineal WASM registrada en JSON es una reserva de máximo alcanzado, no el heap vivo total del navegador. El tamaño JSON de respuesta aproxima volumen de datos; no mide RAM exacta ni coste de transferencia real de un Worker.

El caso contour-1800 se detiene con PROFILE_LIMIT y conserva 1413 tramos/prefijo de referencia. No se aumentaron límites ni se ocultó ese diagnóstico para pasar una prueba. Los contornos alternan radios de 20/22 mm en tramos de 1 mm: cada frusto tiene volumen π(400+440+484)/3. El caso de aire no retira material y conserva 62500π mm³.

## Flujo de abrir NC e interpretar, antes/después

| Caso | Antes: hasta listo (ms) | Después: hasta listo (ms) | Antes: pausa máxima entre frames (ms) | Después: pausa máxima entre frames (ms) |
|---|---:|---:|---:|---:|
| air-100 | 175.3 | 173.9 | 16.7 | 16.7 |
| air-1000 | 308.2 | 224.4 | 33.3 | 16.7 |
| air-9000 | 1734.0 | 669.9 | 833.2 | 216.6 |
| contour-1000 | 359.0 | 242.8 | 49.9 | 16.8 |

En el caso de 9000 movimientos, la apertura/interpretación medida bajó de 1734 a 670 ms aproximadamente. Permanecen tareas largas: el mayor long task posterior fue 160 ms y la pausa máxima entre frames fue 217 ms. No se declara eliminada toda interrupción de interfaz. Una repetición final después de ajustar la barra nativa dio 807 ms en raíz y 821 ms en subruta, con pausas de frame de unos 267 ms; la variación confirma que no debe tratarse la cifra inicial de 670 ms como garantía.

La primera variante automatizada, usando locator.fill con 9000 líneas, excedió 90 s tanto con el editor anterior como con la ventana de líneas. Este resultado no demuestra por sí solo que todo pegado real tarde lo mismo, ni se atribuye exclusivamente al motor. Se conserva como limitación por investigar del flujo de entrada masiva/automatización. La apertura de archivo NC de ese tamaño sí fue verificada en ambas versiones. No comparar tiempos de fill con importación para atribuir una mejora.

## Cambio realizado

El editor conserva todo el texto en su textarea nativo. Solo dibuja en la capa de colores y en la numeración las líneas visibles y un margen de contexto. El alto lógico corresponde a todo el documento. La ventana sigue el scroll, el tamaño del editor, los bloques completados y el foco de un diagnóstico. La numeración añade el espacio ocupado por la barra horizontal nativa para igualar el rango vertical al llegar al final; una prueba fuerza barras de 15 px y compara posiciones visibles. Los offsets UTF16 y la descarga siguen usando el texto completo.

No se introdujo parser CNC en JavaScript. El tokenizer de colores ya existente se aplica a las líneas de presentación; la interpretación sigue en Rust. Se mantiene atribución del editor adaptado del upstream.

Una regresión de navegador abre un archivo de 9000 líneas, localiza G71 en la línea 8999 con espacios, tabulación y Unicode delante, comprueba selección exacta y sincronización horizontal/vertical, cambia tamaño de escritorio a móvil y descarga el contenido íntegro. Después reemplaza por un programa corto y verifica que se retiren las líneas antiguas.

## Decisión sobre Worker

No se introduce Worker en esta entrega. En 1000 movimientos el export nativo del navegador tarda unos 4–5 ms y el perfil menos de 5 ms; en 9000, el compile mediano ronda 35 ms mientras la copia estructurada ronda 58 ms. Un simple traslado del mismo objeto grande a otro hilo no resuelve todo el coste, y React/SVG continúa en el hilo principal. La medición no pretende demostrar que nunca se necesite un Worker.

Siguiente paso de rendimiento, si se priorizan archivos cercanos al máximo: aislar entrada/edición masiva, validación, transferencia y renderizado de trayectorias. Evaluar un protocolo Worker acotado por revisiones y mensajes cancelables, junto con tamaño de respuestas y mantenimiento de resultados obsoletos. Medir de nuevo antes de cambiar el contrato. No elevar límites de material para mejorar una cifra.

Estado de gates, export raíz y QA: HANDOFF.md y evidence/performance-2026-10-22/.


Entrega del 22/10/2026 cerrada: typecheck, ESLint y 89 pruebas TypeScript correctos; 58 E2E Chromium en raíz (46,1 s) y 58 bajo /cnc-edu/ (45,9 s) correctos, incluida apertura íntegra de 9000 líneas, selección Unicode/tabulación, resize y alineación visible con barras de 15 px. Cuatro casos de rendimiento adicionales correctos en raíz y cuatro en subruta (5,3 s cada lote). Export raíz restaurado, preview 3100 actualizado y servidor restablecido. HTTP 200 y MIME correctos para HTML/JS/WASM. QA real en pestaña nueva: documento de 1001 líneas, 33 filas dibujadas, G71 seleccionado en línea 999 y diferencia vertical de 0 px entre código y numeración. Captura outputs/torno-editor-largo-2026-10-22.png. Evidencia docs/evidence/performance-2026-10-22/. Sin cambios de semántica Rust/ABI ni apariencia de herramientas. Las 84 pruebas nativas y 18 WASM de la entrega anterior no se repitieron; se conservan sus logs, y el benchmark ejecutó el binario WASM real con nuevos casos. Fuentes y preview respaldados y ZIPs comprobados al cerrar.

La evidencia incluye el editor base como GCodeEditor-baseline.tsx.txt y hashes de fuentes para reproducir la comparación sin depender de un historial Git que aún no existe. El editor actual está en src/components/GCodeEditor.tsx.
