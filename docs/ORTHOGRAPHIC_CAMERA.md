# Cámara ortográfica de la vista 3D — 22/10/2026

Presentación pura: no cambia Rust, WASM, contratos, perfiles, DRO, evaluación ni proyectos guardados.

- Controles nuevos en la vista 3D: selector «Perspectiva / Ortográfica» y botón «Vista frontal Z/X». La vista frontal mira a lo largo de −tangencial, con Z horizontal y radio vertical, como la vista 2D.
- threeScene mantiene dos cámaras con la misma pose y la misma esfera de encuadre. Al cambiar de proyección se copian posición y orientación, y OrbitControls pasa a controlar la cámara activa. En ortográfica, +/− escalan `zoom` (entre 0,25 y 6) en lugar de mover la cámara, y la ventana se calcula con orthographicFrame (src/lib/lathe/orthographic.ts), compartido con la preview del inspector.
- El estado vive en LatheLab, igual que la sección: sobrevive a pasar a 2D y volver, y no se guarda en el proyecto.
- Atributos para pruebas en el canvas: data-camera, data-ortho-zoom y data-camera-direction (vector unitario objetivo→cámara, redondeado).
- Combinada con la sección longitudinal, la vista frontal ortográfica funciona como un corte técnico del mandrinado (captura en evidence/orthographic-camera-2026-10-22/).
- Defecto encontrado y corregido durante la QA visual: la primera versión de «Vista frontal» copiaba el objetivo en la posición antes de medir la distancia, lo que daba distancia 0 y una pose degenerada (se veía la pieza desde arriba). El E2E ahora exige la dirección 0,0,1.

Verificación: 142 Rust, fmt/Clippy; 145 TS con typecheck/lint; 23 WASM reales; 74 E2E en raíz y 74 bajo /cnc-edu/. WASM sin cambios.
