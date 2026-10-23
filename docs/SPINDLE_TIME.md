# G96/G97/G50, G98/G99 y tiempo estimado — 22/10/2026

Solo en edu-lathe-v2; v1 sigue rechazando estos códigos. Son convenciones Fanuc usuales en enseñanza y están documentadas como modelo educativo.

## Husillo

- **G97 S…:** rpm directas (comportamiento anterior).
- **G50 S…:** límite de rpm. Solo con S: G50 con X/Z (fijación de coordenadas) no se admite en este subconjunto.
- **G96 S…:** velocidad de corte constante en m/min. Las rpm se recalculan con el diámetro actual, n = 1000·Vc/(π·D), limitadas por G50. En el eje (D = 0) rige el límite. **G96 sin G50 previo es error (CSS_NO_LIMIT)**, porque cerca del centro el husillo se dispararía. Un S posterior con G96 activo es Vc.
- `State.spindleRpm` con G96 son las rpm en la posición del final del bloque. `State.cssMMin` y `State.maxRpm` son aditivos.

## Avance

- **G98:** F en mm/min.
- **G99:** F en mm/vuelta (`State.feedPerRev`). Los movimientos llevan `feedMmRev` y `feedMmMin = null`. G99 con el husillo detenido o a 0 rpm es error (FEED_PER_REV_SPINDLE): la herramienta no avanzaría.

## Tiempo estimado (`Motion.timeS`, `CompileResult.estimatedTimeS`)

Se calcula al final, sobre los movimientos físicos, después de ciclos, correctores y nariz.
- Rápidos: velocidad didáctica fija de 5000 mm/min (`RAPID_MM_MIN`).
- G98: L / F.
- G99 con G97: L / (F·n).
- G99 con G96: se integra numéricamente 1/(F·n(r)) a lo largo del recorrido (64 muestras de punto medio), porque n cambia con el diámetro.
- Sin aceleraciones, cambios de herramienta ni pausas: es una estimación para comparar estrategias, no un tiempo de ciclo de máquina.

La interfaz muestra «Tiempo estimado transcurrido / total» junto al bloque actual. El DRO indica la unidad del avance y, con G96, la Vc y el límite.

## Verificación

- Rust (tests/timing.rs, 5 pruebas):
  - G98 y rápidos contra cálculo manual;
  - G99 a rpm constante (0,2 mm/vuelta × 1000 rpm);
  - G96: rpm a Ø50 (954,93) y límite G50 a Ø10, y un refrentado contra la integral analítica en dos tramos (con el límite y con n variable), con error menor al 0,2 %;
  - errores CSS_NO_LIMIT, G50 con ejes, G50 sin S, Vc 0 y G99 con el husillo detenido;
  - v1 sin tiempos;
  - el perfil corta normalmente con G96.
- WASM real por la frontera JS. E2E spindle-time.spec.ts.
