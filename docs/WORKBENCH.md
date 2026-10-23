# Banco de trabajo a pantalla completa y tema claro — 22/10/2026

Paso P1 de visual-review-2026-10-22/VISUAL_REVIEW.md. El usuario eligió la dirección B (clara y didáctica) y la distribución con visor a la izquierda y panel de pestañas a la derecha. Es un cambio de presentación: no toca Rust, WASM, contratos ni proyectos.

## Distribución

- **≥ 1050 px**: grilla a `100dvh`, sin scroll de página.
  - Barra superior fina: marca, estado del programa, chip «Modelo educativo» y botón primario «Interpretar programa» (Ctrl/⌘+Enter).
  - Columna izquierda: visor (2D/3D segmentado, trayectoria, resumen de pieza y herramienta) con el estado del perfil debajo. Más abajo, la franja de control: transporte, bloque actual en monoespaciada y DRO.
  - Columna derecha: panel con pestañas Programa · Pieza · Herramientas · Explicación · Prácticas.
- **< 1050 px**: apilado con el visor primero, después el control y al final el panel. El plano 2D toma su proporción natural.
- Siempre visibles: estado, Interpretar, estado del perfil y sus avisos, transporte, bloque actual y DRO. Los paneles inactivos usan `hidden` y quedan montados, así se conservan el borrador y el estado del editor.
- «Ubicar …» en cualquier diagnóstico activa la pestaña Programa antes de enfocar el editor. Un documento con setup inválido abre la pestaña Pieza.
- Pestañas accesibles: `role=tab`/`tabpanel`, `aria-selected` y navegación con flechas.

## Contenido por pestaña

| Pestaña | Contenido |
|---|---|
| Programa | Editor G-code, «Restaurar ejemplo», recuperación, errores del motor, diagnósticos, «¿Qué puedo programar?» |
| Pieza | Medidas y origen, herramienta inicial, tabla de correctores, ejemplo de mandrinado, botón «Hoja de cotas» (DIMENSION_SHEET.md), modelo de corte y tabla de medidas del perfil |
| Herramientas | Biblioteca T0–T5 e inspector |
| Explicación | Explicación del bloque, abierta por defecto, y la nota del modelo educativo (reemplaza el pie de página) |
| Prácticas | Ejemplos guiados y guardar/abrir proyecto, abiertos por defecto |

## Tema claro

Tokens por rol en `:root`: fondo, panel, borde, texto, primario oscuro, acento azul, ok, aviso y error. Texto mínimo de 12 px. El editor G-code tiene colores de sintaxis para fondo claro. Se eliminaron el encabezado «Programá. Avanzá. Entendé.» y el pie con avisos repetidos. Las notas de la vista 3D pasan a un desplegable «Detalles de la vista».

## Escena clara (P2/P3)

- **Plano 2D como dibujo técnico:**
  - fondo claro, acero gris claro con rayado de sección a 45° y aristas oscuras;
  - material removido con rayado ámbar suave;
  - trayectoria de avance en verde y rápidos en naranja oscuro;
  - plato en grises;
  - etiqueta de herramienta en la franja de títulos, fuera del área de dibujo.
- **Escena 3D:** fondo claro y ambiente de estudio generado (`RoomEnvironment` a 64 px, sin archivos externos). Pieza de acero metálico, porta oscuro, inserto saturado, aristas de cambio de forma (más de 30°) en pieza y herramienta, caras de sección cobre mate. Sin grilla de piso.
- **Controles 3D superpuestos** arriba a la derecha del lienzo, con estado activo relleno.
- La preview del inspector y su silueta usan el mismo tratamiento claro.
- Se corrigió el texto de la biblioteca, que decía que el corte era siempre puntual: ahora hay radio de punta.
- Costo medido: la suite E2E con WebGL por software pasó de unos 57 s a 1,4 min. Con un mapa de ambiente de 256 px una prueba de abrir y cerrar 8 veces el inspector superaba el tiempo límite, y por eso se usa 64 px.
