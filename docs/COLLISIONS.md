# Colisiones educativas del porta, el inserto y las mordazas

Avisos del núcleo Rust (`crates/cnc-core/src/collisions.rs`). Motivo: en una práctica real, el porta de la herramienta golpeó la pieza aunque la trayectoria de la punta era correcta. Estos avisos revisan, bloque por bloque, si la silueta de la herramienta o las mordazas del plato chocan con la pieza.

Son **avisos** (`warning`): el programa sigue siendo ejecutable y la trayectoria no cambia. Usan geometría nominal y didáctica, en 2D, con muestreo. **No garantizan que un programa sea seguro en una máquina real** y no sustituyen la verificación en máquina.

## Códigos

| Código | Cuándo | Mensaje |
| --- | --- | --- |
| `TOOL_HOLDER_COLLISION` | El mango, la abrazadera o la parte trasera del inserto tocan el material que queda en ese momento. En un rápido, cualquier parte de la herramienta. | Nombra las partes («el mango y el inserto»), el punto más profundo en Z/X (X en diámetro), cuánto entra, dónde estaba la punta y una sugerencia. |
| `JAW_COLLISION` | Cualquier parte dibujada de la herramienta (con T0, la punta) entra en la zona de las mordazas. | Nombra las partes, el punto más adentro, la zona nominal de las mordazas y una sugerencia. |
| `COLLISION_CHECK_LIMIT` | Se agotó el presupuesto de cálculo. | Indica desde qué bloque no se revisó. No se queda en silencio. |

- Un aviso de cada código por bloque como máximo, con la ubicación del bloque (línea y columnas), como el resto de los diagnósticos. El editor los muestra en «Avisos del programa».
- El diagnóstico trae además un punto opcional `point` (Z y radio físico). La vista 2D lo marca con un círculo rojo cuando el bloque ya se ejecutó.
- Solo se avisa el movimiento en el que la herramienta **entra** en contacto. Si un movimiento empieza ya en colisión (por ejemplo, la retirada después del choque), no repite el aviso: la causa está en el bloque anterior.

## Modelo

Plano Z/R de la vista 2D: Z hacia la derecha, radio físico hacia arriba. Z0 en la cara y la pieza hacia Z negativo, como en el resto del laboratorio.

### Herramienta

Rust es la fuente de verdad de los diagnósticos. Las siluetas están portadas a Rust (`tool_silhouettes`) desde `TOOL_ASSEMBLIES` (`src/lib/lathe/toolAssemblies.ts`). Una prueba (`tests/wasm.test.ts`) compara punto por punto las siluetas de Rust, que se exportan por WASM (`collision_model`), con las que dibujan las vistas. Si alguien cambia una sin la otra, la prueba falla.

Se eligió portar las siluetas en lugar de mandarlas desde TS en cada petición. Así el contrato de compilación no cambia y el diagnóstico no depende de lo que mande la interfaz. La contra es que hay dos copias de las mismas medidas, sostenidas por esa prueba.

Cada herramienta tiene tres regiones, relativas a la punta:

- **Zona de corte**: la parte del inserto que lleva los filos. En los avances puede tocar material.
- **Regiones revisadas**: mango, abrazadera y parte trasera del inserto. No pueden tocar material en ningún movimiento.
- En un **rápido** también se revisa la zona de corte. Que la punta entre en material ya lo informa `RAPID_IN_STOCK`: allí el modelo exterior se congela y este control se detiene, así que no hay aviso duplicado.

| Herramienta | Silueta nominal (mm, desde la punta) | Zona de corte | Revisado en avances |
| --- | --- | --- | --- |
| `generic-od` (T0) | Se dibuja con mango y rombo de 6 mm, 80° | — | nada: punta ideal sin restricciones, igual que en el aviso de ángulo de trabajo. Para las mordazas se revisa solo la punta. |
| `roughing-od` (T0101) | Mango 12 mm de ancho visible (Z 2…14), desde R+5 hasta R+65; rombo de lado 8 mm, 80° | triángulo punta–extremos de los dos filos | mango y triángulo trasero del rombo (la esquina opuesta a la punta) |
| `finishing-od` (T0202) | Mango igual, hasta R+60; rombo de lado 6 mm, 55° | ídem | ídem |
| `grooving-od` (T0303) | Cuchilla Z 0…3, R 6…51; abrazadera Z −3,5…6,5, R 32…65; inserto 3 × 12 mm | inserto completo (3 × 12) | cuchilla por encima del inserto (R 12…51) y abrazadera |
| `facing-od` (T0404) | Porta axial hasta Z+65, R 3…15; triángulo de 80° con filos de 10 mm | triángulo completo (los dos filos salen de la punta) | porta |
| `boring-id` (T0505) | Barra Ø8 a R−6, cabezal y rombo de 55° | — | no se revisa (ver limitaciones) |

