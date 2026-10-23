# Prácticas de diagnóstico

## Resultado educativo

El catálogo incorpora dos prácticas con diagnóstico intencional y una referencia de cilindrado corregida. Hay nueve opciones: los seis recorridos anteriores, la nueva referencia positiva y dos diagnósticos. Se preservan los seis casos positivos originales y sus expectativas; no se relajaron sus pruebas para aceptar errores.

«Diagnóstico observado» confirma únicamente que el motor devolvió el código, severidad y span previstos para ese documento y configuración. No significa perfil correcto, mecanizado válido ni aprobación de programas libres. Editar código o setup vuelve a práctica libre. Una revisión obsoleta no confirma nada.

| Práctica | Contrato observado | Comportamiento |
|---|---|---|
| Corte sin husillo | perfil v2, SPINDLE_OFF, warning, línea 4 columnas 1–14 | Al pedir bloque 4 conserva el prefijo de 3 bloques y todo el cilindro Ø50 × 100 |
| Código no soportado | compile, UNSUPPORTED_CODE, error, línea 3 columnas 1–4 | G71 bloquea ejecución; no hay movimientos ni estado final |
| Referencia con husillo | perfil completo de 8 bloques | Ø50 en −100/−20, Ø40 en −20/0; volumen restante 58000π mm³; final T0101, husillo apagado |

Las columnas son spans UTF16 con fin exclusivo, como el contrato del editor. Los valores se obtuvieron del WASM real y se contrastaron con pruebas nativas. El volumen congelado es 62500π mm³. En la práctica de husillo, avanzar más allá del bloque 4 conserva el material confiable, pero deja de confirmar la observación: la guía pide retroceder a ese bloque. Retroceder antes también retira la confirmación.

## Datos y arquitectura

Los seis ejemplos previos siguen en exercises.json. diagnostic-exercises.json contiene las dos prácticas, con una expectativa discriminada por `stage: compile | profile`. diagnostic-corrections.json define una referencia positiva adicional. `Practice` es la unión de Exercise y DiagnosticExercise; los tipos y la evaluación positiva anteriores se conservan. La composición estática comprueba identificadores únicos y que correctionId apunte a una referencia positiva existente.

`diagnosticExercises.ts` valida metadatos y compara respuestas Rust; no interpreta G-code. Para perfil exige misma revisión y cursor, perfil v2 incompleto, prefijo evaluado exacto, un único diagnóstico con severidad/span correctos y tramos congelados coincidentes. Un error distinto, otro span, material distinto o fallo de transporte no confirma el caso. Las expectativas admitidas se limitan a los dos casos de esta entrega; ampliarlas requiere fixtures y pruebas nuevas.

La carga usa el mecanismo de documento existente: guarda una copia recuperable del programa/configuración anteriores e invalida la ejecución. La referencia es una carga explícita, no una edición automática del código. Para G71 se ofrece «Cilindrado exterior» con G00/G01; no se pretende traducir el ciclo arbitrario.

La navegación toma el span del diagnóstico actual de Rust, comprobado contra la referencia, y usa EditorFocusRequest. Los atajos y botones conservan las mismas reglas: G71 no ejecuta; el caso de perfil permite observar la trayectoria, con advertencia y material congelado.

No cambia la semántica del núcleo ni la ABI WASM. Las únicas modificaciones Rust son pruebas nativas. Las capturas diagnostic-reference-results.json se usan como datos de evaluación TS, no como único oráculo geométrico: Rust y WASM comprueban además prefijos, spans y volumen analítico independiente.

## Verificación

- Nativo: ambos diagnósticos con procedencia exacta; todos los prefijos de husillo sin remoción; referencia corregida con geometría y volumen analíticos.
- WASM real: ambas etapas, todos los prefijos y observación solamente en el cursor objetivo; referencia corregida completa.
- TypeScript: esquema estricto, enlaces de corrección, diagnóstico/severidad/span incorrectos, revisión obsoleta, cambio de documento, retroceso y material congelado distinto.
- Navegador: navegación y selección de texto reales, F8 bloqueado en G71, paso/retroceso en perfil, carga/recuperación de referencia y guardado/reapertura de práctica.

Estado de cierre y logs: HANDOFF.md y evidence/diagnostic-practices/. La apariencia de las herramientas queda expresamente aplazada por el usuario.

Entrega cerrada: 84 pruebas Rust, 89 TypeScript y 18 WASM real correctas; fmt, Clippy, typecheck y ESLint correctos. Builds estáticos y 57 E2E Chromium raíz (35,7 s) y 57 bajo /cnc-edu/ (38,3 s) correctos, incluida persistencia de la práctica. Export raíz restaurado y preview 3100 actualizado. QA real en pestaña nueva: SPINDLE_OFF en línea 4, selección G01 Z-20 F120, perfil congelado tras 3 bloques; corrección recorrida 8/8 con perfil confirmado; G71 seleccionado y ejecución bloqueada. Evidencia docs/evidence/diagnostic-practices/, capturas outputs/torno-diagnostico-husillo.png y torno-diagnostico-codigo.png. Sin ampliación de códigos ni cambios a semántica Rust o ABI WASM. ZIPs de fuentes y preview renovados y comprobados al cerrar.
