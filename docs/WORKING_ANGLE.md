# Aviso de ángulo de trabajo (`TOOL_WORKING_ANGLE`)

Aviso educativo del núcleo Rust (`crates/cnc-core/src/working_angle.rs`). Señala los avances en los que el inserto tendría que cortar con el flanco trasero, como el cono que achicaba el diámetro hacia el plato y el arco que redondeaba hacia el plato de la revisión de taller (ver GUIDED_EXERCISES.md). Es un **aviso**, no un error: el programa sigue siendo ejecutable y la trayectoria no cambia. Tampoco es una comprobación de colisiones y no certifica que un programa sea seguro en una máquina real.

## Convención

- Plano Z/R de la vista 2D: Z hacia la derecha, radio hacia arriba. Las direcciones se miden en grados desde +Z en sentido antihorario: 180° es avanzar hacia el plato (−Z) y 270° es entrar en forma radial (−X).
- Cada herramienta tiene uno o más vértices de inserto `(a, b)`: desde la punta, el filo secundario sale a `a` grados y el filo principal a `b` grados. El inserto ocupa esa cuña.
- Si la dirección de avance cae **estrictamente** dentro de `(a + 180°, b + 180°)`, la cuña no entra en ninguno de los dos lados de la superficie que va generando la punta: el flanco trasero cortaría material ya terminado y el cuerpo de la herramienta rozaría la pieza.
- Un avance justo sobre el borde (holgura cero, por ejemplo cilindrar en −Z puro con el inserto de refrentado) se acepta. La tolerancia de 1e−6° es numérica, no una holgura física.
- El sector opuesto `(a, b)` apunta hacia el lado del porta, lejos de una pieza exterior. Se considera retirada y no se revisa.

## Envolventes nominales

Ángulos nominales y didácticos, elegidos para que el catálogo se comporte como herramientas exteriores a derechas típicas. **No son datos de fabricante.** κr se mide desde la dirección principal de avance del porta.

| Herramienta | Supuesto | Vértices `(a, b)` | Avances que avisan | Qué se admite |
| --- | --- | --- | --- | --- |
| `generic-od` (T0) | Punta ideal | — | ninguno | todo (sin restricciones de desahogo, como dice el catálogo) |
| `roughing-od` (T0101) | κr 95° hacia −Z, rómbico 80° | (5°, 85°) | 185°–265°: bajar el diámetro hacia el plato más de 5° y menos de 85° | cilindrar, crecer hacia el plato, entrada radial o casi radial, conos de hasta 5° que bajan hacia el plato |
| `finishing-od` (T0202) | κr 93° hacia −Z, rómbico 55° | (32°, 87°) | 212°–267°: bajar hacia el plato entre 32° y 87° | perfiles con rebajes suaves (hasta 32°), entrada radial |
| `facing-od` (T0404) | κr 90° respecto del avance radial, 80° | (0°, 80°) | 180°–260°: bajar hacia el plato entre 0° y 80° | refrentar hacia X0 y entradas casi radiales; cilindrar en −Z puro queda en el borde (se acepta) |
| `grooving-od` (T0303) | Cuchilla con frente en Z y 3° de desahogo lateral por lado | (0°, 87°) y (93°, 180°) | 180°–267° y 273°–360° | entrada y salida radial ±3° y desplazamientos axiales puros |
| `boring-id` (T0505) | Punta interior ideal | — | ninguno | todo |

Con estos valores, el cono anterior (Ø40 en Z0 → Ø20 en Z−60, 9,5° bajo −Z) avisa con T0101 (admite 5°), pero no con T0202: un inserto de 55° con κr 93° tiene 32° de desahogo y puede seguir esa pendiente. El arco anterior (`G03 X20 Z−10 I−10 K0` con T0202) avisa porque su tangente baja hasta casi 90° hacia el plato. Con la herramienta neutra T0, que es la del setup por defecto, ninguno de los dos avisa.

## Qué se revisa

- Solo avances G01/G02/G03, incluidos los tramos de avance que generan G71/G70. Los rápidos G00 no se revisan (RAPID_IN_STOCK ya cubre su contacto con material en el perfil).
- La trayectoria programada, antes de correctores y de la compensación de radio de punta.
- La herramienta activa de cada movimiento (T del programa o la del setup).
- Contacto con material, aproximado: el avance tiene que atravesar el **tocho inicial abierto** (r < R, −L < Z < 0). Un avance en el aire fuera del tocho no avisa. El modelo no sigue el material ya removido: un avance en el aire dentro de una zona ya desbastada puede avisar igual.
- En los arcos, la tangente varía en forma lineal con el barrido; se calcula analíticamente qué tramo del arco cae en el sector prohibido y se muestrean 32 puntos de ese tramo contra el tocho.
- Un aviso por bloque, con la ubicación del bloque (línea y columnas), como los demás diagnósticos. El editor lo muestra en ámbar en «Avisos del programa».

## Limitaciones

- No es una comprobación de colisiones del porta, las mordazas, la contrapunta ni el mandril. No se modela la geometría real del mango ni del inserto.
- El ancho real de la cuchilla de ranurar no se modela: el motor sigue cortando con una punta ideal.
- El agujero de un tubo no se descuenta del tocho para este aviso; solo afecta a herramientas exteriores dentro del agujero, un caso que ya no tiene sentido físico.
- La herramienta interior y la neutra no tienen envolvente.
- Cambiar los ángulos nominales cambia qué programas avisan. Están en una tabla (`TOOL_ENVELOPES`) que replica los ids del catálogo TS (`src/lib/lathe/tools.ts`).

## Pruebas

- `crates/cnc-core/tests/working_angle.rs`: el cono y el arco anteriores (tomados de la versión 9e299b3) avisan en el bloque correcto (línea 4 y línea 5) en v1 y v2; todas las prácticas de los catálogos (`exercises`, `cycle-exercises`, `annular-*`, `diagnostic-*`) quedan sin aviso con su setup; todos los `.nc` de `fixtures/lathe/` quedan sin aviso con el setup por defecto y con T0101 como setup, salvo `first-program.nc`: su `U-4 W-10` es un chaflán que baja hacia el plato y, con un inserto real de 80°, avisa (con T0 no). También hay casos por clase de dirección y una prueba de que el aviso no cambia la trayectoria ni la ejecutabilidad.
- Pruebas unitarias del módulo: sectores derivados de los vértices, bordes exactos aceptados y contacto segmento–tocho.
- `tests/wasm.test.ts`: el aviso cruza la frontera WASM en `compile` y `compile_v2`, el resultado sigue siendo ejecutable y las prácticas actuales no traen diagnósticos.
