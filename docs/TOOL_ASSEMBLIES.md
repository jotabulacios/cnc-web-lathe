# Conjuntos dimensionales educativos — 22/10/2026

## Procedencia y alcance

Los conjuntos son diseños educativos propios, definidos explícitamente en milímetros en toolAssemblies.ts. No fueron extraídos de fabricantes, normas ni CAD comerciales. Son representaciones simplificadas que permiten reconocer la familia y comparar proporciones con el material; no son modelos industriales validados.

Se sustituyen la pirámide/caja universal y el tamaño fijo de escena. Cada estación cambia la geometría completa, además del color. El mismo catálogo geométrico genera la proyección longitudinal SVG y las mallas Three.js.

| Estación | Conjunto de diseño propio |
|---|---|
| T0 | Porta nominal 12×12, longitud radial 50 desde R5; rombo de lado6 y punta80° |
| T1 | Porta nominal 12×12, longitud radial60 desde R5; rombo de lado8 y punta80° |
| T2 | Porta nominal 12×12, longitud radial55 desde R5; rombo de lado6 y punta55° |
| T3 | Cuchilla de ancho axial3, cuerpo radial45 desde R6 y abrazadera de ancho10; inserto rectangular |
| T4 | Porta axial nominal12×12, longitud60 desde Z5; triángulo con dos lados10 y punta80° |
| T5 | Barra cilíndrica Ø8 y longitud60 desde Z4; eje local R−6 y tangencial−4; rombo de lado4 y punta55° |

Los valores son mm salvo ángulos. Las longitudes nominales del porta no son la distancia total desde la punta. El catálogo puro conserva los polígonos y espesores exactos para evitar inferir otras dimensiones de esta tabla. T3 tiene un ancho visible de3 mm, pero el motor sigue usando una punta sin ancho de corte.

## Coordenadas y render

El origen común es la esquina ideal programada (Z0,R0,tangencial0). Three mapea Z→x, R→y y tangencial→z; SVG proyecta Z→x y R→−y. Prismas usan polígonos longitudinales extruidos con espesor tangencial; la barra de T5 es cilíndrica axial. No hay radio de nariz ni corrección de punta.

La escena divide todas las medidas de herramienta y stock por la misma escala max(longitud,diámetro). Cambiar material deja constantes las dimensiones en mm. SVG usa su escala física común de R/Z; los iconos de catálogo se encuadran por separado, por lo que no son una comparación dimensional entre tarjetas.

El encuadre2D incluye los cuerpos de las herramientas de los movimientos previstos y la activa; se evita un salto del material al cambiar T en el programa. Three encuadra pieza y conjunto, amplía el ámbito cuando es necesario y conserva la cámara al avanzar dentro de ese ámbito. Giro y zoom operan alrededor del objetivo de cámara. En setups muy grandes una herramienta pequeña puede resultar subpíxel; no se agranda artificialmente.

Cada sustitución de conjunto libera sus geometrías y materiales. El desmontaje es idempotente. El marcador de referencia se mantiene en el origen, separado de las piezas geométricas.

## Qué sigue sin calcularse

La geometría visible no determina la remoción del material. Rust conserva la punta ideal y sus operaciones admitidas; no se agregan colisiones del porta, validación de acceso, radio de nariz, desgaste, correctores ni remoción por ancho. La punta puede quedar oculta dentro del stock opaco en mandrinado: la barra se ve entrando por el agujero; la vista2D permite seguir la posición interior. Un modo de sección3D sería otro incremento.

Los proyectos guardan la identidad T y usan el catálogo visual de la aplicación; todavía no guardan una definición dimensional editable por el usuario. Para catálogos configurables deberá versionarse esa definición, preservando la referencia de punta y los programas existentes.

## Verificación

137 pruebas TypeScript, typecheck y lint correctos;23 WASM real como regresión del motor anterior. Las tres pruebas nuevas comprueban ángulos, ancho de cuchilla y barra, seis geometrías distintas, referencia común, dimensiones de las mallas Three reales, liberación única y escala/encuadre para varios tamaños.

68 E2E Chromium raíz y68 bajo /cnc-edu/ correctos: cambiosT1…T5 y retroceso, dimensiones reales normalizadas con material de1/100/1000 mm, guardado, prácticas y fallback sinWebGL. QA manual en pestaña propia con porta exterior, cuchilla y mandrinador. Logs en evidence/tool-assemblies-2026-10-22/. Rust/ABI no cambiaron; se conserva el WASM del incremento de refrentado (137 pruebas nativas de esa entrega).

El nuevo contenido hizo visible una limitación previa del editor al encogerse en móvil: la selección del diagnóstico quedaba fuera del viewport. Se corrigió conservando ese diagnóstico visible solo si sigue enfocado y conserva su selección. La prueba de9000 líneas conserva requisitos de alineación, contenido y virtualización.
