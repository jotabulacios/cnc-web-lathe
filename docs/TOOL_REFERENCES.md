# Base matemática de referencias de herramienta

Estado: kernel Rust puro implementado y probado, todavía desconectado del intérprete, WASM, proyectos y UI. No activa correctores en programas actuales. Su propósito es fijar ecuaciones y fallos numéricos antes de diseñar la nueva frontera.

## API nativa y unidades

`cnc_core::tool_reference::resolve_reference` recibe un punto programado de pieza, un origen axial de pieza y `ToolCalibration`. Esta última separa vector real desde montaje hasta punta, registro geométrico y desgaste. Los vectores son radiales/axiales, firmados, en mm. No recibe X en diámetro ni convierte unidades implícitamente.

Devuelve punto programado, referencia de montaje en máquina, punta física en máquina y punta física en pieza. La referencia de montaje admite componentes firmadas; la punta física no puede cruzar R0. El origen de pieza solo se traslada en Z: el eje radial sigue siendo el del husillo. No se asigna automáticamente una referencia de montaje desde los polígonos visuales.

Convención educativa:

```
L_reg = registro_geométrico + desgaste
Q = W + P − L_reg
P_física_máquina = Q + L_real
P_física_pieza = P_física_máquina − W
```

El origen radial W_R permanece cero. `L_real` representa una medición de montaje, no un largo visual sumado a la trayectoria. Con registro perfecto, la punta conserva el punto programado aunque cambie el montaje necesario.

| Caso analítico | Resultado |
|---|---|
| P_R20, L_real_R−60, L_reg_R−60 | Q_R80 y punta_R20 (Ø40) |
| Mismo montaje, L_reg_R−59.9 | Q_R79.9 y punta_R19.9 (Ø39.8) |
| Registro perfecto y desgaste_R+0.1 | Punta_R19.9 según esta convención educativa |
| P_Z−40, W_Z100, L_real_Z−8, L_reg_Z−7.75 | Punta_máquina_Z59.75 y punta_pieza_Z−40.25 |

Estos signos no se presentan como sintaxis ni comportamiento de un control comercial.

## Errores explícitos

Se rechazan entradas no finitas, magnitudes fuera del límite del motor y radio programado negativo. La suma de registros y cada resultado intermedio deben permanecer en rango; no se depende de una cancelación posterior para recuperar un resultado válido.

Una contribución no nula absorbida por redondeo devuelve NumericalAmbiguity. Además se verifica la inversión del registro y la concordancia de la punta con P + L_real − L_reg, con un margen de ocho épsilon relativo y suelo numérico de1. Es una guarda aritmética, no una holgura mecánica ni una tolerancia de mecanizado. Un gran origen que destruye precisión de una pequeña coordenada de pieza se rechaza. La función no modifica entradas ni genera remoción al fallar.

## Evidencia y alcance

Cinco pruebas nativas nuevas cubren144 combinaciones exactas de posición/origen/montaje, error radial y axial independiente, efecto doble en diámetro, desgaste separado con ambos signos, entradas inválidas, rango, cruce de eje y pérdida de precisión. La suite nativa completa queda en142 pruebas correctas; fmt y Clippy correctos.

WASM se recompiló para comprobar compatibilidad del workspace y pasó23 pruebas reales del comportamiento existente. La función nueva no está exportada. La versión actual de compile/compile_v2 conserva reglas de T y no aplica los registros nuevos.

No hay tabla editable de calibración, referencia de montaje del modelo visual, cambio de registro durante ejecución, G41/G42, torreta física ni nuevos campos de proyecto. TOOL_OFFSETS_PLAN.md define esas entregas y sus decisiones pendientes. No conectar la función al renderer o al perfil saltando esa frontera: el intérprete debe producir la trayectoria física y su procedencia.

Logs: evidence/tool-reference-kernel-2026-10-22/.
