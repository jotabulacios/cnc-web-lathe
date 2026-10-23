# Herramientas dimensionales — plan del incremento

La corrección reemplaza la pirámide/caja de tamaño fijo por conjuntos educativos propios definidos en milímetros. No se usan dimensiones de fabricantes ni se afirma conformidad con una norma. El motor conserva su punta ideal y las operaciones actuales; dimensiones visuales no habilitan compensaciones, ranurado por ancho ni colisiones.

## Modelo y responsabilidades

- Referencia común local: Z axial, R radial, Y tangencial; origen en la esquina ideal programada, sin radio de nariz. La escena Three mapea Z→x, R→y, tangencial→z; SVG proyecta Z→x, R→−y.
- Componentes prismáticos (polígono longitudinal + espesor tangencial) y barras cilíndricas axiales. Un catálogo dimensional puro define inserto, porta/cuchilla y barra de mandrinado; 2D y 3D consumen esos mismos componentes.
- Medidas elegidas como diseño educativo, con procedencia explícita. Los ángulos se derivan del polígono del inserto; ancho de ranurado es visual, no ancho de remoción.
- Se conserva identidad T0…T5, dialecto, guardado y estado Rust. Los componentes visuales se reconstruyen al cambiar tipo y liberan recursos al sustituirse/desmontarse.
- La vista longitudinal usa la misma escala mm del stock; el catálogo encuadra iconos por separado. El encuadre debe incluir el cuerpo, no solo la punta. Three aplica la misma normalización de stock a todas las dimensiones.

## Orden y verificación

1. Modelo puro, proyección y límites, con pruebas de ángulos/dimensiones, referencia y diferencias de tipos.
2. Sustituir las formas SVG y las mallas Three; verificar escala entre setups, cambio T, retroceso y liberación.
3. Presentar origen de dimensiones y distinguir modelo visual de punta de corte. Mantener advertencia de alcance educativo sin aparentar datos de fabricante.
4. Build y checks; WASM como regresión sin modificar Rust; E2E raíz/subruta y QA visual de exterior, ranurado y mandrinado. Registrar cada cierre en WORK_LOG.md.

Después de esta base, los correctores necesitan un diseño separado de coordenadas/orígenes y referencia de punta. No se incorporan desplazamientos CNC ficticios en el renderer.
