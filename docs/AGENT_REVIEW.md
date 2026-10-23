# Revisión por agentes — primera entrega

Fecha: 2026-10-20. Autorizada por el usuario. Los agentes no editaron fuentes; el agente principal contrastó sus observaciones y realizó los cambios.

## Agente interno de Codex

Detectó un caso real: convertir primero a f64 permitía que `G1.00000000000000001` se redondeara a G1. Se corrigió preservando una comprobación léxica de entero antes de interpretar G/M/N/O y se agregaron regresiones nativas/WASM. No informó otros errores concretos en estado modal, diámetro/radio, atomicidad y reproducción.

## Antigravity (AGY)

Se encontró el CLI local `~/.local/bin/agy` y se ejecutó. El primer intento de lectura del proyecto no produjo informe porque un comando necesitaba permiso y el modo sin interfaz no podía solicitarlo. No se cambiaron permisos ni se utilizó dangerously-skip-permissions.

Se repitió enviando el contenido relevante dentro del prompt e indicando no usar herramientas. La llamada terminó con código 0 y devolvió un informe. El CLI advirtió que --mode plan no surte efecto al desactivar expansión de slash commands; la revisión fue de texto suministrado, sin comandos ni ediciones. El archivo raw `evidence/antigravity-review.txt` conserva el resultado, no una lista de errores confirmados.

| Observación de AGY | Evaluación y acción |
|---|---|
| Selectores `G+0` / etiquetas `N+1` aceptados | El dialecto no explicitaba el signo positivo. Se estrechó/documentó la gramática: selectores y etiquetas solo dígitos, sin punto ni signo. Los signos siguen permitidos en ejes y números ordinarios. Regresiones añadidas. |
| Pérdida de atomicidad al superar MAX_BLOCKS | No reproducida: ya se emite Error y se vacían bloques/movimientos. Límite cuenta bloques ejecutables; comentarios posteriores al bloque 10.000 son válidos. Test existente cubre 10.001 y nuevo test cubre 10.000 + comentarios. |
| Números sin dígitos como `G.` / `X.` | El scanner ya rechaza con MISSING_NUMBER. Se añadieron pruebas de esos casos y spans. `X.5` es válido deliberadamente. |
| Setup.toolId String en Rust frente a literal en TS | No es fallo: el core valida generic-od y devuelve INVALID_REQUEST para otra herramienta, sin movimientos. El esquema de resultado no necesita repetir setup. Se verificó también a través del WASM real. |

La revisión externa ayuda a encontrar casos, pero sus afirmaciones se contrastan con comportamiento reproducible antes de cambiar la implementación.
