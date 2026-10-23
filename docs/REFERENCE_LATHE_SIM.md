# Referencia visual: torno con varias puestas, mordazas y sección 2D/3D

Fecha de revisión: 22/10/2026. Referencia aportada por el usuario: [publicación de Amer Icon](https://x.com/amer_icon/status/2113058335129993521). Se revisaron el texto y las cuatro imágenes en el navegador. No se accedió al código del producto ni se comprobó su algoritmo.

## Qué se pudo observar

- [Imagen 1](https://x.com/amer_icon/status/2113058335129993521/photo/1): sección longitudinal y vista 3D simultáneas, pieza, plato, mordazas, herramienta, reproducción y panel de avisos.
- [Imagen 2](https://x.com/amer_icon/status/2113058335129993521/photo/2): elección de mordazas compartidas entre puestas y configuración de su geometría/sujeción.
- [Imagen 3](https://x.com/amer_icon/status/2113058335129993521/photo/3): varias puestas, pieza con interior, trayectorias, corte visual y notas de preparación.
- [Imagen 4](https://x.com/amer_icon/status/2113058335129993521/photo/4): hoja de dimensiones con valores NC, objetivos, tolerancias y medición.

El texto describe tres puestas y sujeción por exterior e interior. Las imágenes muestran mensajes de comprobación geométrica, pero no permiten establecer su cobertura, precisión, validación industrial ni cálculo de deformación de la pieza. Tampoco demuestran generación automática de programas desde una instrucción de texto. No tomar las capturas como especificación completa.

## Viabilidad para este proyecto

Es una dirección viable para un simulador educativo en navegador. Next.js/Three.js y Rust/WASM permiten mantener la separación actual. El camino funcional requiere ampliar el modelo de material y de operación; una interfaz visual parecida puede llegar antes que todas sus comprobaciones. No se necesita reescribir el editor o trasladar el renderizado a Rust.

| Capacidad | Estado propio | Trabajo necesario |
|---|---|---|
| Unidades, orígenes y dialecto | Milímetros, coordenadas X/Z del dialecto educativo | Pulgadas, offsets de trabajo y correctores necesitan contratos y pruebas propios; no se presume compatibilidad con cualquier NC de las capturas |
| Editor, interpretación, diagnósticos, paso/reproducción | Implementado para edu-lathe-v1 | Ampliar códigos solo con contrato y fixtures |
| Sección 2D y superficie de revolución 3D | Implementadas como vistas alternativas | Vista dividida compartiendo el mismo resultado/revisión |
| Cilindrado, conos, arcos y cara frontal | Implementados con límites explícitos | Preservar prefijo confiable y pruebas actuales |
| Pieza hueca, mandrinado y perfiles interiores | No implementados | Perfil interior y exterior, herramienta/operación interior explícita |
| Ranuras y ancho físico de cuchilla | No implementados | Modelo de barrido y remoción con ancho, sin confundirlo con el dibujo T3 |
| Herramienta e inserto con dimensiones, portaherramientas | Representaciones ilustrativas | Geometría parametrizada y referencia de punta verificable |
| Mordazas y sujeción OD/ID | Plato esquemático | Parámetros de sujeción y geometría de mordazas |
| Varias puestas con pieza heredada/invertida | No implementadas | Secuencia de operaciones, transformaciones de origen y material persistente entre puestas |
| Contacto/colisión geométrica | No implementado | Volúmenes y barridos de herramienta, holder, pieza y sujeción |
| Hoja de cotas/inspección | Tabla básica de tramos y cotas de ejemplos | Entidades medibles, procedencia NC, objetivos/tolerancias y exportación |

## Ruta incremental propuesta

### A. Medir y preparar respuesta de interfaz

Medir cálculo, serialización, validación y renderizado por separado antes de elegir Worker. Un Worker puede aislar cálculo pesado, pero no arregla por sí mismo un editor o SVG con miles de nodos ni elimina la copia de respuestas. Las mediciones de esta entrega se documentan en PERFORMANCE.md. Mantener la interfaz actual y sus nueve prácticas.

### B. Material con interior: primer cambio funcional importante

Diseñar un contrato aditivo de perfil con límites interior/exterior. Mantener los contratos v1/v2 y sus resultados mientras se introduce una nueva versión. Definir primero un caso de stock tubular y mandrinado; no inferir la cara de corte únicamente de la posición X. La operación o herramienta debe declarar si trabaja por interior o exterior. No añadir taladrado o ranurado de ancho finito como efecto implícito.

Un tramo de sección anular puede representarse por Z inicial/final y radios interiores/exteriores en ambos extremos. Validar `0 ≤ rInterior ≤ rExterior`, continuidad del dominio y estado vacío. La suma de integrales de `π(rExterior² − rInterior²)` da un oráculo independiente para el volumen. El renderer consume esa sección: SVG con hueco y Three.js con pared interior y tapas anulares; no basta con modificar el cilindro dibujado.

Aceptación mínima: un tubo con agujero constante, un mandrinado escalonado y un caso rechazado que conserva material anterior. Misma geometría en nativo, WASM, 2D y 3D; volumen analítico, paso/retroceso y serialización probados. Cualquier nuevo campo de material/setup exige una decisión explícita de versionado y migración de proyectos.

### C. Ranurado y herramientas dimensionadas

Definir orientación, radio de punta, ancho y referencia geométrica de cada herramienta. Implementar primero una cuchilla recta con ancho conocido y un barrido sencillo, con oráculos de remoción. La posición programada de la punta no debe cambiar al modificar la representación. Separar esta geometría de la compensación G41/G42, que es otro trabajo.

### D. Puestas y sujeción

Representar un proyecto como una secuencia de puestas: material de entrada, transformación de pieza/origen, sujeción y operaciones. La siguiente puesta hereda el material final confirmado, no una imagen ni un cilindro reiniciado. Probar inversión axial y traslado del cero con geometría conocida antes de permitir tres puestas arbitrarias.

Introducir primero una sujeción exterior sencilla; después sujeción interior y mordazas parametrizadas compartidas. Distinguir configuración conocida de dimensiones asumidas. Un dato inferido debe presentarse como tal y poder editarse. El diseño o mecanizado de mordazas blandas requiere su propio flujo y pruebas; no se obtiene simplemente añadiendo tres bloques al plato visual.

### E. Comprobaciones y hojas de preparación

Comenzar con contactos geométricos conservadores y sus limitaciones explícitas. Para comprobar holder/mordazas no alcanza con la punta ideal ni con una silueta axial: hay geometría no axisimétrica y posiciones angulares. Definir casos de contacto, separación y penetración; barrido continuo cuando corresponda, sin saltar por encima de obstáculos entre bloques.

Después, generar hojas de preparación y cotas desde entidades geométricas con procedencia de operación/bloque. Separar medida simulada, objetivo y tolerancia. Una hoja no debe certificar fuerzas de amarre ni deformación, que requieren otro modelo y datos.

## Qué no se cambia por esta referencia

El usuario pidió dejar la apariencia actual de herramientas para más adelante. Las capturas orientan el destino funcional; no autorizan copiar código, marca o recursos del producto mostrado. No se implementa en esta entrega ninguna nueva semántica de torno, ciclo, compensación, sujeción ni contacto. Antes de comenzar B se debe dejar el contrato técnico y ejemplos verificables concretos para revisión.