Las designaciones ISO del editor de herramientas solo cambian lo que se dibuja. El control usa siempre las siluetas educativas de esta tabla. Es una decisión consciente: la geometría ISO nunca llega al motor.

### Material que queda

Para cada movimiento se usa el material **que queda en ese momento**, no el tocho inicial. El recorrido reproduce exactamente el modelo exterior de `profile_at_v2`: comparte con él la función `step_motion`. Además, dentro de un movimiento que corta se descuenta lo que la punta ya barrió hasta cada muestra:

- Cilindrado, cono o arco hacia Z negativo: el perfil antes del movimiento, recortado por el tramo de trayectoria ya recorrido (con un arco parcial, si es un arco).
- Refrentado hasta X0: se elimina lo que está delante de la punta, desde su radio hacia arriba.
- Si una muestra parcial no se puede representar, esa muestra se omite.

Los movimientos se toman tal como los consume la reconstrucción del perfil, es decir, después de los correctores y del camino de contacto de la nariz. Así el aviso coincide con el material que muestra la vista. Con radio de punta, la silueta se apoya sobre el camino de contacto. El error es de ρ·√2 como máximo (por ejemplo, 0,6 mm con ρ = 0,4).

El control del porta se detiene, sin aviso propio, en el primer bloque en el que el perfil exterior se congela (rápido en material, corte no admitido, límite del modelo, etc.). El perfil ya informa ese bloque con su propio diagnóstico.

### Mordazas

Nuevo campo opcional del setup, `jaws`, que se guarda con el proyecto:

```json
"jaws": { "gripLengthMm": 15, "jawHeightMm": 12 }
```

- **Zona de mordazas**: Z < −largo + `gripLengthMm` y radio < Ø/2 + `jawHeightMm`. Incluye el tramo de pieza tomado por las mordazas, al que la herramienta no puede llegar, y la cara del plato hasta la altura de las mordazas.
- **Valores por defecto** cuando falta el campo (setups, prácticas y proyectos anteriores): toma de 15 mm, o la mitad del largo si la pieza mide menos de 30 mm, y 12 mm de altura sobre el diámetro inicial. Son valores didácticos para un plato universal chico, no datos de un fabricante.
- **Validación**: toma de 0 mm o más y menor que el largo de la pieza; altura mayor que cero. Toma 0 deja solo la cara del plato. Un valor inválido es un error de setup (`INVALID_REQUEST`), igual que el resto del setup.
- **Interfaz**: la pestaña Pieza suma «Largo tomado por las mordazas» y «Altura de las mordazas sobre la pieza». Si no se tocan, el setup no incluye `jaws` y se usan los valores por defecto. La vista 2D dibuja las mordazas sobre el tramo tomado. La 3D dibuja tres bloques a 120° que entran un poco en el plato.
- Las mordazas son solo un obstáculo: no cambian el material ni el perfil.

### Muestreo y precisión

- La punta se muestrea cada **0,25 mm** de recorrido (`COLLISION_STEP_MM`). En movimientos de más de 1000 mm el paso es largo/4000.
- En cada muestra el contacto entre polígono y perfil es **exacto**. Los dos bordes son lineales por tramos, así que la penetración máxima `perfil(z) − borde inferior del polígono(z)` en cada intervalo está en sus extremos. Se evalúan los vértices del polígono y los quiebres del perfil, desplazados ±0,05 mm hacia adentro. En las mordazas se evalúan los vértices y el cruce de cada arista con la diagonal del cuadrante.
- **Tolerancia** de 0,05 mm (`COLLISION_TOLERANCE_MM`). Un contacto apoyado en una cara o en un escalón no cuenta, y una penetración menor tampoco. Es una holgura numérica y didáctica, no una holgura física.
- **Error de muestreo**: un contacto que empieza y termina entre dos muestras pasa inadvertido solo si es más chico que medio paso (≈ 0,13 mm con 0,25 mm).
- La profundidad informada es vertical (radial).
- **Presupuesto**: 40 millones de unidades de trabajo (muestras × tramos o vértices). En WASM equivale a unos 0,3–0,4 s. Un programa de prueba de 2400 bloques con pasadas de 300 mm lo alcanza y recibe `COLLISION_CHECK_LIMIT`. Un perfil de 1800 bloques con T0101 compila en unos 140 ms (12 ms con T0, que no recorre el perfil).

## Relación con `TOOL_WORKING_ANGLE`

