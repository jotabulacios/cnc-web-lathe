# Vista de revolución 3D — plan del incremento

20 de octubre de 2026. Se agrega una vista opcional Three.js que consume exclusivamente el perfil calculado por Rust. No cambia el núcleo ni agrega códigos CNC.

> Actualización posterior: la malla pasó a consumir el perfil v2 (radios lineales, conos). Ver «Malla v2» al final de este documento.

## Decisiones antes de implementar

- 2D sigue siendo la vista inicial; 3D se carga bajo demanda. Se usa Three.js directo para evitar introducir otra capa de estado/render y mantener el incremento acotado.
- La malla se deriva en un módulo TS puro a partir de radios físicos y límites Z. Usa superficies cilíndricas, hombros anulares y tapas; los intervalos de radio cero no se rellenan. Se conservan las discontinuidades del perfil.
- El eje longitudinal de la escena será X, que representa Z físico. El centro y la escala dependen del stock inicial, para que avanzar o retroceder no cambie la cámara.
- No se presenta como remoción volumétrica ni como simulación física. Un perfil parcial conserva la advertencia y el último prefijo confiable.
- OrbitControls permite girar/zoom. Render a demanda ante interacción, cambio de perfil o tamaño; sin animación perpetua ni giro del husillo.
- Recursos, eventos, observadores y contexto WebGL se liberan al desmontar. Sin WebGL, carga fallida o contexto perdido se ofrece volver a 2D.
- Límites: 4096 tramos y resolución angular acotada. Probar volumen analítico, normales/winding, radio cero, extremos y presupuesto de geometría.

## Verificación prevista

Pruebas TS de geometría independientes de WebGL. E2E sobre WASM real: selección 2D/3D, sincronía de bloque al avanzar/retroceder/reiniciar y fallback WebGL. Build export en raíz y subruta. Revisión visual del cilindro y escalones. No afirmar cobertura Firefox/WebKit ni exactitud de mallado circular continua: la sección circular se aproxima por facetas.

## Implementación

Three.js 0.186.1 y tipos 0.186.0, fijados en lockfile. `LatheThreeView.tsx` carga `threeScene.ts` al seleccionar 3D; el bundle Three no se importa desde el núcleo ni el adaptador WASM. `revolution.ts` es una proyección pura y comprobable sin GPU. La herramienta y las trayectorias permanecen en la vista 2D; en 3D se muestra únicamente el material. La sección circular usa 48 facetas; no se inventa curvatura axial.

El perfil siempre cubre el stock completo entre −longitud y Z0. «Parcial» se refiere a un prefijo de bloques ejecutados de confianza, no a truncar el sólido espacialmente. Las tapas se generan en extremos del material o límites de islas separados por radio cero. Los escalones se cierran con anillos, sin discos internos superpuestos. El volumen analítico deriva de los radios de Rust; el volumen de la malla facetada difiere por sin(2π/N)/(2π/N).

La escala usa max(longitud, diámetro), el centro queda fijo en −longitud/2 y los radios se usan directamente, sin dividir X dos veces. Una geometría que colapsa al convertir a float32 produce aviso y alternativa 2D, en vez de mostrar tramos falsos. Se valida cobertura completa, contigüidad, radios dentro del stock, finitud y límites. No se recortan tramos silenciosamente.

Los buffers propios de la malla máxima quedan por debajo de 32 MiB: esto no incluye la memoria de Next, Three, GPU, ni el pico temporal al reemplazar la malla. Los índices son Uint32. La construcción de 4096 tramos alternados tardó aproximadamente 198 ms en una corrida local de tests; no es garantía de latencia universal. Se usa preasignación de typed arrays, sin staging de toda la malla en arrays JS.

OrbitControls tiene damping y zoom por rueda desactivados. Se gira arrastrando o con botones y se hace zoom con +/−; la rueda sigue desplazando la página. El renderer dibuja ante cambios, sin RAF permanente. ResizeObserver y resize actualizan dimensiones/DPR con máximo 2. Se conserva la cámara al avanzar/retroceder; cambiar setup o reintentar crea una nueva escena. Se liberan geometrías, material, grid, controles, listeners, observador y contexto al desmontar.

## Colaboración y fuentes

agy aportó una propuesta de malla. Al revisarla se corrigieron winding invertido, tapas degeneradas, validación incompleta y asignación de memoria. Sus tests de normales unitarias por sí solos no detectaban winding incorrecto; se agregaron tests de orientación de caras, aristas y volumen firmado.

DeepSeek vía OpenCode revisó el plan y señaló costura angular, degenerados, recursos, iluminación y lifecycle. Se incorporaron estas verificaciones. Su observación sobre truncado de un perfil parcial no aplica al contrato actual, que entrega todo el stock del último bloque confiable.

