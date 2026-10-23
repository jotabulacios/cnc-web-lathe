# Revisión visual / UX — Torno CNC educativo (22/10/2026)

Revisión de solo lectura. No se modificó el repositorio. Imágenes de referencia (para estudio, no se copian al proyecto) en `/tmp/claude-1000/visual-review/refs/`; capturas de la app en `/tmp/claude-1000/visual-review/shots/`.

## 1. Referencias: qué se vio

Se obtuvieron las 6 imágenes reales de los dos posts vía `api.fxtwitter.com`:

- Post 2113058335129993521 ("lathesim", 4 imágenes): `HVMXWM6WwAAeUlh.jpg` (Split 2D sección + 3D con mordazas y barra de mandrinar), `HVMXWa5XgAAmx2X.jpg` (diálogo de configuración de mordazas), `HVMXWoOWIAAHsvN.jpg` (Split: sección 2D con trayectorias + 3D de la pieza anular; pestaña "Jaws & print" con notas READ/INFERRED/CHECK), `HVMXW5RWUAIAxqI.jpg` (hoja de cotas imprimible).
- Post 2111804281640624523 (2 imágenes): `HU6izJ6WAAAWjse.jpg` y `HU6izWnXMAA0S6o.jpg` (3D con barra de mandrinar e inserto violeta, panel "Build" con árbol Setup/Op/herramientas, preview 2D+3D de la herramienta, leyenda de punto programado/centro de nariz y formulario).

### Qué hacen bien

1. **Layout tipo aplicación, no tipo página.** Barra superior fina (marca + selector + acciones + botón primario oscuro "Run"), pestañas de setup/op, y debajo **tres zonas fijas a la altura de la ventana**: viewport grande (izq./centro), panel lateral con pestañas (derecha) y transporte + línea G-code actual pegados debajo del viewport. No hay scroll de página para trabajar.
2. **El viewport es el protagonista** (~65 % del ancho). Controles de vista **superpuestos en la escena** como grupos segmentados: `Section | 3D | Split`, `Iso | Front | Top | Right`, `Ortho`, y abajo toggles `Cutaway / Raw stock / Chuck / Jaw section / Toolpath / Edges`. Ayuda de gestos en una línea gris tenue dentro del canvas.
3. **Vista Split 2D+3D**: sección 2D con rayado técnico (hatch a 45°, contorno negro, línea de eje punteada) al lado del 3D. El 2D es lenguaje de plano, no un gráfico.
4. **Materiales 3D legibles por rol**: acero gris claro con reflejo especular alargado en la barra/pieza (environment/gradiente), porta casi negro, **inserto en un color saturado** (violeta, verde) y mordazas en azul. Fondo gris medio neutro, no negro: las siluetas oscuras y claras contrastan. Contexto de máquina (plato, mordazas) da escala. "Edges" parece agregar contornos.
5. **Cámara encuadrada al detalle**: la herramienta y la zona de corte llenan el viewport; no hay grilla de piso ni espacio vacío.
6. **Panel lateral con jerarquía clara**: pestañas (Flags (n) / Program / Build / Jaws & print), listas con título + código monoespaciado pequeño (`UNSUPPORTED • line 38`), chips de estado (READ / INFERRED / CHECK). Mucho texto, pero estructurado en filas escaneables, no en párrafos.
7. **Inspector de herramienta**: árbol de navegación a la izquierda, buscador, preview 2D (proyección con punto rojo = punto programado) + preview 3D ("Drag to turn") lado a lado, leyenda en una línea, ficha en negrita + descripción, y formulario de etiqueta/valor.
8. **Tipografía**: una sans (tipo Inter/IBM Plex) a 14–16 px para UI, monoespaciada solo para código/números. Botones con borde fino, radio pequeño, estado activo = relleno oscuro. Tema claro, sobrio.

## 2. Por qué la versión actual no termina de convencer

Capturas: `desk-01-initial.png`, `desk-02-2d-mid.png`, `desk-03-3d-persp.png`, `desk-04-3d-ortho-section.png`, `desk-05-inspector.png`, y equivalentes `mob-*`.

