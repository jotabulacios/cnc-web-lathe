# Pendiente: geometría dimensional de herramientas y portas

**Actualización:** base dimensional educativa implementada; ver [conjuntos y límites](TOOL_ASSEMBLIES.md). El hallazgo siguiente describe la versión anterior. Siguen pendientes datos de fabricante, radio de nariz, correctores y colisiones del cuerpo.

Registrado el 22/10/2026 tras revisión con el usuario. Se conserva la prioridad de ESTADO_DE_SITUACION_2026-10-22.md: consolidación MVP, refrentado tubular y después herramientas/correctores. El usuario pidió registrar este problema sin adelantarlo sobre esas tareas.

## Hallazgo comprobado

threeScene.ts construye un único inserto con ConeGeometry de cuatro lados (0.055 de radio y 0.1 de altura) y un porta BoxGeometry (0.045 × 0.2 × 0.045), en unidades de escena. Solo cambia el color según la herramienta. Esas medidas son ilustrativas, no provienen de planos ni catálogos y no están convertidas desde milímetros con la escala de la pieza. Por ello las proporciones respecto del stock varían con el setup.

El catálogo contiene etiquetas de ángulos y ancho de cuchilla que no gobiernan el modelo 3D ni la remoción. La geometría de mandrinado no representa una barra real. El cálculo sigue usando una punta ideal; no hay colisiones del cuerpo del porta ni compensación por sus dimensiones.

## Alcance futuro y aceptación

- Definir en milímetros conjuntos genéricos separados: desbaste, acabado, ranurado, refrentado y mandrinado, con orientación y punto de referencia explícitos.
- Identificar cada medida como diseño educativo o dato de una fuente verificable. No atribuir dimensiones ilustrativas a fabricantes ni normas.
- Generar representaciones 2D/3D coherentes desde el mismo modelo; transformar todas las dimensiones con la escala del material.
- Distinguir geometría visual de semántica de corte y de futura compensación. Un modelo visible no habilita por sí mismo una operación CNC.
- Verificar proporciones en varios tamaños de stock, coincidencia de punta con X/Z y cambio real de forma por tipo; incluir retroceso, carga y persistencia.
- Retirar o matizar etiquetas que aparenten dimensiones efectivas hasta que estén modeladas. Documentar limitaciones de acceso y colisión.

Este registro nació antes del incremento dimensional. La sustitución de formas/escala genéricas se completó en TOOL_ASSEMBLIES.md; no confundirla con un modelo físico de corte ni CAD de fabricante.
