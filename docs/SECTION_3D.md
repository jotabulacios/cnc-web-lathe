# Sección longitudinal 3D — 22/10/2026

Segunda mitad del incremento de TOOL_INSPECTOR_SECTION_PLAN.md. Presentación pura: no cambia Rust, WASM, contratos, perfiles, DRO, evaluación ni proyectos guardados.

## Comportamiento

- Botón «Sección longitudinal» en los controles de la vista 3D (aria-pressed). Oculta la mitad tangencial delantera de la pieza (escena z>0) y tapa el plano de corte z=0 con caras color cobre solo donde hay material.
- El agujero, los tramos exactamente vacíos y el frente refrentado no se tapan. La herramienta no se recorta y conserva su pose. Como los conjuntos ocupan tangencial ≤ 0, la barra y la punta de mandrinado quedan visibles dentro del agujero.
- data-profile-volume sigue siendo el volumen físico COMPLETO. Además se exponen data-section y data-section-triangles.
- El estado de sección vive en LatheLab y sobrevive a pasar a 2D y volver. No se guarda en el proyecto ni invalida la ejecución.

## Algoritmo elegido: malla de media revolución con tapas

Se eligió frente a clipping planes por ser verificable de forma determinista, por quedar dentro del presupuesto de buffers y por no dejar estado de recorte en el renderer.

- revolutionMeshV3(spans, stock, segments, section=true) recorre θ∈[π,2π] con ⌈segments/2⌉ facetas, con valores exactos en las costuras. Usa los mismos laterales y tapas de hombro (diferencia simétrica de bandas) que la malla completa. La malla completa conserva byte a byte sus buffers históricos.
- Plano de corte: por cada tramo con material, dos trapecios (R+ y R−). Sus bordes verticales se parten en los radios donde termina la banda vecina o una tapa de hombro, y se triangulan con un zipper entre las dos cadenas. Así cada arista se comparte exactamente dos veces, sin juntas en T.
- Perfiles v2 (sólidos): sectionMesh.ts los convierte a anulares con interior 0 para dibujar. El volumen se toma del código v2 (malla de 8 facetas que además aplica la validación v2), así que es idéntico al de la vista completa.
- El presupuesto de 32 MiB incluye las tapas de corte. La sección sustituye a la malla completa: no se suman.

## Verificación

- revolutionV3.test.ts: el verificador existente de superficie cerrada (cada arista con dos caras y orientación opuesta, winding según normales, sin triángulos degenerados) se aplica a tubo, conos, apex interior, pinzamiento a anillo, cono a eje, hombros a dos lados, bandas disjuntas, islas, fixture compartida y tubo refrentado.
- En cada caso el volumen firmado de la sección es la mitad del de la malla completa con la misma densidad angular (tolerancia relativa 1e-9), con todo z ≤ 0 y las tapas en z=0 con normal +z. También se prueban un agujero sin tapa, un frente refrentado vacío y el perfil máximo de 4096 tramos dentro de 32 MiB.
- revolutionV2.test.ts: la sección exterior conserva exactamente el volumen v2 y rechaza perfiles inválidos.
- E2E section.spec.ts: mandrinado en el bloque 5 con sección (47500π, cursor 5/15, DRO sin cambios, T5 visible), avance a 11 (43000π), ida y vuelta 2D y reset (52500π). También refrentado tubular (49875π → 45500π → retroceso). En no-webgl.spec.ts el botón no bloquea el regreso a 2D.
- Resultado global: 142 Rust, fmt y Clippy correctos; 145 TS con typecheck y lint; 23 WASM reales; 73 E2E en raíz y 73 bajo /cnc-edu/. WASM sin cambios (6ef8129d…715d). Logs y capturas en evidence/section-3d-2026-10-22/.

## Límites

La aproximación poligonal (48 facetas por vuelta) hace que el volumen geométrico de la malla no sea el analítico; el valor informado es el analítico del perfil. La cámara principal sigue en perspectiva. No hay recorte de herramienta ni selección del semiespacio.
