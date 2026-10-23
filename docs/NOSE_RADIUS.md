# Radio de punta y compensación G41/G42 — 22/10/2026

Primer incremento de la entrega 6 de TOOL_OFFSETS_PLAN.md (edu-lathe-v2). Decisiones del usuario: solo tramos rectos con la compensación activa, activación y cancelación con el movimiento siguiente, y orientación de punta fija por herramienta.

## Convenciones del modelo educativo

- **Radio ρ** por estación, columna «Radio de punta R» de la tabla de correctores. Va en radio, de 0 a 5 mm. Con 0 (o sin columna) todo queda bit a bit igual que antes.
- **Punta imaginaria P** = punto programado, después de reglaje y desgaste. **Centro de la nariz** C = P + o, con:
  - exteriores T0–T4: o = ρ·(1, 1) en (Z, R);
  - mandrinado T5: o = ρ·(1, −1).
- **G42**: nariz a la derecha del recorrido en la vista 2D (Z a la derecha, X hacia arriba), es decir, cilindrado exterior hacia el plato. **G41**: a la izquierda (mandrinado). **G40**: cancela. Es una convención documentada del simulador, no la de una torreta comercial concreta.

## Qué se simula

El modelo de material sigue cortando con un punto. Rust reescribe los movimientos como la **trayectoria de contacto** de la nariz:
- **G40 con ρ > 0:** el camino del centro desplazado ρ hacia el material.
  - Cilindros y caras quedan exactos.
  - En las esquinas que abren, la nariz deja un **acuerdo de radio ρ**, en cuerdas con sagita ≤ 0,01 mm.
  - Los solapes se recortan.
  - En conos y arcos aparece el **error de forma clásico**: un chaflán de 45° queda ρ(2−√2) más grande en radio.
- **G41/G42:** el contacto sigue exactamente el contorno programado. El centro se desplaza y rodea las esquinas convexas. En las esquinas internas la nariz no llega al vértice y deja un acuerdo de radio ρ. La herramienta mostrada (punta imaginaria) se corre, pero el DRO sigue mostrando lo programado.
- **Solapes en G40:** las dos líneas de contacto se conservan, porque el modelo de material toma el mínimo y esa es la envolvente correcta. Las une una cuerda dentro del disco de la nariz. Nunca se reescriben movimientos de bloques anteriores, así que los prefijos y el retroceso son exactos.
- **Herramientas con ρ = 0:** pasan sin cambios aunque otra herramienta tenga radio.
- **Entrada, cancelación y enlaces:** son tramos rectos de contacto. Los de avance se marcan `lead`, y la reconstrucción los diagnostica con COMP_LEAD_IN_STOCK si atraviesan material: la entrada tiene que hacerse en el aire. Los acuerdos se atribuyen al corte que los genera, aunque después venga un rápido.
- **Refrentado a X0 con ρ > 0:** el contacto se extiende al eje y se avisa con NOSE_FACING_CENTER, porque queda un pequeño cono central que el modelo no representa.

## Diagnósticos

| Código | Cuándo |
|---|---|
| COMP_ARC | arco G02/G03 con compensación activa, o al activarla o cancelarla |
| COMP_TOOL_CHANGE | T con compensación activa |
| COMP_SIDE_CHANGE | G41↔G42 sin G40 |
| COMP_CYCLE | G70/G71 con compensación activa |
| COMP_GOUGE | esquina cóncava compensada con un tramo más corto que el radio |
| COMP_WRONG_SIDE | lado de compensación que pondría la nariz del lado del material (G41 exterior, G42 mandrinado) |
| COMP_NO_CANCEL_MOVE | G40 sin movimiento propio antes de reactivar G41/G42 o cambiar de herramienta |
| COMP_AXIS | la punta imaginaria compensada cruzaría el eje (refrentar a X0 con G40) |
| COMP_LEAD_IN_STOCK | entrada, salida o enlace que atraviesa material (reconstrucción) |
| NOSE_SHORT, NOSE_ARC_RADIUS, NOSE_ORIENTATION, NOSE_AXIS | geometría de nariz imposible en G40 |

v1 sigue rechazando G40/G41/G42 (UNSUPPORTED_CODE).

## Verificación

- Rust (tests/nose.rs, 8 pruebas):
  - con ρ = 0 y G42, la geometría es idéntica a la de antes;
  - cilindro exacto y acuerdo en el hombro (oráculo del círculo con cuerdas ≤ 0,01);
  - chaflán de 45° con error ρ(2−√2) sin compensación y exacto con G42 (oráculo analítico), y punta imaginaria compensada;
  - mandrinado con radio en el modelo anular;
  - reglas y diagnósticos, más una entrada en material detectada por la reconstrucción;
  - ciclos G71/G70 con radio sin ambigüedad en todos los cursores;
  - regresiones de la revisión y acuerdo interno compensado en todos los prefijos.
- WASM real: error frente a G42 por la frontera JS. TS: la columna de radio, su validación y compatibilidad con borradores viejos. E2E nose-radius.spec.ts.
- Revisión independiente (agente de solo lectura). Defectos corregidos, todos con prueba:
  - punta imaginaria con radio negativo, que rompía el contrato;
  - bloques sin movimiento con la punta sin compensar;
  - G40 sin movimiento propio que se perdía;
  - herramientas con ρ = 0 validadas igual;
  - arco en el radial de empate;
  - lado equivocado silencioso;
  - arranque nulo;
  - recortes que reescribían bloques anteriores.
  Además, en esa revisión se detectó que la esquina interna compensada quedaba en ángulo vivo (sobrecorte): corregido con el acuerdo ρ.
- Total: 168 Rust, fmt/Clippy; 148 TS; 27 WASM; 78 E2E en raíz y 78 bajo /cnc-edu/. Hash WASM c38dfb1603ff971be5aa66709467f7bf5ef6eaf750c6fa66fd8c96e5bc84d899. Logs en evidence/nose-radius-2026-10-22/.

## Límites

Sin compensación de arcos, sin número de punta imaginaria editable y sin G41/G42 dentro de ciclos. El refrentado deja un cono central sin modelar. La nariz no se dibuja en las vistas: se ve su efecto en el material y en la trayectoria.