1. **Es una página que se scrollea, no un banco de trabajo.** (`desk-03-3d-persp.png`, alto total 2494 px a 1440×1000.) Encabezado de marketing ("Programá. Avanzá. Entendé."), dos acordeones a ancho completo, luego la vista. En `desk-01-initial.png` la primera pantalla no muestra ni la pieza: muestra tarjetas de herramientas y párrafos. El viewport aparece recién en y≈860.
2. **El viewport está enterrado y es chico.** Dentro del panel "Vista del torno" se apilan: selector 2D/3D, resumen de pieza, biblioteca de herramientas abierta (6 tarjetas + 2 párrafos), inspector, y recién después la escena (340 px de alto, `.three-stage { height:340px }`). En 3D la pieza ocupa ~25 % del canvas con una grilla de piso que no aporta (`desk-04-3d-ortho-section.png`). La telemetría (X/Z grandes) y el transporte están debajo, a otra pantalla de distancia del dibujo: al pulsar "Siguiente bloque" no se ve la pieza.
3. **Render 3D plano y sin lectura de roles.** (`desk-03`, `desk-04`.) Pieza y herramienta son el mismo gris azulado mate (`0x97aebf` en `threeScene.ts`, `#657c8e` porta en `toolObject.ts`); la barra de mandrinar se confunde con la pieza; el inserto es diminuto y casi invisible. Sin plato/mordazas no hay escala. Sin contornos (edges). Fondo `#0b131d` casi negro: las sombras de la pieza se pierden. Las caras de corte cobre (`0xc98f5a`) son el único acento y compiten con todo lo demás. La referencia, en cambio, separa acero claro / porta oscuro / inserto saturado / mordazas de color.
4. **Densidad de texto alta y tipografía diminuta.** El CSS usa 9–11 px en muchos sitios (`.eyebrow 9px`, `.setup-summary small 9px`, `footer 9px`, `.view-badge 9px`, captions 10–11 px). Hay párrafos explicativos y descargos repetidos en cada panel ("Diseño propio educativo…", "sin compensación…", "sin colisiones del porta") — en `desk-04` hay cuatro bloques de texto seguidos debajo del canvas. La referencia condensa esto en chips y una línea de ayuda.
5. **Bug visual concreto:** `<p className="three-tool-dimensions">` (`LatheThreeView.tsx:95`) no tiene regla CSS: sale a 14 px, sin padding lateral, pegado al borde del panel (`desk-04-3d-ortho-section.png`, `mob-04-3d-ortho-section.png`, "Barra Ø8 mm · largo 60 mm…").
6. **Controles 3D como fila de botones genérica bajo el canvas** (`desk-04`): ↶ ↷ + − / Restablecer / Perspectiva|Ortográfica / Vista frontal / Sección. Todos con el mismo peso; los estados activos verde-menta se parecen a los botones normales. Falta Iso/Frente/Superior, falta Split 2D+3D.
7. **Inspector correcto en contenido pero con poco peso visual** (`desk-05-inspector.png`): la proyección 2D es buena (dimensión, punto de referencia), pero el 3D es pequeño, gris sobre gris, con el inserto verde apenas visible; está escondido dentro de un `<details>` dentro del panel de la vista. En móvil (`mob-05-inspector.png`) la tabla se corta horizontalmente.
8. **Jerarquía de color confusa**: ámbar = primario (Interpretar, Siguiente bloque), ámbar = también texto de posición de punta y bordes; verde-menta = selección, estado OK, perfil actualizado, trayectoria. En la referencia el primario es un único azul-pizarra oscuro y los colores saturados se reservan para objetos de la escena y estados.
9. **Móvil** (`mob-01-initial.png`): razonable como lista, pero el usuario hace mucho scroll entre biblioteca, escena y transporte; la escena 3D ocupa ~280 px.

