# Correctores de herramienta (tabla fija por estación) — 22/10/2026

Primer incremento de integración de TOOL_OFFSETS_PLAN.md (entregas 2 y 3, alcance acotado). Decisiones del usuario: tabla fija por estación, X en diámetro, activación con el movimiento siguiente.

## Convención educativa

- Por estación (T0…T5): error de reglaje X/Z y desgaste X/Z, en mm. **X en diámetro**, como en el programa; Rust lo convierte a radio una sola vez.
- **Los valores positivos alejan la punta** (diámetro o Z mayores). Punta física = punto programado + error de reglaje + desgaste. Se resuelve con el kernel `tool_reference` (montaje real = error, registro de desgaste = −desgaste), de modo que se aplican sus guardas de rango, cruce de eje y ambigüedad numérica.
- Es una convención del simulador, no la de un control comercial. La fila de T0 se aplica como cualquier otra: en muchos controles reales T0 cancela el corrector, y acá no.
- Tsstt sigue exigiendo estación = corrector (T0102 es error). Sin G41/G42 ni radio de nariz.

## Activación y trayectoria

- Un bloque T no mueve nada. El movimiento siguiente va desde la punta física anterior hasta el destino corregido, y se evalúa como cualquier otro: corte, rápido en material, etc.
- La posición inicial del setup es la punta física. El corrector de la herramienta inicial también se aplica con el primer movimiento lineal o rápido.
- Un arco necesita una punta ya corregida. Si el corrector cambió justo antes del arco, o si el arco es el primer movimiento con corrector, se emite OFFSET_BEFORE_ARC.
- Los arcos se trasladan rígidamente (centro, extremos, mismo barrido y sentido). Se verifica que el arco trasladado no cruce el eje.
- `State.position` sigue siendo el punto programado (DRO). `State.tipPosition` (aditivo, solo con tabla) es la punta física, y las vistas 2D y 3D dibujan esa.
- Cualquier error (TOOL_OFFSET, OFFSET_BEFORE_ARC, tabla inválida) es atómico: el programa queda no ejecutable, sin bloques ni movimientos.

## Contrato y persistencia

- `Setup.toolOffsets?: [{ toolId, calibrationErrorXMm, calibrationErrorZMm, wearXMm, wearZMm }]`: una fila por herramienta, |valor| ≤ 100 mm, claves estrictas. Solo edu-lathe-v2: `compile` v1 responde INVALID_REQUEST en lugar de ignorarla (`null` equivale a ausente).
- `lab_profile` aplica la tabla en ambos modelos. El exterior compila legacy sin tabla y luego aplica y valida la misma transformación.
- Una tabla en cero no se emite: el setup es idéntico al legacy y la trayectoria también, bit a bit.
- Borrador: `draft.offsets` guarda los textos (coma decimal admitida) con errores por campo. Los proyectos con tabla se guardan como v2 y validan que la tabla y su borrador coincidan.

## Límites conocidos

- Refrentado hasta X0 con corrector X: con X negativo la punta cruzaría el eje (TOOL_OFFSET). Con X positivo la cara termina en R>0 y el modelo de refrentado, que exige llegar al eje, detiene el perfil con UNSUPPORTED_PROFILE_CUT. Es el pezón que dejaría la herramienta, y queda como diagnóstico explícito.
- La guarda de ambigüedad del kernel puede rechazar combinaciones extremas pero inofensivas (por ejemplo 1e-20 junto a 0,1).
- No hay cambio de corrector sin cambio de herramienta, desgaste por uso ni G41/G42.

## Verificación

- Rust: 8 pruebas nuevas en tests/tool_offsets.rs, con oráculos analíticos: Ø46 con desgaste −0,2 → Ø45,8; hombro Z−29,5; mandrinado Ø30 con +0,4 → Ø30,4 y volumen exacto. Cubren activación diferida, DRO programado, arco rígido, arco que cruzaría el eje, arco como primer movimiento, cruce de eje al refrentar, v1 y filas inválidas, y tabla inválida en lab_profile exterior.
- WASM real: frontera JS (aplicación v2, rechazo v1, clave desconocida, lab_profile).
- TS: borrador/validación y proyecto v2. E2E tool-offsets.spec.ts: error de campo, cálculo, DRO 46 frente a punta 45,8, tabla de perfil, guardado y reapertura, y vuelta a cero.
- Revisión independiente (agente de solo lectura). Bug corregido: un arco trasladado podía cruzar el eje sin diagnóstico. También se aplicaron: mensaje de arco inicial, tipPosition en fallos y documentación de refrentado y T0.
- Total: 153 Rust, fmt/Clippy; 147 TS; 25 WASM; 75 E2E en raíz y 75 bajo /cnc-edu/. Hash WASM 018a9ce5339a403d431c5ae59562b5738dcd80e4e79049422cf8da4e6f5f348f. Logs y capturas en evidence/tool-offsets-2026-10-22/.
