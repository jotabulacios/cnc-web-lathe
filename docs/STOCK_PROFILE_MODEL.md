# Modelo de perfil exterior — v1 (radios constantes) y v2 (radios lineales)

Decisión para esta entrega: representar un sólido de revolución mediante intervalos axiales de radio constante, sin grilla y con precisión f64. Esto cubre cilindrado exterior y escalones, evita un error de discretización y mantiene el cálculo en Rust. Se usa herramienta puntual ideal, sin radio de punta, ancho, portaherramienta ni orientación física del inserto.

La versión 2 extiende el mismo modelo a radios interpolados linealmente (conos exteriores) sin cambiar el contrato de compilación. Las reglas de v1 siguen vigentes tal como están escritas; la sección «Modelo v2: conos exteriores» describe lo que se agrega.

## Reglas y límites (v1)

- Stock inicial: radio D/2 en Z=[−L,0]. Se dibuja la sección completa reflejando ese radio alrededor del eje. Los spans de salida cubren el stock y conservan límites exactos; spans contiguos de igual radio se fusionan.
- Remueve material únicamente G01 con radio constante y Z decreciente, husillo encendido y S>0. En el tramo dentro del stock se conserva el menor radio entre el perfil existente y la punta. El avance F no cambia la geometría de esta aproximación.
- M03 y M04 habilitan este modelo puntual; no se valida el sentido de giro contra una herramienta real. Las modalidades proceden del snapshot del bloque interpretado, incluidos cambios de husillo en el mismo bloque.
- Viajes por aire o zonas ya retiradas no modifican el perfil. G00 nunca remueve material.
- G00 que penetra material, avance con husillo detenido/cero RPM y cortes radiales, oblicuos o en +Z que necesitan remover material quedan fuera del modelo. No se fabricará un perfil para ellos: la geometría se congela antes del bloque, con diagnóstico y línea fuente. La interpretación de trayectorias puede continuar, claramente diferenciada del perfil parcial.
- Contacto tangencial no cuenta como penetración. Z=0 y Z=−L son caras de espesor nulo en el modelo; se permite aproximación puntual a la cara Z0 seguida de corte axial −Z. En un escalón, el radio de contacto puntual en la frontera es el mínimo de los intervalos adyacentes: permite retirar la herramienta, pero no atravesar material por debajo de ese mínimo.
- Una posición inicial dentro del stock produce diagnóstico antes del primer bloque. Stock inválido o programa con errores no generan un perfil autoritativo.
- Los tramos se recortan al intervalo del stock; el plato ilustrado no participa en contacto/colisiones. Radio cero representa ausencia de material en ese intervalo, sin física de separación de piezas.
- Límites de recursos: 4096 intervalos y presupuesto de 2.000.000 de operaciones sobre spans por petición. Un corte se aplica como transacción; si excede los límites se conserva el perfil previo y se emite PROFILE_LIMIT.

## Estado, reproducción y frontera WASM

`profile_at(programa_interpretado, stock, bloques_completados)` reconstruye desde el cilindro inicial hasta el prefijo solicitado. No modifica el compilador ni guarda un sólido por cada bloque. Avanzar, retroceder y reiniciar usan la misma función determinista.

Una exportación WASM separada recibe `{program: CompileRequest, completedBlocks}`: interpreta en Rust y calcula ese prefijo. El contrato de compilación v1 se conserva; el perfil tiene `profileVersion:1`, revisión de fuente, cursor solicitado, bloques geométricamente evaluados, spans, indicador `complete` y diagnósticos.

`complete` significa que el perfil corresponde a todo el prefijo solicitado; no significa que terminó el programa ni que una operación es segura. Un resultado parcial identifica el último bloque confiable y la línea que detuvo la geometría. La UI verifica revisión y cursor; resultados viejos o errores no se presentan como geometría actual.

El recálculo se invoca por paso discreto, nunca por frame. Para programas educativos cortos priorizamos una función pura verificable; un futuro programa compilado persistente o Worker puede evitar volver a interpretar al cambiar cursor, conservando el API semántico y los fixtures. No se optimiza mediante min(X) en TypeScript: React solo proyecta los intervalos emitidos por Rust.

## Casos de referencia necesarios