Lo que sí funciona y conviene conservar: la vista 2D con plato, cara Z0, eje y leyenda (`desk-02-2d-mid.png`), el editor con resaltado de bloque actual, la telemetría grande X/Z, la explicación del bloque, y la honestidad de los descargos (solo conviene condensarlos).

## 3. Propuesta priorizada

### P1 — Layout de banco de trabajo (impacto: muy alto · esfuerzo: medio, 1–2 días)
En ≥1050 px: grid a altura de ventana `100dvh`: barra superior fina (marca, ejemplo/proyecto como menús, estado, botón primario "Interpretar"); columna izquierda = viewport (flex:1) + debajo una franja compacta de transporte (◀ ▶ reproducir, velocidad, progreso) + línea de bloque actual en monoespaciada + lectura X/Z/F/S en una fila; columna derecha = panel con pestañas `Programa | Herramientas | Pieza | Explicación`. Mover "Ejemplos guiados", "Guardar/abrir", biblioteca, inspector y "Pieza y origen" a esas pestañas o a menús. Eliminar el hero "Programá. Avanzá. Entendé." o reducirlo a subtítulo. En móvil mantener el apilado pero con la escena primero y transporte sticky abajo (respetando `env(safe-area-inset-bottom)`).
Archivos: `src/components/LatheLab.tsx` (estructura), `src/app/globals.css` (`.workspace`, `.control-deck`, `.topbar`, `.session-heading`, media queries), `ProjectActions.tsx`, `GuidedPractice.tsx`, `ToolLibrary.tsx` (pasan a vivir en pestañas). Cambio solo de UI; no toca motor ni WASM. Riesgo: tests e2e de Playwright que dependan de selectores/orden (revisar `tests/`).

### P2 — Escena 3D con materiales por rol y encuadre (impacto: muy alto · esfuerzo: medio, 1 día)
- Fondo gris medio con leve gradiente (p. ej. `#5b6570`→`#3a424b`, o claro `#c9d0d6` si se elige tema claro) en vez de `#0b131d`; quitar o atenuar `GridHelper`.
- `RoomEnvironment` + `PMREMGenerator` (incluido en `three/examples`, sin assets externos) para reflejos de acero; pieza `metalness .8 / roughness .3` gris claro; porta casi negro `#2a2f35`; inserto color saturado por familia (ya existe `tool.geometry.color`, subir saturación y tamaño del marcador); caras de corte rayadas o en un tono claro distinto.
- `EdgesGeometry` + `LineSegments` (umbral ~30°) sobre pieza y herramienta, toggle "Aristas".
- Encuadre automático a pieza + herramienta con margen 1.1, no a la esfera de una grilla vacía; altura del stage `clamp(360px, 60vh, 720px)` dentro del layout P1.
- Opcional, más tarde: plato y mordazas esquemáticas (geometría propia y simple) para escala; etiquetarlas como esquema.
Archivos: `src/lib/lathe/threeScene.ts`, `src/lib/lathe/toolObject.ts`, `src/lib/lathe/toolPreviewScene.ts` (mismo tratamiento, idealmente compartiendo una función `createStudioLighting/materials`), `src/lib/lathe/sectionMesh.ts` (material de tapa), `globals.css` (`.three-stage`). Verificar fallback sin WebGL y que volumen/perfil reportados no cambien.

### P3 — Controles superpuestos y vistas estándar (impacto: alto · esfuerzo: bajo-medio, ½–1 día)
Grupos segmentados flotando en las esquinas del canvas: arriba-derecha `2D | 3D | Dividida` y `Iso | Frente Z/X | Superior` + `Orto`; abajo `Sección · Aristas · Trayectoria · Herramienta`; ayuda de gestos en una línea tenue dentro del canvas. Estado activo = relleno sólido, no solo borde. Vista "Dividida" reutiliza el SVG 2D existente a la izquierda.
Archivos: `LatheThreeView.tsx`, `LatheViewport.tsx`, `LatheLab.tsx` (estado de modo), `threeScene.ts` (presets de cámara), `globals.css` (`.three-controls`, `.view-selector`).

