# Perfil del laboratorio decidido en Rust — 22/10/2026

Antes, `engine.ts` decidía en TypeScript si un programa usaba el modelo exterior (v2) o el anular (v3) según el agujero inicial y la presencia de T5. Esa regla es semántica CNC y ahora vive en Rust.

- `cnc_core::lab_profile_at(request_v2, inner_diameter_mm, completed_blocks) -> LabProfile`. Regla (`needs_annular_model`): interior distinto de 0, herramienta inicial `boring-id` o cualquier bloque cuyo estado posterior active `boring-id` → modelo anular para TODO el programa. En otro caso → exterior v2 reconstruido desde la compilación legacy v1, exactamente como antes.
- `LabProfile` se serializa sin etiqueta; cada variante ya lleva `profileVersion`.
- Export WASM aditivo `lab_profile({ program, completedBlocks, innerDiameterMm })`, con validación estricta de claves. `compile`, `compile_v2` y `stock_profile` v1/v2/v3 siguen iguales.
- `computeLabProfile` ya no recibe el resultado compilado ni conoce T5. Valida el esquema según la versión devuelta y rechaza un perfil exterior para un tubo.

Verificación:
- 3 pruebas Rust nuevas (crates/cnc-core/tests/lab_profile.rs). Comparan la salida con profile_at_v2 legacy en todos los cursores (también con arco) y con profile_at_v3. Cubren T5 posterior al cursor, arco anterior a T5 (sigue explícitamente fuera del modelo anular) y la regla con un programa rechazado.
- 1 prueba WASM real: lab_profile coincide con stock_profile_v2 legacy y con stock_profile_v3, y rechaza claves desconocidas.
- Total: 145 Rust, fmt/Clippy; 145 TS; 24 WASM; 74 E2E en raíz y 74 bajo /cnc-edu/. Hash WASM nuevo 6b1861748d00e6fe77f8b69830add40644960d3481dc51d2729e94a6c4eee9de. Logs en evidence/lab-profile-rust-2026-10-22/.
