# Prácticas anulares y comparación de medidas — 22/10/2026

> Continuación: catálogo total 13 (10 recorridos positivos y 3 diagnósticos), con la práctica adicional de [refrentado tubular](TUBULAR_FACING.md). El texto siguiente documenta la entrega original de mandrinado y diagnóstico.

## Resultado

El catálogo contiene doce prácticas: nueve recorridos positivos y tres diagnósticos intencionales. Se incorporaron tres casos sin añadir códigos CNC ni modificar el motor de interpretación, los exports WASM o el formato de proyectos:

| ID | Propósito | Referencia |
|---|---|---|
| boring-and-turning | Mandrinado T5 y cilindrado exterior T1 | 15bloques, seis secciones, volumen43000πmm³ |
| diagnose-annular-rapid | Reconocer un rápido que cruza la pared | RAPID_IN_STOCK en bloque5/línea5/columnas1–8; material confirmado hasta4 |
| rapid-through-bore | Retirar primero en Z por el agujero y después alejar en X | 7bloques, stock intacto, volumen52500πmm³ |

El botón de mandrinado en «Pieza y origen» carga ahora la misma práctica del catálogo, conservando el documento anterior. La corrección del diagnóstico es explícita y recuperable, como las prácticas previas. Abrir un proyecto conserva su identidad de ejercicio, pero exige volver a interpretar antes de confirmar.

## Referencias y comprobación

El contrato de ejercicios admite exactamente uno de tres criterios: tramos exteriores, muestras exteriores con volumen o `expectedAnnularProfile`. El nuevo criterio contiene muestras ordenadas de radio interior/exterior y volumen/tolerancias. Se validan dominio axial, límites del material inicial y orden de paredes. Un tubo o una herramienta interior inicial no pueden declararse con referencias exclusivamente exteriores.

`annularMeasures.ts` mide únicamente tramos ya resueltos: volumen de diferencias factorizadas y suma compensada, secciones por interpolación local y banda común en hombros. No interpreta G-code ni decide remoción. La comprobación usa el volumen medido desde la geometría y el informado por Rust; un header correcto no compensa un agujero incorrecto. Las muestras no dependen de la cantidad de particiones del perfil. Las tolerancias son absolutas del ejemplo, no una tolerancia industrial.

Para confirmar mandrinado se requieren perfilv3, compiladorv2, revisión/cursor actuales, material/código originales, todos los bloques ejecutados, geometría completa, posición final retraída, husillo detenido y herramienta final esperada. Cambiar código/material, retroceder, reiniciar o recibir un resultado obsoleto revoca la confirmación.

La revisión independiente detectó una inconsistencia aceptada por el evaluador anterior: `finalState` correcto pero último `block.afterState` contradictorio con el DRO. Se reforzó la comprobación para todos los recorridos, incluidos los exteriores: posición, herramienta normalizada, husillo/RPM/dirección, avance, modo y fin deben coincidir entre ambos snapshots. La salida actual de Rust ya era coherente; se añadió la regresión en la frontera de comprobación.

## Comparación durante el recorrido

`AnnularReferences` muestra las cotas de referencia junto con las actuales, en diámetro, y marca cada sección como «Coincide», «Aún difiere» o «Sin perfil». La tabla usa la geometría confirmada de la revisión actual; al editar o cambiar material retira las medidas anteriores. Informa el bloque confirmado, el volumen medido y la diferencia frente a la referencia.

En el ejemplo de mandrinado, al inicio coinciden2de6secciones; tras ampliar el agujero coinciden4; después de cilindrar coinciden6. Eso no confirma el recorrido hasta completar su estado final. Retroceder desde M30 puede conservar todas las cotas coincidentes y aun así quitar la confirmación, porque el programa todavía no terminó.

El panel del diagnóstico muestra el material que debe conservarse. Que coincidan sus cotas tampoco prueba haber observado el error: se exige el aviso exacto y su bloque.

## Diagnóstico anular

Se añadió `stage: annular-profile`, con código RAPID_IN_STOCK, span, cursor de fallo, prefijo confirmado y referencias de material congelado. El evaluador exige código, severidad y procedencia exactos, una sola advertencia, versión correcta y geometría/volumen sin cambios. Solo observa el caso al cursor5; antes o después solicita avanzar/retroceder al bloque de interés. El estado «Diagnóstico observado» es distinto de «Recorrido completo».

El programa defectuoso llega a X18/Z−30 por el agujero y luego intenta G00 X60. La corrección vuelve primero a Z2 conservando X18 y recién después se aleja a X60/Z5. Es una comprobación de punta ideal; no evalúa el cuerpo de una barra ni certifica su acceso físico.

## Archivos y verificación

- Contratos/evaluación: exercises.ts y diagnosticExercises.ts; mediciones en annularMeasures.ts.
- UI: GuidedPractice.tsx y AnnularReferences.tsx; LatheLab suministra solo el perfil actual.
- Catálogos: annular-exercises.json, annular-corrections.json y annular-diagnostics.json.
- Programas: boring.nc, rapid-through-wall.nc y rapid-through-bore.nc.
- Nuevas pruebas: annular_exercises.rs, annular_diagnostics.rs, annularMeasures.test.ts, annularExercises.test.ts, annularDiagnostics.test.ts y annular-guided.spec.ts; WASM real ampliado.

Verificación final:129 pruebas Rust,133 TypeScript,22 WASM real y64 E2E Chromium en raíz/64 bajo /cnc-edu correctos. Typecheck, ESLint, fmt, Clippy y builds correctos. Evidencia final en evidence/guided-annular-2026-10-22/. Los primeros logs de cuatro casos guiados corresponden al primer incremento; las suites finales incluyen también diagnóstico y comparación dinámica.

## Verificación matemática adicional

annular_contact_oracle.rs contrasta28.672trayectorias enteras con un oráculo independiente de semiplanos y puntos medios racionales exactos. Incluye tubo, sólido, paredes cónicas, espesor cero y ápice. Las28.506clasificaciones definidas coinciden;166casos se mantienen como incertidumbre numérica explícita, nunca aire confirmado por defecto. No usa la interpolación ni el clasificador de intervalos del motor. El test está acotado a coordenadas pequeñas y un solo tramo; no sustituye las pruebas existentes de hombros, límites, curvas o geometría física de herramienta.

## Siguiente punto de partida

No volver a implementar T5, material tubular, catálogo anular ni el rápido diagnóstico. El siguiente cambio geométrico puede ser refrentado tubular (ver NEXT_TUBULAR_FACING.md), pero requiere primero definir hasta dónde debe llegar la punta radial, qué frente se retira y cómo representar regiones de material vacío sin cerrar el agujero. Arcos interiores, ancho de ranurado, correctores y múltiples puestas siguen siendo incrementos separados con oráculos propios. El pulido visual de herramientas sigue aplazado por el usuario.
