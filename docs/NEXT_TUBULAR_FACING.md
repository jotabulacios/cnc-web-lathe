# Próximo incremento propuesto: refrentado tubular

Estado: diseño histórico ejecutado en esta continuación. Ver [operación implementada](TUBULAR_FACING.md) y [log](WORK_LOG.md) para alcance y verificación actuales. Las secciones siguientes conservan el diseño previo.

## Objetivo y límites

Reutilizar G01 y la herramienta exterior/frontal para retirar el frente de un tubo conservando el agujero. No añadir G-codes, taladrado implícito, compensaciones ni modelo físico de barra/portaherramienta. Los sólidos sin T5 deben seguir usando perfilv2 y conservar su comportamiento actual.

La base exterior permite refrentado ideal hasta X0. Para un tubo, llegar al eje no es necesario para retirar la pared frontal; el contrato nuevo debe expresar explícitamente cuándo la punta ha atravesado toda la banda de material y cuándo solo ha hecho un corte radial parcial. No inferir una eliminación de todo el frente por cualquier movimiento radial.

## Geometría pura propuesta

Una operación `face_to(z_cut)` conservaría todos los tramos posteriores y eliminaría el material entre `z_cut` y Z0. El dominio axial se mantendría; en la zona eliminada los radios exterior/interior serían iguales. Preservar la pared interior como referencia y asignar exterior=interior evita reducir implícitamente el agujero inicial y respeta el adaptador actual, que exige interior≥agujero inicial.

La operación debe devolver un perfil nuevo y conservar el original si falla, compartiendo presupuesto y límite de4096tramos. Un tramo cruzado por el plano se divide localmente, sin interpolar a través de hombros. Volumen y renderers ya admiten espesor cero; hay que verificar sus tapas/secciones en los nuevos casos de transición.

## Trampa de integración que debe resolverse primero

No basta con añadir `face_to` y llamar después a `bore`/`cut_outer` como ahora. Una zona de frente vacío podría tener interior=exterior=10. Un mandrinado posterior a radio15 atraviesa esa zona en aire antes de cortar la parte trasera, pero la envolvente geométrica actual intentaría elevar el interior a15 frente al exterior10 y rechazaría el corte por cruce de pared.

Antes de habilitar refrentado, definir una de estas soluciones y probarla:

1. Que la remoción anular ignore explícitamente intervalos totalmente vacíos, conservando su representación y aplicando las envolventes solo donde queda material.
2. Que la reconstrucción divida la operación en intervalos con material antes de llamar a la geometría.

La primera mantiene la semántica de material en una sola capa, pero modifica una API geométrica existente. La segunda conserva esa API, a costa de más operaciones y cuidado en los límites. En ambas, una pared de espesor positivo, por pequeña que sea, no puede confundirse con vacío. Los casos numéricos ambiguos deben congelar el bloque.

## Semántica CNC a fijar

Primer alcance sugerido: G01 radial hacia X menor, Z constante dentro del stock, herramienta exterior admitida, husillo encendido y RPM positivas. Verificar que el radio inicial alcance el máximo exterior de todo el frente que se propone retirar y que el radio final llegue al mínimo interior de ese mismo material. Ignorar regiones de espesor cero al calcular esos extremos. Esto es una regla educativa de remoción ideal, sin certificar acceso físico.

Si el final queda dentro de la pared y no alcanza el agujero, mantener UNSUPPORTED_PROFILE_CUT. T5 no debe convertirse en herramienta de refrentado exterior sin una decisión explícita. Un movimiento en el plano frontal Z0 no retira volumen. Repetir exactamente una cara ya retirada no debe exigir husillo ni producir material adicional, siempre que se demuestre aire/contacto. Un rápido nunca retira el frente.

Confirmar estas reglas en documentación del dialecto antes de programar la reconstrucción. No afirmar compatibilidad Fanuc genérica por implementar este caso.

## Oráculos mínimos

| Caso | Resultado esperado |
|---|---|
| Tubo Ø50/Ø20×100, cara en Z−5 | Volumen49875πmm³; frente vacío[-5,0], agujero conservado |
| Misma cara repetida | Geometría y volumen idénticos |
| Cara Z0 | Stock inicial intacto:52500πmm³ |
| Cara con husillo apagado y material presente | SPINDLE_OFF y rollback completo |
| Final radial dentro de la pared | Operación parcial no soportada; perfil anterior |
| Rápido a través de pared frontal | RAPID_IN_STOCK; ninguna remoción |
| Refrentado y luego mandrinado hasta Z−40 | Sin falso cruce de pared en el frente vacío; volumen45500πmm³ para agujero Ø30 entreZ−40 yZ−5 |
| Mandrinado hasta Z−40 y después cara Z−5 | Mismo perfil y volumen45500πmm³ |
| Corte exterior posterior pasando por frente vacío | Aire hasta la nueva cara y remoción solo donde queda material |
| Pared cónica/hombros en el frente | Interpolación local, bandas preservadas y volumen por diferencia de troncos |

La equivalencia del orden solo corresponde a estas operaciones geométricas compatibles; no implica equivalencia general de programas ni de herramientas físicas.

## Orden de implementación

1. Pruebas de geometría pura para cara/void y cortes posteriores; luego método transaccional.
2. Pruebas de prefijos, contacto, husillo, límites y rollback en perfilv3; preservar diagnósticos actuales hasta implementar la operación completa.
3. Reconstruir WASM real y validar los mismos oráculos. El DTO anular ya admite espesor cero, por lo que no debería exigir otra versión salvo que cambie el contrato.
4. Confirmar hueco/tapa anular en2D/3D, retroceso, reinicio, persistencia y subruta.
5. Añadir práctica guiada usando expectedAnnularProfile y comparación de medidas existentes. Actualizar texto de operaciones admitidas solo después de pasar las pruebas.

No hay que reescribir parser, catálogo de herramientas ni generadores de malla para comenzar. No incluir ranurado con ancho, arcos interiores o mordazas en el mismo incremento.

## Avance del kernel — 22/10/2026

Se implementó únicamente AnnularProfile::face_to en geometría pura: conserva dominio/agujero, divide en el plano y representa el frente retirado con espesor cero. Tres pruebas nuevas verifican volumen analítico, idempotencia, corte total/Z0, interpolación cónica y rechazo de planos inválidos sin modificar el original. 132 pruebas Rust y Clippy correctos. pnpm check pasó (133 TS, typecheck y lint); 22 pruebas del WASM existente pasaron como regresión de la base, no como validación de esta nueva función, todavía no exportada ni integrada.

No está habilitado el refrentado tubular CNC/UI. Falta resolver cortes posteriores sobre intervalos vacíos, presupuesto/límite y casos numéricos adversos del método nuevo; luego semántica de prefijos/contacto/husillo/rollback, reconstrucción WASM y validación visual. La preview no cambió. Evidencia en evidence/tubular-facing-kernel-2026-10-22/.
