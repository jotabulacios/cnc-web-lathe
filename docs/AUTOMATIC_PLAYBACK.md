# Reproducción automática por bloques

Entrega del 20 de octubre de 2026. Amplía el recorrido por pasos existente, sin cambiar la interpretación Rust, el contrato WASM ni las reglas de remoción.

## Comportamiento

«Reproducir» avanza de a un bloque. «Pausar» conserva cursor y perfil. Velocidades didácticas de 0,5/1/2/4 bloques por segundo; no representan F, duración física ni interpolación continua de la herramienta. Los bloques de estado también consumen un paso. M30/fin de la lista detiene la reproducción; para repetir se usa Reiniciar.

Anterior, Siguiente, Reiniciar, editar fuente, cambiar setup, restaurar ejemplo o reinterpretar pausan la reproducción. Ocultar la página también la pausa mediante visibilitychange; al volver no se reanuda sola. Un perfil parcial o error detiene la reproducción y permite inspección manual de la trayectoria. No se intenta reconstruir automáticamente geometría no soportada.

## Diseño

El reducer puro conserva running y runId. play solo acepta un programa ejecutable listo con bloques pendientes; un nuevo inicio aumenta runId. Cada tick lleva revisión, cursor esperado e identificador de reproducción. Se descartan eventos viejos, duplicados o de un programa inválido. Las respuestas de compilación obsoletas siguen sin afectar al estado vigente.

React usa un único setTimeout cancelable por intervalo, programado únicamente cuando el perfil actual está listo y completo. El cambio de cursor o velocidad cancela el timeout anterior. No hay setInterval, recuperación de pasos atrasados ni dependencia de FPS. Después de cada paso se espera el cálculo/validación del perfil antes de volver a temporizar. La cadencia puede ser menor con programas costosos; no se garantiza una frecuencia exacta.

## Colaboración externa

agy propuso el reducer y cinco pruebas desde archivos suministrados como texto. Se revisó e integró esa propuesta con dos correcciones: validar ready/executable también al recibir tick y hacer play idempotente si ya estaba activo. Se agregó una regresión adicional para ticks de una reproducción anterior que llegan al mismo cursor. La integración React, controles y E2E se realizaron en este proyecto. OpenCode/DeepSeek recibió una revisión independiente de temporización; su resultado se registra separadamente en EXTERNAL_REVIEWS.md.

## Pruebas

Seis pruebas unitarias nuevas del reducer además de las seis previas. La suite TS completa suma 29 casos. Cuatro E2E nuevos usan el reloj virtual de Playwright para pausa/reanudación, fin, velocidad, cancelación por acciones manuales/edición/setup y detención ante perfil parcial. Se conserva la suite anterior sobre el WASM real y se agregó una regresión de descarga del glue JS. Resultado final: 29 pruebas TS, typecheck y lint correctos; 11 E2E correctos en raíz y 11 en /cnc-edu/, con build Next para ambas rutas. Consultar evidence/autoplay-*.log para el resultado final de cada ejecución. El listener de página oculta no tiene todavía un E2E específico; no afirmar esa cobertura.

## Animación continua de la herramienta (22/10/2026)

Solo presentación. Al avanzar un bloque (Siguiente bloque, F8 o reproducción automática) la herramienta dibujada recorre en orden los movimientos del bloque —rectas y arcos exactos con centro, radio, barrido y sentido; ángulo = atan2(r − rc, z − zc), horario = ángulo decreciente— desde la posición anterior hasta la nueva. No cambian Rust, WASM, el perfil (sigue actualizándose por bloque), el reducer, el cursor, el DRO (muestra el estado resuelto del bloque desde el primer instante), la evaluación ni los proyectos guardados.

- **Saltan sin animar**: Anterior, Reiniciar, ediciones, nueva interpretación, bloques sin movimientos, la casilla «Animar trayectoria» desactivada (estado local, activa por defecto, no se guarda) y `prefers-reduced-motion: reduce`.
- **Duración didáctica** (`src/lib/lathe/motionAnimation.ts`): cada movimiento dura longitud / velocidad, con avance (G01/G02/G03) a 60 mm/s y rápido (G00) a 180 mm/s. El total se limita a [150 ms, máximo], con máximo 600 ms en pasos manuales y mín(600 ms, 0,8 × intervalo) en reproducción automática (200 ms a 4 bloques/s), así termina antes del siguiente tick. No representa F ni el tiempo de mecanizado.
- **Aproximación de correctores y nariz**: los movimientos son el camino de contacto y las vistas dibujan la punta ideal (`tipPosition`). Se dibuja contacto + desplazamiento, donde el desplazamiento se interpola linealmente en el tiempo entre (punta anterior − inicio del primer movimiento) y (punta nueva − fin del último). Empieza y termina exactamente en las puntas resueltas; en medio es aproximado si el desplazamiento cambia dentro del bloque.
- **Implementación**: `useBlockAnimation` (LatheLab) crea el descriptor solo para cursor + 1 sobre el mismo resultado y revisión; el reloj arranca en el primer `requestAnimationFrame` y el descriptor se descarta al cumplirse la duración, lo que fija la posición final. En 2D solo el marcador se vuelve a renderizar por cuadro; en 3D `setToolPosition` mueve la herramienta sin reconstruir la malla. `data-animating="true|false"` en `tool-marker` y en el lienzo 3D. Pruebas: `tests/motionAnimation.test.ts` y `tests/e2e/animation.spec.ts`.