1. Cilindro intacto: solo aire/G00 exterior o cero bloques.
2. Cilindrado Ø40 durante 40 mm sobre stock Ø50×100: [-100,-40] r25 y [-40,0] r20.
3. Segundo corte Ø30 durante 20 mm: [-100,-40] r25, [-40,-20] r20 y [-20,0] r15.
4. Retiro radial desde un escalón, retorno por aire y pasada repetida: no restituyen material ni inventan cortes.
5. Penetraciones rápidas y diagonales con extremos exteriores: detectar el interior a lo largo del segmento, no solo en sus extremos.
6. Husillo apagado, giro en el mismo bloque, inicio interior, tangencias, caras y límites de recursos.
7. Perfil al retroceder igual al prefijo calculado desde cero; reset vuelve al cilindro inicial.
8. Límites fraccionarios y escalones pequeños: no usar una grilla ni un epsilon fijo que borre cortes válidos.

Esta es una aproximación geométrica educativa de cilindrado exterior. No modela fuerza de corte, colisiones de herramienta/plato, compensaciones, ranuras, refrentado de espesor finito ni cortes con insertos reales. El perfil cónico exterior se describe en la sección v2 de este documento; el resto de las ausencias sigue vigente.

## Modelo v2: conos exteriores

El perfil v2 sustituye al radio único de cada intervalo por un radio inicial y un radio final, con interpolación lineal entre ambos. Un cilindrado sigue siendo un caso degenerado (`rStart == rEnd`). El intervalo sigue siendo un tramo axial contiguo y ordenado; el radio puede saltar en un hombro.

- Solo G01 hacia Z negativo con husillo encendido y S>0 puede remover material. Un cono que mengua hacia Z negativo (radio final menor) queda fuera del modelo, igual que el corte radial y el avance inverso: el perfil se congela antes del bloque, con diagnóstico y línea fuente.
- El corte ideal deja `min(rActual(z), rHerramienta(z))` en la zona de solapamiento. Fuera del stock o de la pieza ya retirada, el perfil se conserva. La diferencia entre la recta del perfil y la recta de la herramienta tiene como máximo un cruce por tramo; en intervalos abiertos basta evaluar esa diferencia lineal en sus extremos.
- Contacto no es penetración. En una frontera interior se considera el menor radio vecino, como en v1, lo que permite retirar la herramienta sobre un hombro sin atravesar el material por debajo de ese mínimo.
- Un ápice de radio cero es válido geométricamente y requiere proyección 3D específica (abanico de vértices).
- Política numérica `AmbiguousComparison`: una diferencia no nula de hasta `32 · epsilon · max(radios, MIN_POSITIVE)` devuelve un error explícito, nunca permiso de corte ni declaración de aire. La igualdad almacenada sigue siendo contacto. Es una política práctica y conservadora para un simulador educativo, no aritmética de intervalos certificada. Se expone como `PROFILE_NUMERICAL_AMBIGUITY`; un cruce que no cabe estrictamente dentro de su intervalo produce `PROFILE_NUMERICAL_INTERSECTION`. En ambos casos se conserva la geometría anterior.
- Límites de recursos: 4096 intervalos y presupuesto de 2.000.000 de operaciones por petición, igual que v1. Un corte se aplica como transacción; si se exceden los límites se conserva el perfil previo y se emite `PROFILE_LIMIT`.
- El contrato `compile` v1 y la exportación `stock_profile` v1 conservan su semántica y su forma de respuesta. `stock_profile_v2` es un export aditivo.

## Implementación y verificaciones de esta entrega

Implementado en `crates/cnc-core/src/profile.rs`, exportado mediante `cnc-wasm::stock_profile` y validado por el adaptador TypeScript. El renderer `profilePath.ts` solo proyecta spans; separa intervalos de radio cero sin rellenar huecos. El resultado async se muestra únicamente si coinciden revisión, cursor y tentativa; editar fuente/setup invalida el perfil. Un aviso parcial no bloquea interpretar trayectorias, y los controles de paso esperan a que termine el cálculo del perfil solicitado.

El ejemplo inicial de la web es ahora `fixtures/lathe/two-step-turning.nc` (13 bloques). El fixture G00/G01 original de nueve bloques se conserva como referencia del intérprete y como prueba de corte oblicuo fuera de este modelo. La procedencia del editor reutilizado no cambia; parser, geometría y estado de torno siguen siendo propios.

