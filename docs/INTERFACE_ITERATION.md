# Iteración de interfaz — 2026-10-20

Nota histórica: el incremento siguiente ya agregó remoción exterior idealizada. Ver [modelo de perfil](STOCK_PROFILE_MODEL.md); las limitaciones de stock sin remoción que siguen describen esta iteración anterior.

El usuario autorizó continuar con la propuesta visual e indicó que se podían usar varios agentes. Se repartieron tres tareas: vista longitudinal del torno, explicaciones educativas de bloques y revisión de interfaz/accesibilidad. El agente principal integró sus resultados, configuración editable y estilos, y verificó la aplicación en el navegador.

## Resultado

- Vista longitudinal 2D con plato esquemático, pieza completa, cara Z0, eje central y punta ideal de herramienta. Se conserva escala física uniforme: la geometría usa radio y las etiquetas X muestran diámetro.
- Trayectorias G00 discontinuas y G01 continuas, diferenciando previsto/completado y sin unir segmentos separados. Se pueden ocultar sin alterar el resultado CNC.
- Editor a la derecha y franja de posiciones/ejecución debajo en escritorio. En pantallas angostas: vista, controles, explicación y editor. No hay controles ficticios de reproducción continua, 3D o CAM.
- Diámetro/longitud del material y posición inicial X Ø/Z editables. Medidas positivas para material, X no negativo y valores finitos dentro de ±1e9 mm. Se aceptan decimales con punto o coma en el formulario; la sintaxis de G-code no cambia.
- Cambiar fuente o setup invalida resultados y cursor. Si un campo queda inválido, la vista conserva la última configuración válida y se bloquea interpretar, con error junto al campo.
- Explicación del bloque completado derivada de snapshots Rust: X diámetro, movimiento radial, Z, avance y husillo. No vuelve a interpretar el texto fuente.
- Atajo Ctrl/Meta+Enter para interpretar. Paso/anterior/reset mantienen el estado de Rust como única referencia CNC.
- Resaltado del editor corregido: el tokenizer vuelve a entregar claves de color consistentes con el renderer. Seguimiento automático de la línea completada sin mover el foco ni la selección.
- Panel de editor acotado: la columna de números no hace crecer toda la página al abrir archivos largos.

La pieza dibujada es el material inicial: no se calcula ni se muestra un perfil removido. El plato y la herramienta son esquemáticos, sin evaluación de contacto o colisiones. Three.js continúa diferido hasta definir y probar el modelo de perfil 2D.

## Estructura reutilizable

| Archivo | Responsabilidad |
|---|---|
| src/components/LatheLab.tsx | Composición, formulario y acciones de UI |
| src/components/LatheViewport.tsx | Dibujo SVG del estado y segmentos recibidos |
| src/lib/lathe/viewport.ts | Encuadre completo, grilla y transformación física |
| src/lib/lathe/explain.ts | Texto educativo a partir de snapshots |
| src/lib/lathe/setup.ts | Validación del borrador y conversión X Ø → radio |
| src/components/GCodeEditor.tsx | Editor adaptado, resaltado y scroll sincronizado |

No se cambiaron las reglas del intérprete ni la frontera WASM en esta iteración.

## Verificación realizada

- TypeScript y ESLint: correctos.
- 18 pruebas TypeScript: seis existentes de reproducción/contrato y doce nuevas de setup, explicación y geometría del viewport.
- Tres pruebas del WASM real: correctas, incluyendo equivalencia con fixture nativa y rechazo de peticiones/códigos no soportados.
- Next build/export con chequeo real de tipos: correcto.
- Navegador: ejemplo hasta M30, coordenadas y explicaciones, stock Ø80×150 con posición inicial X Ø90, invalidación tras editar setup, rechazo de diámetro cero y reset que restaura X Ø90.
- Navegador: G02 no soportado da diagnóstico visible y deshabilita el paso.
- Navegador: programa de 42 bloques; al completar la línea 33 el textarea mantiene altura de 218 px, scrollTop=503 y la línea está visible.
- Responsive mediante iframe con viewport real: 390/768/1024 px, ancho del documento 375/753/1009 px respectivamente (scrollbar vertical incluida), sin overflow horizontal. Inspección visual adicional de escritorio a 1265 px.

Las comprobaciones de navegador son pruebas manuales asistidas, no una suite E2E persistente. Firefox/WebKit, carga WASM fallida y todos los recorridos por teclado siguen pendientes de automatizar. Los tests Rust del incremento anterior siguen siendo la base semántica; no se repitieron porque no se modificó Rust.

## Próximo incremento

Definir el modelo de contacto/remoción y perfil exterior idealizado con fixtures analíticas, antes de dibujar pieza mecanizada o superficie 3D. Mantener este renderer como consumidor de geometría, sin introducir semántica CNC en componentes React.
