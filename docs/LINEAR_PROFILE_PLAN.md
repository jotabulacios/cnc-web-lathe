# Perfil exterior lineal por tramos: incremento de conos exteriores

Estado: implementado y verificado en raíz y subruta, con QA visual manual. Ver «Incremento cerrado» al final.

## Decisión y alcance

El perfil v1 representa solo radios constantes; aproximar conos con cientos de escalones mezclaría precisión geométrica con resolución visual. Se propone un perfil v2 con extremos `zStartMm`, `zEndMm`, `rStartMm`, `rEndMm` y radio interpolado linealmente. El intérprete `compile` y la convención X en diámetro no cambian. La geometría consume radios físicos ya interpretados.

Se conserva el export `stock_profile` y su contrato v1 para no cambiar el significado de respuestas existentes. La integración agrega el export explícito `stock_profile_v2` y un adaptador validado; la UI se migró en un solo incremento verificado. Los conos se activaron en la interfaz solo cuando el kernel, la reconstrucción y la malla 3D estuvieron probados.

## Etapas

1. Kernel Rust puro, independiente del controlador y del navegador: validar perfiles lineales, obtener envolvente inferior de un perfil y un segmento recortado a su intervalo Z, detectar penetración estricta de un movimiento y conservar geometría ante límites. Pruebas analíticas antes de la integración. Etapa completada.
2. Reconstrucción por prefijos v2 con las reglas de husillo, diagnóstico y transacción por bloque de v1. Solo G01 hacia Z negativo; radial y avance inverso siguen explícitamente limitados. Todos los fixtures v1 se mantienen como regresión. Etapa completada.
3. WASM aditivo y schema TS v2; SVG de segmentos lineales, frustos de revolución con normales inclinadas, hombros, tapas y ápices sin triángulos degenerados. El renderer no calcula remoción. Validar volúmenes analíticos y geometría float32 antes de activar. Etapa completada.
4. Pruebas de paso/anterior/reset, perfil parcial, descarga fallida y ausencia de WebGL en raíz y subruta: completadas. El ejemplo cónico pasó a ser el cuarto ejemplo guiado («Cono exterior»), con `expectedSpans` que admiten radios inicial/final. Etapa completada.


## Reglas geométricas

Un perfil cubre un intervalo contiguo y ordenado; permite saltos de radio en un hombro. Radios finitos, no negativos, coordenadas acotadas a 1e9 mm. Un corte ideal deja `min(rActual(z), rHerramienta(z))` en el solapamiento; fuera conserva el perfil. La diferencia de rectas tiene como máximo un cruce dentro de cada tramo. Recortar e intersectar exactamente en f64 evita discretización dependiente de la cámara.

El contacto no equivale a penetración. En una frontera interior se considera el menor radio vecino, como en v1, permitiendo retirada sobre hombros. Las caras exteriores no tienen interior material. En intervalos abiertos basta evaluar la diferencia lineal en sus extremos: existe penetración si su mínimo es estrictamente negativo. Un ápice de radio cero es válido geométricamente aunque requiere proyección 3D específica.

No fusionar segmentos con una tolerancia que pueda borrar detalles o inventar remoción. El kernel inicial conserva particiones, salvo copias exactas sin corte. Limitar spans a4096 y operaciones a2M; el llamador recibe error y conserva el perfil previo cuando se agota el presupuesto. Una intersección que no se puede representar estrictamente dentro del intervalo debe devolver error numérico explícito, no un perfil interpolado arbitrariamente.

## Pruebas necesarias

Cilindro sin corte, cono analítico, entrada/salida fuera de stock, intersección con perfil existente, cruces en ambos sentidos, extremos/contacto tangente, hombros y caras, ápice/radio cero, determinismo y conservación del input, errores de orden/contigüidad/NaN/rango, límites transaccionales, coordenadas de magnitudes diferentes. La comparación de resultados analíticos usa tolerancia explícita en pruebas; no se aplica epsilon de remoción dentro del algoritmo.

## Primer incremento verificado