El aviso de ángulo de trabajo se mantiene. Desde este cambio, el contacto con material se decide con el **material que queda** cuando el modelo exterior llega a ese movimiento. Un avance en el aire sobre una zona ya desbastada deja de avisar. Si el modelo no llega (programa con T5, perfil congelado, avance hacia +Z), se vuelve al criterio anterior del tocho inicial. En los arcos que sí cortan, el tramo prohibido se sigue muestreando contra el tocho inicial. Ver WORKING_ANGLE.md.

Los dos avisos son complementarios. El ángulo de trabajo mira la dirección de avance frente a las aristas nominales del inserto. La colisión mira la silueta dibujada frente al material. Por eso los ángulos no coinciden del todo: la envolvente de T0101 admite 5° y el filo secundario dibujado está a 10°.

## Programas anteriores (versión 9e299b3, con sus setups)

| Programa | Setup de entonces | Resultado |
| --- | --- | --- |
| Arco hacia el plato (`G03 X20 Z−10 I−10 K0`, llama a T0202) | T0, Ø50 × 100 | **`TOOL_HOLDER_COLLISION` en la línea 5**: el mango y el inserto tocan el redondeo (≈ 5 mm), con la punta en Z−10 X20. Sigue también `TOOL_WORKING_ANGLE` en la misma línea. La retirada (línea 6) empieza dentro y no repite el aviso. |
| Cono que achica hacia el plato (`G01 X20 Z−60`) | T0, Ø50 × 100 | Sin colisión: T0 es ideal. Con T0101 tampoco hay colisión (solo `TOOL_WORKING_ANGLE`). Con T0202, nada. |

Todas las prácticas actuales (`exercises`, `cycle-exercises`, `annular-*`, `diagnostic-*`) y todos los `.nc` de `fixtures/lathe/` con el setup por defecto quedan sin avisos de colisión. Con T0101 como setup, solo `first-program.nc` avisa: su chaflán `U−4 W−10` baja 11,3°, más que el filo secundario dibujado (10°), y toca la parte trasera del inserto en la línea 6, el mismo bloque del aviso de ángulo de trabajo.

## Limitaciones

- No es un control 3D: solo se compara la silueta en el plano Z/R. No se considera el ancho tangencial, la altura de centro ni la orientación real del porta.
- Geometría nominal y educativa: siluetas, zonas de corte y mordazas no son datos de un fabricante. Tampoco se usan las designaciones ISO elegidas.
- No hay contrapunta, luneta, torreta, otras herramientas montadas ni el cuerpo del plato más allá de la altura de las mordazas.
- La profundidad de pasada mayor que el largo del filo no se avisa: el modelo de material supone que la punta remueve todo lo que queda sobre su trayectoria.
- T0 (neutra) no tiene control de porta. T5 (mandrinado) no se revisa: la barra trabaja dentro del agujero y ese modelo (anular) necesita el diámetro interior, que el compilador no recibe. En un tubo con herramientas exteriores se usa el contorno exterior hasta el primer bloque que el modelo sólido no puede seguir (por ejemplo, el refrentado tubular).
- El muestreo puede perder contactos más chicos que medio paso. La tolerancia ignora contactos menores a 0,05 mm.
- Nunca certifica un programa ni reemplaza la prueba en vacío, la verificación de la puesta y el criterio del docente o del operador.

## Pruebas

- `crates/cnc-core/tests/collisions.rs` (11 pruebas): el arco anterior avisa en la línea 5 (v1 y v2); el cono anterior no colisiona con su setup ni con T0101/T0202; una entrada casi radial junto a un collar choca con el mango sin aviso de ángulo de trabajo; un rápido que arrastra la abrazadera de la cuchilla de ranurar por la pieza es colisión y no `RAPID_IN_STOCK`; un cilindrado y un rápido hacia las mordazas avisan una vez, también con la punta de T0. También se prueban mordazas configurables y compatibles hacia atrás (serde, validación, toma 0), todas las prácticas y fixtures limpios, que los avisos no cambian la trayectoria, que el ángulo de trabajo usa el material que queda y el orden y la forma del modelo exportado.
- Pruebas unitarias en `collisions.rs`: construcción del rombo, contacto apoyado frente a penetración, escalón dentro de un polígono, profundidad en el cuadrante de mordazas y formato de números.
- `tests/wasm.test.ts`: las siluetas de Rust coinciden con `TOOL_ASSEMBLIES`; valores por defecto iguales en Rust y TS; el aviso cruza la frontera con `point`; las mordazas del setup se respetan y un campo desconocido se rechaza.
- `tests/setup.test.ts` y `tests/project.test.ts`: campos de mordazas (sin tocar no hay `jaws`, ida y vuelta, errores por campo) y proyectos con o sin mordazas.
- `tests/e2e/collisions.spec.ts`: mordazas en 2D y 3D siguiendo los campos, aviso de mordazas en el bloque exacto con marcador rojo al ejecutarlo, y aviso del porta en el arco anterior.
