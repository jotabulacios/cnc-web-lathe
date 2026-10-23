# Hoja de cotas — 22/10/2026

La hoja de cotas es un dibujo técnico de la pieza obtenida, con sus medidas. Sirve para que el estudiante compare su resultado con el plano pedido. Se abre con el botón «Hoja de cotas» de la pestaña Pieza. Cuando una práctica guiada terminó, también se abre con «Ver hoja de cotas · pedido vs. obtenido» en Prácticas. Es solo presentación: no toca Rust, WASM, contratos ni proyectos.

**Es un dibujo educativo, no un plano de fabricación.** Lo dice el rótulo de la hoja. Las medidas salen del perfil ideal del modelo de corte, sin validación para una máquina real.

## Qué perfil muestra

La hoja sigue al cursor, igual que la vista 2D:

- **Al final del programa** (cursor en el último bloque y perfil completo): «Final — bloque N/N».
- **En cualquier otro momento:** «Parcial — bloque n/N», con una insignia ámbar. Esto incluye un perfil congelado por un aviso: n es el último bloque que admitió el modelo.

Se eligió seguir al cursor porque permite ver cómo cambian las cotas en cada pasada. La comparación con la práctica aparece solo al final.

## Módulo puro `src/lib/lathe/dimensionSheet.ts`

`buildDimensionSheet(profile)` recibe el perfil del laboratorio (v2 sólido o v3 tubular) y devuelve rasgos, cotas y notas en mm físicos. Si no queda material devuelve `null`. No interpreta G-code ni remueve material.

1. **Tramos sin material:** radio 0 en sólidos, o interior igual a exterior en tubos. Separan tramos de material independientes. La cara frontal real es el extremo frontal del material: después de un refrentado de 1 mm queda en Z−1, y se agrega la nota «Cara frontal en Z−1».
2. **Astillas numéricas:** un tramo de menos de 0,01 mm de largo se absorbe en el tramo vecino, prolongando la recta de ese vecino. La cota se corre menos de 0,01 mm.
3. **Tramos colineales:** se unen si todos los vértices originales quedan a ≤ 0,005 mm de la recta unida. Eso equivale a medio escalón de 0,01 mm en diámetro. Así, el cono de la práctica, que el motor entrega en tres trozos con ruido de punto flotante (17,799999…), queda como un solo cono. Dos cilindros con menos de 0,01 mm de diferencia en diámetro también se unen.
4. **Clasificación:**
   - **Cilindro:** diferencia de radio ≤ 0,005 mm.
   - **Cono:** se informan el semiángulo α/2 y el ángulo incluido. Si α/2 ≤ 30° se agrega también la conicidad 1:x, con x = L/ΔØ.
   - **Chaflán:** cono a 45° ± 0,5° de hasta 3 mm de largo. Se rotula «Chaflán 1 × 45°» y no lleva diámetros propios.
   - **Arco o perfil curvo:** el motor aproxima los arcos con cuerdas de 0,01 mm de flecha. Una cadena es una serie contigua de al menos 3 cuerdas con estas condiciones: ninguna plana, cada una de ≤ 5 mm, largos parecidos (relación ≤ 3) y giro de ≤ 20° en cada vértice. Una cadena se acota como **arco** («R5 convexo» o «cóncavo») solo si cumple todo esto:
     - toda la cadena ajusta a un círculo, con cada vértice a ≤ 0,02 mm;
     - el giro va siempre en el mismo sentido;
     - cada cuerda abarca ≤ 30°;
     - el radio es menor que 10 m.

     Si no cumple, se rotula **«Perfil curvo»** con el Ø de cada extremo. Nunca se informan radios de ajustes parciales dentro de una cadena más larga. Por eso dos arcos tangentes de radios distintos, o una curva libre, quedan como «perfil curvo». Una ranura simétrica a 45° es un trapecio isósceles y sus vértices caen sobre un círculo. Aun así sigue siendo chaflán + cilindro + chaflán: el tramo plano corta la cadena y los segmentos son largos.

## Cotas