Kernel nativo `linear_profile.rs`, sin cambio de WASM ni UI. 12 pruebas nuevas y 37 pruebas Rust totales correctas; clippy sin warnings. Incluye una grilla determinista de64 combinaciones comparadas contra mínimos analíticos, rollback por límites, cono/cilindro, cono/cono, puntas cero, contactos y cruces no representables.

La revisión independiente encontró un falso positivo de penetración de3.55e-15 mm al reparametrizar una recta recortada. Se agregó regresión y `AmbiguousComparison`: una diferencia no nula de hasta32·epsilon·max(radios, MIN_POSITIVE) devuelve error explícito, nunca permiso de corte ni declaración de aire. La igualdad almacenada sigue siendo contacto. Este guard relativo de redondeo es una política práctica conservadora para el simulador educativo, no aritmética de intervalos certificada. La comparación con ambigüedad se aplica también al lower envelope. El input sigue intacto ante errores. El perfil v1 conserva sus reglas anteriores y sus pruebas de cortes subnanométricos.

## Integración en curso

Reconstrucción v2 por prefijos y export WASM aditivo implementados: 46 pruebas Rust totales y10 sobre WASM real, sin fallos. Se conserva la solicitud estricta de profile y el compilador v1. Los errores ambiguos/intersecciones no representables tienen códigos visibles distintos; rollback por bloque y presupuesto se prueban también en la reconstrucción. La posición inicial dentro del cilindro conserva la comparación estricta v1 y su diagnóstico INITIAL_TOOL_IN_STOCK.

Schema y adaptador v2 validan cursores, contigüidad, límites y dimensiones de stock. SVG usa extremos radiales. Three usa frustos con normales inclinadas y abanicos de ápice; valida áreas de caras en posiciones Float32 y rechaza pendientes colapsadas por precisión. Proyecciones y checks TS:67 pruebas correctas. UI migrada, build raíz y36E2E Chromium correctos. Pendientes subruta y QA visual/publicación3100: ver HANDOFF.md.

El subagente taper_design revisó diseño, reprodujo el caso numérico y revisó reconstrucción/WASM sin encontrar otro fallo concreto. El subagente taper_mesh implementó helper puro+6 pruebas en archivos independientes. El padre revisó y conectó sus resultados; no se delegaron cambios del intérprete ni publicación. Evidencia profile-v2-*.log y linear-kernel-*.log.

## Incremento cerrado

La verificación pendiente del plan quedó completa, sin reimplementar nada:

- Subruta `/cnc-edu/`: `NEXT_PUBLIC_BASE_PATH=/cnc-edu pnpm build:web` y `pnpm test:e2e` con el mismo prefijo, 36 casos correctos (18,3 s). Log `evidence/profile-v2-ui-e2e-subpath.log`.
- Export raíz restaurado con `pnpm build:web` sin prefijo y otros 36 casos correctos (18,0 s). Log `evidence/profile-v2-ui-e2e-root.log`.
- QA visual manual del cono sobre el export raíz, en una pestaña nueva para no pisar programas editados por el usuario. Se cargó `fixtures/lathe/taper-turning.nc` por la ruta real de apertura de archivos con el setup por defecto Ø50 × 100 mm; se interpretó y se avanzaron 4 bloques. La tabla da Ø50 entre −100/−60 y Ø20 → Ø40 entre −60/0; la malla 3D da 39000π mm³; retroceder, volver a avanzar y reiniciar se comportaron como espera. Sin errores de consola.
- La dirección del cono se comprobó con un control: el volumen de un tronco de cono es simétrico al invertirlo, así que se midió la silueta renderizada del canvas y se comparó con un programa de cono invertido. La medida se invierte, de modo que la comprobación distingue la dirección y coincide con el perfil 2D.
- Documentación actualizada: README, STOCK_PROFILE_MODEL, REVOLUTION_3D, IMPLEMENTATION_STATUS, CONTINUIDAD y este plan.

Queda pendiente solo publicar el snapshot raíz en 3100 y renovar los ZIP de entrega. La mejora siguiente acordada es llevar el fixture cónico al catálogo guiado, lo que requiere evolucionar `expectedSpans` y su prueba nativa para radios inicial/final, sin duplicar el intérprete en TypeScript. Los arcos G18 siguen sin empezar: hay que elegir y verificar primero la semántica I/K/R.

