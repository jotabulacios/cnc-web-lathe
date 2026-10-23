# Refrentado tubular educativo — 22/10/2026

## Operación y límites

El perfil anular v3 admite refrentado exterior G01 a Z constante dentro del material. La punta debe viajar hacia X menor, comenzar con radio mayor o igual al máximo exterior del frente completo y terminar con radio menor o igual al mínimo interior de ese frente. Se ignoran intervalos exactamente vacíos al calcular esa banda. T5 sigue siendo mandrinado; no se convierte en herramienta de refrentado. Los cortes radiales parciales continúan rechazándose.

El contacto y los rápidos se clasifican antes de remover. Solo el corte efectivo exige husillo encendido y RPM positivas. Un rápido en material conserva RAPID_IN_STOCK; un corte sin husillo conserva SPINDLE_OFF. Repetir una cara ya vacía no crea material ni exige husillo. Un movimiento en Z0 no remueve. Arcos anulares, taladrado, ranurado dimensional y cortes inversos siguen fuera de alcance.

## Geometría y compatibilidad

AnnularProfile::face_to divide en el plano y conserva el dominio axial y la frontera interior; el frente retirado tiene interior=exterior (área cero). Las operaciones bore/cut_outer omiten únicamente intervalos de espesor exactamente cero; una pared positiva sigue participando y un cruce de pared continúa siendo error. Las operaciones son transaccionales, usan presupuesto compartido y conservan el límite de 4096 tramos.

Al interpolar una pared positiva, si ambos radios se redondean al mismo valor estrictamente dentro del tramo se devuelve incertidumbre numérica. No se interpreta ese redondeo como aire.

Cara y mandrinado compatibles en distinto orden conservan el mismo material y volumen. El radio almacenado en el intervalo vacío puede diferir porque conserva la frontera interior del momento del refrentado; no es una superficie física. SVG y Three.js omiten esas regiones y cierran el material en la nueva cara mediante tapa anular, conservando el agujero.

No cambia el DTO ni la versión de la ABI: ampliación de operaciones del perfil v3. Compilador y contratos v1/v2 anteriores se mantienen; sólidos sin T5 continúan usando su reconstrucción exterior v2.

## Práctica disponible

«Refrentado y mandrinado de un tubo» está en Ejemplos guiados. Fuente: fixtures/lathe/tubular-facing.nc; setup Ø50/Ø20×100, inicio X60/Z5, herramienta frontal ideal.

| Prefijo | Operación terminada | Volumen de referencia |
|---|---|---|
| 0–4 | Stock inicial | 52500π mm³ |
| 5–8 | Cara Z−5 | 49875π mm³ |
| 9–14 | Agujero Ø30 hasta Z−40 | 45500π mm³ |

Queda material Ø50/Ø20 entre Z−100 y −40, y Ø50/Ø30 entre −40 y −5. Entre −5 y Z0 no queda material. El volumen se deriva por secciones: 60×(25²−10²)π + 35×(25²−15²)π = 45500π mm³.

La práctica comprueba cuatro cotas donde existe material, volumen derivado de geometría y cabecera Rust, fuente/setup vigentes y estado final detenido, retirado y terminado. La geometría coincide desde el bloque 9, pero la evaluación se completa recién en el 14. Retroceder quita la confirmación.

## Validación

Ver WORK_LOG.md y evidence/tubular-facing-2026-10-22/ para los resultados finales de esta entrega. Cobertura nueva: volumen analítico, cono, idempotencia, corte total geométrico/Z0, planos inválidos, límite de tramos, incertidumbre sub-ulp, cortes posteriores sobre vacío, pared positiva muy fina, prefijos CNC, T5 rechazado para cara, husillo, rápido, corte parcial, WASM real, malla cerrada sin frente fantasma, retroceso y guardado local.

Se mantiene herramienta puntual ideal. Las formas y dimensiones de herramienta/porta requieren el trabajo independiente registrado en TOOL_GEOMETRY_BACKLOG.md.
