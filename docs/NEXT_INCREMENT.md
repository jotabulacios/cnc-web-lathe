# Próximo incremento: aprender a diagnosticar

Estado: plan histórico ahora implementado; ver DIAGNOSTIC_PRACTICES.md y HANDOFF.md para la entrega y sus verificaciones. La entrega actual deja seis recorridos guiados correctos, herramientas visibles y atajos de ejecución. Leer HANDOFF.md antes de actuar. No ampliar el dialecto ni empezar ciclos/compensación para este incremento.

## Objetivo y dos casos

1. **Corte sin husillo**: programa interpretable que intenta cilindrar Ø40 desde Z0 a Z−20 sin S/M03. El perfil v2 debe detenerse con `SPINDLE_OFF` y conservar el último prefijo confiable. La trayectoria interpretada puede continuar: no confundir esa capacidad con material confirmado. Mostrar cómo localizar el bloque y corregir el estado modal.
2. **Código no soportado**: programa con G71. La compilación devuelve `UNSUPPORTED_CODE`, bloquea reproducción y permite navegar al error. Explicar que el dialecto educativo no implementa el ciclo, aunque un control real pueda soportarlo; no indicar que agregar S o cambiar de herramienta resuelve un código no soportado.

Los códigos se verificaron en las regresiones existentes de crates/cnc-core/tests/interpreter.rs y profile_v2.rs. Las fuentes completas, spans, prefijos y resultados corregidos deberán obtenerse del motor al crear fixtures: este plan no los declara probados.

## Modelo recomendado

Mantener separadas la referencia de un perfil correcto y la expectativa de un diagnóstico. El criterio actual `expectedProfile`/`expectedSpans` no debe convertirse en éxito ante cualquier error. Introducir una variante discriminada de práctica de diagnóstico con etapa (`compile` o `profile`), código, span de origen y, en la etapa de perfil, último bloque evaluado. Su resultado debe decir «Diagnóstico observado», nunca «perfil confirmado».

Compartir carga, recuperación de documento, setup, revisión y navegación al editor. Comparar exclusivamente la respuesta Rust actual de la misma revisión; no buscar cadenas en el texto fuente para decidir qué error debería ocurrir. Conservar las seis prácticas existentes y sus pruebas positivas. Los tests de catálogo deberán distinguir explícitamente prácticas ejecutables y diagnósticas, sin relajar los primeros.

Al editar el programa, retirar la comprobación del caso original como ya ocurre en práctica libre. Ofrecer una corrección de referencia solo si se conserva una copia recuperable del documento anterior; su verificación geométrica debe ser un caso positivo separado. No autoeditar el programa al pulsar un enlace de diagnóstico.

## Secuencia de implementación

1. Crear dos fixtures pequeños con expectativas obtenidas de compile/stock_profile_v2 en Rust nativo y WASM. Añadir el caso corregido con su perfil analítico, herramienta final y husillo apagado explícito.
2. Añadir esquema discriminado y evaluación de diagnóstico como lectura de contratos, conservando compatibilidad con el catálogo positivo actual. Probar revisión obsoleta, código distinto, error en otro bloque y perfil parcial no esperado.
3. Integrar guía, enlace al bloque y estado didáctico distinto. Cargar una práctica debe conservar programa/configuración anteriores y usar la misma invalidación del documento.
4. Verificar navegación UTF16 y desplazamiento real del editor, paso y atajos en el caso de perfil; reproducción y atajos bloqueados en error de compilación. Cambiar fuente/setup o retroceder antes del error revoca la confirmación.
5. Ejecutar gates, build raíz/subruta, WASM real y E2E. QA en pestaña nueva. Restaurar export raíz, publicar solo preview local, renovar docs, evidencia y ZIPs.

## Pruebas que no se deben omitir

- El caso SPINDLE_OFF conserva exactamente el volumen anterior al corte y no marca completo el material posterior.
- Un programa no soportado no se puede ejecutar con botón, F8 o reproducción.
- No se acepta otro diagnóstico ni uno perteneciente a una revisión anterior.
- La corrección produce la geometría esperada, no solamente ausencia de errores.
- Se puede recuperar el programa anterior y persisten las herramientas iniciales.
- Permanecen válidos los seis recorridos anteriores, el catálogo visual T0–T4, el paso hacia atrás y la vista 3D.

No añadir backend, parser TypeScript, controlador industrial completo ni promesas de validación para máquina real.