### P4 — Sistema tipográfico y de densidad (impacto: alto · esfuerzo: bajo, ½ día)
Escala mínima 12 px (cuerpo 14, etiquetas 12, código 13); eliminar 9–10 px. Una sola fuente de UI (p. ej. "Inter" o "IBM Plex Sans" vía Google Fonts con fallback del sistema) y monoespaciada solo para G-code y cifras. Tokens de color con roles: `--primary` (uno solo), `--ok`, `--warn`, `--error`, `--accent-scene`. Condensar descargos en un chip "Modelo educativo ⓘ" con popover/`<details>` y una línea en el pie; quitar párrafos repetidos bajo el canvas. Corregir `.three-tool-dimensions` (sin estilo hoy).
Archivos: `globals.css` (`:root`, `.eyebrow`, `.setup-summary`, `footer`, `.three-caption`, `.tool-cards`…), `layout.tsx` (fuente), `LatheThreeView.tsx`, `ToolLibrary.tsx`, `LatheLab.tsx` (textos).

### P5 — Inspector de herramienta como pestaña propia (impacto: medio · esfuerzo: medio, 1 día)
Pestaña "Herramientas" del panel derecho: lista T0–T5 compacta (glifo + código + nombre en una fila) a la izquierda o arriba, y a la derecha proyección 2D + preview 3D lado a lado más grandes, leyenda en una línea ("● esquina ideal · Z+ derecha · X+ arriba"), ficha en negrita, tabla de medidas con scroll contenido. Reemplaza la grilla de 6 tarjetas grandes de la biblioteca.
Archivos: `ToolInspector.tsx`, `ToolLibrary.tsx`, `ToolPreview.tsx`, `LatheToolGlyph.tsx`, `toolPreviewScene.ts`, `globals.css` (`.tool-inspector*`, `.tool-cards`).

### P6 — Rayado técnico en la sección 2D (impacto: medio · esfuerzo: bajo)
Material restante con hatch a 45° y contorno oscuro, removido con rayado tenue — lenguaje de plano como en la referencia. Archivos: `LatheViewport.tsx` (patrón SVG `<pattern>`), `globals.css`.

Orden sugerido: P4 (rápido, incluye el bug) → P2 → P1 → P3 → P5 → P6. P2 y P4 mejoran mucho la percepción sin tocar estructura; P1 es el cambio que más acerca al "look" de la referencia y conviene presentarlo como plan antes de refactorizar (AGENTS.md).

## 4. Dos direcciones globales

**A. Workbench técnico oscuro tipo CAD.** Mantener tema oscuro pero con fondo de escena gris medio (no negro), paneles `#1b2026`, un único primario azul acero, acentos saturados solo en la escena (inserto, trayectoria). Ventaja: continuidad con lo actual, editor G-code cómodo, menos cambio. Riesgo: si no se sube contraste, sigue "apagado"; hay que cuidar que la escena no quede oscuro sobre oscuro.

**B. Limpio claro didáctico (lo más cercano a la referencia).** Fondo `#eef1f4`, paneles blancos, texto `#1d2530`, primario pizarra `#1f2a37`, escena gris-azulado claro con acero brillante, porta negro, inserto violeta/verde; planos 2D en blanco con rayado negro. Ventaja: lectura de plano y de materiales muy superior, se proyecta mejor en aula. Costo: rehacer paleta completa, colores del resaltado de G-code y del SVG 2D; respetar `prefers-color-scheme` exigiría mantener ambos temas.

Recomendación: B para la escena y los planos (es donde está el valor didáctico) aunque el chrome siga oscuro si se prefiere; en cualquier caso, P1+P2 importan más que el tema.

## 5. Honestidad

Las herramientas del simulador son diseños educativos propios; mejorar materiales, contornos o mordazas esquemáticas no las convierte en CAD de fabricante ni en cuerpos de colisión validados, y la UI debe seguir diciéndolo (condensado, no eliminado). La referencia afirma chequeos de choques; aquí no se verificó nada de eso y no debe imitarse esa afirmación.
