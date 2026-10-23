# Correcciones posteriores a la revisión — 20/10/2026

La revisión independiente REVIEW_2026-10-20.md conserva el estado defectuoso observado; sus fallos no deben confundirse con el estado posterior a esta reparación.

## Correcciones implementadas

1. Persistencia: schema draft JSON admite toolId del catálogo, normaliza archivos anteriores heredando setup.toolId y exige coherencia de herramientas incluso con campos numéricos inválidos. Se mantiene formato v1 y strict, sin perder borradores ni claves de terceros.
2. Gates: se eliminaron any e import sin uso; un identificador de herramienta inicial inválido genera error de setup en lugar de cambiarla silenciosamente a genérica.
3. Refrentado: max_radius_in solo considera solapamientos axiales de longitud positiva; caras de contacto y repetidas no exigen husillo. Una nueva pasada más profunda sí lo exige. La prueba retira radialmente la herramienta antes de trasladarla en Z, evitando introducir una penetración rápida en el repro.
4. T: scanner preserva numeric_width. Se admiten1/2/4dígitos sin signos; cuatro cifras siempre significan estación/corrector. Los casos T0001/T0004 y anchos3/5 ahora diagnostican, sin afectar alias válidos.
5. Extremos de arco: arc_min_radius usa radios interpretados exactos y solo mínimos estrictamente interiores. Se corrige la divergencia nativo/WASM a X0 y se conservan los rechazos de cruces verdaderos de hasta1e-12mm.
6. Contacto de arco: se clasifica analíticamente la curva real contra tramos de stock antes de aplanar. Se evalúan extremos del intervalo solapado y puntos estacionarios de la diferencia curva–recta. Carga GeometryBudget; cerca del redondeo devuelve ambigüedad, sin declarar aire ni dar permiso de corte. Husillo y dirección se comprueban sobre la remoción real. Si ninguna cuerda representa el corte detectado, PROFILE_NUMERICAL_AMBIGUITY congela todo el bloque. También se evita el falso corte inverso: arco real en aire aunque su cuerda atraviese material.
7. Precisión documentada: se retira la supuesta garantía radial≈3δ/volumen universal<1e-4 y el umbral numérico de radio incorrecto. Solo se garantiza la sagita perpendicular de la aproximación; los volúmenes se presentan como mediciones de fixtures.

## Evidencia de la reparación

- Rust:82 pruebas correctas, incluyendo9 nuevas de contacto arco,2 de extremos y1 de refrentado. Se amplió la tabla de casos T y los asserts del helper de cara.
- TypeScript:79 pruebas correctas, typecheck y ESLint correctos; incluye roundtrip de las5herramientas, migración legacy y rechazo de contradicciones.
- WASM reconstruido:16 pruebas correctas, con los mismos repros que en nativo.
- Build raíz correcto y47 E2E Chromium correctos (25.8s).
- Los47casos también pasaron bajo /cnc-edu/. Se agregó después el selector inicial de herramienta con un E2E adicional; 48 E2E finales correctos en raíz (25.8s) y subruta (25.4s). Raíz restaurada; snapshot3100 actualizado con HTTP/MIME correctos; QA visual del selector y cilindrado en2D/3D completada. Capturas y qa-final.log disponibles. ZIPs renovados y comprobados. Los logs definitivos se guardan en docs/evidence/fixes-2026/.

## Plan siguiente

Selector de herramienta inicial implementado en Pieza y origen. Es una opción de setup ya soportada y persistida; cambiarla debe invalidar ejecución, reflejar la herramienta en ambas vistas y permitir que T la reemplace por programa. No incluye offsets, desahogo ni nueva física de corte. Después conviene ampliar ejercicios guiados de arcos/refrentado antes de abordar ciclos o compensación.


La prueba adicional sobre repetición de arcos elevó el total nativo a82; no cambió el límite de recursos. El mensaje de ambigüedad ahora refiere a la precisión del modelo, cubriendo redondeo y representación insuficiente. Se registró la limitación de repetición de ciertos arcos, en lugar de ocultar remoción residual. La entrega está cerrada.