Verificación real:

- 24 pruebas Rust correctas: 12 del intérprete, 11 de integración de perfil y una unitaria de límites transaccionales.
- 23 pruebas TypeScript correctas: las 18 anteriores, contrato/selección de revisión de perfil y proyección de contornos.
- 7 pruebas WASM correctas: las tres previas más cilindrado/escalones, rewind/reset, perfil parcial y peticiones/penetraciones inválidas.
- Rust fmt/clippy con warnings como errores, typecheck, ESLint y build estático correctos.
- Navegador: se comprobaron los perfiles exactos de los bloques 5 y 9, final 13, retroceso al bloque 8 y reset. La tabla muestra Ø50/40/30 sobre los intervalos esperados. El programa original con diagonal produce perfil parcial hasta bloque 5 y aviso en línea 6.
- Prueba puntual de recursos sobre este host, Node24/WASM: 9951 bloques y 109304 bytes; respuesta en 31,54 ms, PROFILE_LIMIT después de 4464 bloques evaluados y 893 spans, conservando el último bloque completo. Es una medición puntual, no garantía de latencia para otros dispositivos.

Se conserva el compilador v1 sin agregarle campos: el perfil usa un endpoint WASM separado. Todavía no hay cámara 3D, remoción volumétrica general, ciclos, compensación, contactos con plato/portaherramienta ni certificación física.

## Implementación y verificación de v2

El kernel puro está en `crates/cnc-core/src/linear_profile.rs` (validación de tramos lineales, lower envelope, contacto estricto, límites transaccionales; no interpreta G-code) y la reconstrucción por prefijos en `crates/cnc-core/src/profile_v2.rs` (husillo encendido y RPM positivas, corte G01 exterior hacia Z negativo, rollback del bloque entero). La exportación `cnc-wasm::stock_profile_v2` es aditiva; `stock_profile` sigue siendo legacy v1.

En TypeScript, `profile.ts` define el schema estricto v2 y `ProfileResponseV2`; `engine.ts` expone `computeStockProfileV2`, que verifica revisión, cursor y dimensiones del stock; `profilePathV2.ts` proyecta los tramos con extremos radiales y huecos; `revolutionV2.ts` construye la malla de revolución. `LatheLab`, `LatheViewport` y `LatheThreeView` consumen v2. La tabla de medidas muestra «diámetro inicio → fin» cuando el radio varía.

Verificación real:

- 46 pruebas Rust correctas: 25 anteriores, 12 del kernel lineal y 9 de reconstrucción v2.
- 10 pruebas sobre el WASM real correctas, incluyendo el cono, solicitudes inválidas, numeración de requests y el camino legacy.
- 67 pruebas TypeScript correctas, con typecheck y ESLint.
- 36 E2E Chromium correctos en la raíz y 36 bajo `/cnc-edu/`, incluidos volumen del cono, rewind/reset, ápice y el diagnóstico de ambigüedad numérica. Logs en `evidence/profile-v2-*.log`.
- QA visual manual del cono sobre el export raíz: se cargó `fixtures/lathe/taper-turning.nc` con el setup por defecto Ø50 × 100 mm, se interpretó y se avanzaron 4 bloques. La tabla muestra Ø50 entre −100/−60 y Ø20 → Ø40 entre −60/0; la malla 3D da 39000π mm³ (122522,113490 mm³) y un control con el cono invertido invierte la silueta medida, confirmando que la dirección del cono coincide entre 2D y 3D. Retroceder un bloque devuelve el perfil del bloque 3, volver a avanzar restaura el volumen exacto y el reinicio vuelve al cilindro inicial, sin errores de consola.

El fixture `fixtures/lathe/taper-turning.nc` tiene 8 bloques y es el cuarto ejemplo guiado. Para admitirlo, `expectedSpans` acepta tramos cilíndricos (`radiusMm`) o cónicos (`rStartMm`/`rEndMm`), y la comprobación verifica ambos extremos radiales. La prueba nativa compara los tres ejemplos cilíndricos contra el perfil v1 y el cónico contra `profile_at_v2`, sin duplicar el intérprete en TypeScript. Los arcos G18 requieren fijar antes la semántica I/K/R y verificarla contra el dialecto elegido.