Una segunda revisión de agy señaló posibles carreras basadas en interrupción de código JS síncrono, comparación monótona de bloques y fugas hipotéticas. No se aplicaron esas propuestas: el cleanup marca cancelación y limpia la escena creada; el callback y cleanup no se intercalan dentro del mismo turno JS; los bloques deben poder disminuir por anterior/reset; las excepciones de import/update ya se capturan y los buffers se conservan/disponen con su propietario. El test de carga demorada y regreso a 3D verifica la propiedad y el cursor. Se preserva el informe como revisión, no como lista de defectos confirmados.

API consultada: [documentación oficial Three.js](https://threejs.org/docs/) y código/tipos del paquete instalado. Licencia MIT copiada a licenses/three.MIT.txt y public/licenses/three-MIT.txt.

## Estado de verificación

34 pruebas TS correctas, incluidas 5 de geometría: cilindro, escalones asimétricos, radio cero, entradas inválidas/precisión y presupuesto de 4096 tramos. Los tests verifican winding contra normales, ausencia de triángulos degenerados, aristas soldadas con dos caras de orientación opuesta y volumen firmado de la malla. Volumen analítico usa tolerancia absoluta de 1e−9 mm³ en la fixture escalonada por orden de sumas; malla float32 usa tolerancia relativa de 1e−6.

Resultado final Chromium: 16 E2E correctos en raíz y 16 bajo /cnc-edu/, incluido el caso de cancelación con descarga demorada. Export Next y checks de tipos/lint correctos; evidencia en evidence/revolution-*.log. Los casos sin WebGL usan flags nativos del navegador y el de pérdida de contexto la extensión WEBGL_lose_context, sin hooks de producción.

No hay cobertura de Firefox/WebKit, cambios de monitor/DPR específicos ni conteo exhaustivo de recursos GPU. Las alternancias verifican un canvas actual y ninguno al desmontar; no equivalen a un profiler de fugas. No se agregó un servidor de cálculo ni se publicaron cambios remotos.


## Herramienta 3D añadida después

Por pedido del usuario se agregó una punta ideal con cuerpo esquemático de tamaño ilustrativo. Su posición proviene del snapshot Rust actual; la escala/origen son idénticos a los del material. No se vuelve a dividir el diámetro. Sigue anterior/reset y movimientos modales. Si la posición está fuera del marco cercano al material se oculta el marcador y se informa la situación. No se evalúa colisión del cuerpo ilustrativo ni compensación de punta. Prueba pura adicional de proyección y aserciones E2E de X/Z/visibilidad durante paso, retroceso y reset. Evidencia en tool-three-*.log y, posteriormente, exercises-e2e-*.log.

## Malla v2: conos exteriores

Con el perfil v2 la malla se construye en `revolutionV2.ts` a partir de tramos con radio inicial y final, en lugar de radios constantes.

- Un tramo con `rStart == rEnd` sigue siendo un cilindro. Un tramo con radios distintos se genera como tronco de cono, con la normal de la generatriz inclinada (no radial), de modo que el sombreado siga la superficie real.
- Un tramo que termina o empieza en radio cero es un ápice: se genera como abanico de triángulos con vértice único en el eje, sin anillos degenerados y con normal propia por cara, porque la normal de la superficie no está definida en la punta.
- Los saltos de radio entre tramos se cierran con anillos (hombros) y los extremos del material con tapas, igual que en v1. Los intervalos de radio cero se conservan como huecos y no se rellenan.
- El volumen analítico se calcula por tramos con la fórmula del tronco de cono: `π · Δz · (r1² + r1·r2 + r2²) / 3`. La suma coincide con el volumen del perfil emitido por Rust.
- Se validan las posiciones realmente convertidas a Float32, no solo las de entrada: un rango que colapse al pasar a float32, una pendiente que se aplane o un escalón demasiado pequeño producen un aviso y la alternativa 2D, en vez de mostrar tramos falsos. La memoria se mantiene acotada con preasignación de typed arrays.
- El eje longitudinal de la escena sigue siendo X, que representa Z físico; la escala usa `max(longitud, diámetro)`. Cambiar el cono no cambia la cámara.
- `revolution.ts` (v1) se conserva para regresión y `threeScene.ts` usa la versión v2.

Verificación: 9 pruebas puras de la malla v2 (cono analítico, cilindro, ápice de radio cero, hombros, huecos, entrada inválida, precisión float32) más las 6 de v1; E2E con volumen analítico del cono y del ápice, y el caso de ambigüedad numérica que congela el perfil conservando su volumen anterior. En la QA visual del cono se comprobó que la silueta 3D medida coincide con el perfil 2D: el control con el cono invertido invierte la medida, de modo que la comprobación distingue la dirección.

Siguen pendientes: arcos, conos que menguan hacia Z negativo, corte radial, avance inverso, ciclos, compensación de punta y cualquier modelo de removimiento validado fuera de este ideal educativo.

