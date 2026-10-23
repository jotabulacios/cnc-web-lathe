# Próximo diseño: referencias y correctores de herramienta

> Actualización 22/10/2026: las entregas 2 y 3 están implementadas con alcance acotado (tabla fija por estación, X en diámetro, activación con el movimiento siguiente). Ver TOOL_OFFSETS.md. Siguen pendientes las entregas 4 a 6 (Tsstt libre, cambios de corrector sin cambio de T y G41/G42).

Estado: propuesta de integración; la primera base matemática pura ya está implementada y probada en TOOL_REFERENCES.md. La integración de correctores sigue pendiente. Los conjuntos dimensionales actuales no aplican correctores. No habilitar T0102 ni G41/G42 a partir de las medidas visuales.

## Problema que hay que resolver primero

Un porta más largo no debe desplazar arbitrariamente la trayectoria programada. Con una calibración correcta, cambiar la longitud de herramienta modifica la posición necesaria del portaherramientas, mientras la punta conserva la trayectoria deseada. Sumar directamente el largo del modelo a X/Z produciría una simulación educativa incorrecta.

Separar tres datos: geometría visual del conjunto, referencia de montaje medida y registro de calibración. El origen actual de cada conjunto es la esquina ideal programada; todavía no existe una referencia de torreta/montaje definida.

## Modelo propuesto y convención educativa

Trabajar internamente con radio físico R y Z axial, siempre en mm. X en diámetro se convierte exactamente una vez al entrar/salir del intérprete. No mezclar correcciones en diámetro con correcciones radiales mediante campos ambiguos.

- P: punto programado en coordenadas de pieza.
- W: origen de pieza en coordenadas de máquina. Primer alcance recomendable: desplazamiento axial; el eje del husillo conserva R0.
- Q: referencia del portaherramientas en máquina.
- L_real: vector medido desde esa referencia hasta la esquina ideal del conjunto montado.
- L_reg: vector registrado de calibración, con desgaste separado y unidades explícitas.

Convención propuesta: Q = W + P − L_reg; la punta física es Q + L_real. La punta para geometría de pieza es por tanto P + L_real − L_reg. Con calibración exacta, L_real = L_reg y no cambia el material mecanizado. Esta es una convención del modelo educativo; antes de nombrar un control comercial debe contrastarse su manual específico.

Ejemplo radial independiente: P_R=20, L_real_R=−60 y L_reg_R=−60 → Q_R=80 y punta_R=20. Si el registro vale−59.9, Q_R=79.9 y punta_R=19.9 (Ø39.8). Así se puede enseñar un error de calibración de0.1 mm radial sin confundirlo con0.1 mm en diámetro. No se propone todavía aplicar estos números a un programa existente.

## Entregas pequeñas

1. **Referencias puras Rust:** tipos/unidades y transformación reversible, sin G-code ni cambios de renderer. Casos analíticos de calibración perfecta, error radial/axial, signo, error de diámetro duplicado, límites numéricos y ausencia de datos. Fijar una referencia de montaje por conjunto antes de conectar geometría visible.
2. **Configuración educativa estática:** un conjunto y un registro inicial explícitos, sin cambios de corrector durante el programa. Mantener programa, trayectoria física y referencia de montaje diferenciados. Proyectos anteriores equivalen a error cero, no a calibración arbitraria inferida del dibujo.
3. **Contrato aditivo:** antes de integrar, diseñar una nueva versión que distinga punto programado, referencia de máquina y punta física. Los exports legacy deben seguir reproduciendo los fixtures anteriores exactamente. Rust produce todos esos datos; TS solo presenta/proyecta.
4. **Tabla de estaciones y registros independientes:** conservar stationId, assemblyId y offsetId separados. Solo entonces decidir Tsstt con estación distinta de corrector, cancelación, registros inexistentes y selección de desgaste. No ampliar silenciosamente el dialecto actual, que exige coincidencia.
5. **Cambios durante ejecución:** definir qué sucede al activar T/corrector, dónde se permite el cambio y cuál es el inicio físico del siguiente movimiento. Nunca inventar un segmento de corte por una activación de estado ni permitir un salto de punta dentro de material sin diagnóstico. Esta decisión debe preceder a su implementación.
6. **Compensación de radio posteriormente:** G41/G42 necesita radio de nariz, orientación de esquina, entradas/salidas e intersecciones. No es una traslación constante y no queda resuelta por este diseño.

## Criterios de aceptación de integración futura

Calibración perfecta conserva volumen y perfil actuales; error conocido produce el cambio analítico previsto. Avance/retroceso/reset, husillo, rápidos, diagnóstico, persistencia y descarte de respuestas obsoletas deben reconstruir todas las referencias consistentemente. Un corrector inválido o un resultado numérico ambiguo no puede generar remoción parcial. Verificar en Rust, WASM real y UI con referencia independiente, incluyendo las dos convenciones de unidades visibles.

No incluir G54 múltiple, paletas, puesta trasera, ciclos o CAM en el primer incremento. El modo actual de punta ideal seguirá disponible durante la introducción de esta frontera nueva.