- **Longitudes:** cotas en paralelo (en línea de base) desde la **cara frontal**, que es la referencia de Z0 del programa y la cara que se mecaniza primero. Va una cota por cada cambio de rasgo, y la última es el largo total. Las exteriores van debajo de la pieza, con la más corta más cerca. Los escalones del agujero van arriba. Si un límite interior coincide con uno exterior no se repite.
- **Diámetros:** uno por cilindro. En conos y perfiles curvos, uno por extremo, salvo que ese extremo ya lo acote un cilindro contiguo del mismo Ø. En arcos y chaflanes no se acotan los extremos: alcanzan el radio o el chaflán y las longitudes.
- **Ubicación de los Ø exteriores:**
  - columnas a la derecha o a la izquierda de la pieza, con líneas auxiliares horizontales;
  - se usa un lado solo si las líneas auxiliares no cruzan material, es decir, si no hay radios mayores entre el rasgo y esa cara. Si los dos lados sirven, se elige el más cercano;
  - en cada lado, el diámetro menor queda más cerca de la pieza, así las auxiliares nunca cruzan otras líneas de cota;
  - si ningún lado sirve (por ejemplo, el fondo de una ranura), la cota va sobre el rasgo.
- **Ø interiores:** sobre el agujero.
- **Redondeo:** 0,01 mm, con coma decimal (`formatMm`, es-AR, sin «-0»).

## Dibujo (`src/components/DimensionSheet.tsx`)

- **Vista lateral con medio corte superior:** la mitad de arriba lleva rayado a 45°, igual que el plano 2D. La de abajo es vista exterior, con el agujero en líneas ocultas discontinuas.
- **Otros trazos:** eje en trazo y punto, y el material inicial como línea fantasma.
- **Rótulo:**
  - programa, estado (final o parcial) y material inicial;
  - herramientas que avanzaron hasta el cursor;
  - largo total y convenciones;
  - «Dibujo educativo — no es un plano de fabricación».
- **Tema claro imprimible:** colores y fuentes como atributos SVG, sin CSS externo, para que el archivo descargado se vea igual.
- **Escala:** igual en X y en Z, ajustada a 1100 unidades de ancho. Las notas (conos, chaflanes, radios, cara) van con línea de referencia a etiquetas escalonadas arriba de la pieza, sin superponerse.

## Pedido vs. obtenido

Aparece cuando la práctica guiada activa (no de diagnóstico) llegó a «completo» o «difiere», es decir, al final del recorrido y con el perfil de esa ejecución. El título es el veredicto de `assessExercise`: la tabla descompone la comprobación existente, no la reemplaza.

| Criterio de la práctica | Filas |
|---|---|
| `expectedProfile` (muestras) | Ø exterior en cada Z de referencia con su tolerancia, más el volumen restante. Son las mismas filas que usa `expectedProfileMatches`, a través de `sampledProfileChecks`. |
| `expectedAnnularProfile` | Ø exterior e interior en cada muestra, más el volumen recalculado. Son las mismas filas que usa `expectedAnnularProfileMatches`, a través de `annularReferenceChecks`. |
| `expectedSpans` (tramos) | Ø en el centro de cada cilindro y justo dentro de cada extremo de los conos. Un hombro es ambiguo. Son filas informativas: la confirmación sigue siendo `expectedSpansMatch`, tramo por tramo. |

Las tolerancias se muestran en diámetro (el doble de las de radio). Las muy chicas se muestran en notación exponencial, como en la tabla de referencias de Prácticas.

## Descarga

«Descargar SVG» sigue el mismo patrón que ProjectActions: Blob, URL de objeto y enlace temporal. Serializa el SVG visible con declaración XML y lo guarda como `hoja-de-cotas-<programa>.svg`.

## Pruebas

- `tests/dimensionSheet.test.ts`: formato; escalones cilíndricos y lados; cono partido con ruido; extremos de cono ya acotados; arco convexo y cóncavo a partir de cuerdas; curva libre y ranura que no es arco; astillas; cara refrentada; tubo; filas de comparación.
- `tests/e2e/dimension-sheet.spec.ts`:
  - **Cono:** Ø30, Ø46, Ø50, 40, 100, nota del cono, rótulo, 6 filas ✓ y descarga SVG.
  - **Parcial en el bloque 6:** Ø42 y 29, sin tabla.
  - **Dos escalones** desde Prácticas.
  - **R5 convexo.**
  - **Tubo:** Ø20 y Ø30 interiores, más la profundidad 40.
- Con `DIMENSION_SHEET_SCREENSHOTS=1` se guardan `test-results/dimension-sheet-{taper,two-steps,arc,tube}.png`.

## Límites

- No hay tolerancias ISO de fabricación, rugosidad ni acotado funcional. Solo se dibuja la geometría del modelo ideal.
- Arcos grandes, de radio mayor que unos 300 mm (cuerdas de más de 5 mm), quedan como una serie de conos. Dos arcos tangentes quedan como «perfil curvo».
- Con muchos rasgos, las filas de cotas crecen hacia abajo. No hay acotado en cadena alternativo ni elección manual de la referencia.
