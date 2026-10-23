# Ejemplos guiados

El catálogo base conserva seis ejemplos de observación: cilindrado, dos escalones, U/W, cono exterior, arco convexo y refrentado con cilindrado. No son un corrector universal de programas escritos por el alumno. Se carga código completo y se recorre para relacionar bloque, posiciones y perfil. El resultado esperado es visible.

La comprobación se aplica únicamente a la fuente del ejemplo original (normalizando solo CRLF/CR a LF) y al mismo setup físico. No normaliza comentarios, espacios, mayúsculas ni números; una modificación pasa a práctica libre, sin afirmar que sea incorrecta. La ejecución libre conserva los mismos diagnósticos de Rust.

El logro es derivado del resultado actual: revisión, cursor final, fin de programa, perfil completo actual, medidas esperadas con tolerancia absoluta 1e−9 mm, retirada final y husillo apagado. Editar, cambiar setup, retroceder o reinterpretar revoca la confirmación; no se guarda una insignia persistente. No se escribe otro parser en TS.

Al cargar se conserva una copia de fuente, setup válido usado para el visor, borrador completo (también inválido) e identidad del ejemplo. Recuperar intercambia documento y copia, permitiendo deshacer la recuperación. Un solo slot en memoria de esta pestaña; recargar pierde ese historial. Cargar el mismo ejemplo sin cambios no reemplaza la copia anterior.

Resultado: 25 pruebas Rust, 8 sobre WASM real, 40 TypeScript, typecheck, lint y clippy correctos. 19 E2E correctos en raíz y bajo /cnc-edu/. Los tres programas se ejecutan sin diagnósticos de perfil en cada prefijo; resultados finales y posiciones U/W se verifican también en Rust nativo. El cambio no modifica la semántica del núcleo.

## Cuarto ejemplo: cono exterior

Se sumó «Cono exterior» sobre `fixtures/lathe/taper-turning.nc` (8 bloques, Ø50 × 100 mm). Es el primer ejemplo cuya geometría esperada no es cilíndrica.

- `expectedSpans` pasó a aceptar dos formas: el tramo cilíndrico anterior (`zStartMm`, `zEndMm`, `radiusMm`) y un tramo lineal (`zStartMm`, `zEndMm`, `rStartMm`, `rEndMm`). El catálogo valida ambas con un `union` estricto; un ejemplo puede mezclar formas, aunque el cónico usa tramos lineales en todo su recorrido.
- La comparación se extrajo a `expectedSpansMatch`, que resuelve el radio único o los dos extremos según la forma y aplica la misma tolerancia absoluta a ambos. `assessExercise` la usa, así que los ejemplos cilíndricos conservan su comportamiento.
- La prueba nativa elige el camino según el catálogo: los tres ejemplos cilíndricos se comparan contra el perfil v1 (`profile_at`) y el cónico contra `profile_at_v2`. Sigue sin haber un intérprete en TypeScript.
- Resultado esperado del ejemplo: Ø50 entre Z−100 y Z−60, y cono de Ø20 en Z−60 a Ø40 en Z0. La tabla lo muestra como «20 → 40», que es justamente la lección: el radio crece hacia Z0.
- Una inversión del cono tiene el mismo volumen (el tronco de cono es simétrico), pero no la misma geometría. Hay un test que lo verifica: invertir `rStart`/`rEnd` da `mismatch`.

Las primeras pruebas de navegador fallaron por buscar el label textual que contenía un select con sus opciones; se corrigió el selector al rol y nombre accesible del combo. No fue un fallo del intérprete. La verificación manual confirmó el ejemplo U/W y el estado final «Recorrido completo · perfil confirmado».

La restauración del ejemplo corresponde al ejemplo en práctica, y su nombre de archivo aparece en el editor. Los casos E2E cubren la confirmación, su revocación al retroceder/editar, recuperación de borrador inválido, deshacer recuperación y preservar la copia al recargar un ejemplo sin cambios.

agy propuso contenido educativo que se adaptó al alcance idealizado (sin afirmar calidad de superficie ni seguridad). OpenCode/DeepSeek revisó el plan y ayudó a distinguir ejemplo de observación de autograder, explicitar normalización/tolerancia, estado derivado y copia recuperable. Los informes están en evidence/agy-exercises-content.log y evidence/opencode-exercises-review.log; la evidencia ejecutada está en exercises-*.log.

Verificación del cuarto ejemplo: 46 pruebas Rust (la nativa recorre los cuatro programas en todos los prefijos), 10 sobre WASM real, 69 TypeScript (dos nuevas: aceptación de tramos cónicos y confirmación del recorrido cónico) y 37 E2E en raíz y 37 bajo /cnc-edu/. El E2E nuevo carga «Cono exterior», recorre 8/8, exige «Recorrido completo · perfil confirmado», comprueba la fila «20 → 40» y el volumen 39000π, y revoca la confirmación al retroceder. QA visual manual en pestaña nueva: el selector muestra los cuatro ejemplos, el recorrido se confirma con «Ø50 entre Z−100 y Z−60; cono de Ø20 en Z−60 a Ø40 en Z0» y la consola queda sin errores.


## Arco y refrentado — ampliación del catálogo

Se agregan arc-convex.nc (9bloques, T0202) y facing-turning.nc (13bloques, T0404→T0101). Ambos parten de Ø50×100, terminan en X60 Z5 con husillo apagado y M30, y cada prefijo se prueba en Rust y WASM. Toda la comprobación del catálogo ahora usa v2, igual que la UI; se mantiene adicionalmente la regresión v1 de los tres ejemplos cilíndricos originales. No cambió la interpretación de códigos ni el motor de remoción.

El refrentado elimina Z−1..0, luego deja Ø40 entre−20/−1 y conserva Ø50 atrás. Su perfil se comprueba por tramos exactos y volumen57600πmm³ en las pruebas independientes. La comprobación también requiere la herramienta final T0101, no solamente la geometría.

El arco usa G03 X20 Z−10 I−10 K0 desde X40 Z0. Su radio ideal es r(Z)=10+√(100−Z²) en[−10,0]; stock R25 fuera del intervalo. Se comprueba mediante muestras geométricas y volumen analítico π(56250+5000/3+500π)=186885.37672095353mm³, con tolerancia de20mm³ para este ejemplo. Las tolerancias radiales por muestra están explícitas en el catálogo; no son una cota universal del aplanado. La UI muestra las cotas y tolerancias duplicadas en diámetro. El ejemplo se confirma como «referencias confirmadas», conservando el significado de recorrido guiado de código/configuración fijos. Muestras y volumen no constituyen un verificador universal de cualquier curva.

El catálogo exige exactamente uno de dos criterios: expectedSpans no vacío, o expectedProfile con3..64 muestras ordenadas dentro del stock y volumen. Los cuatro ejemplos anteriores conservan sus referencias. expectedFinalToolId es opcional para los antiguos y obligatorio en los dos nuevos por su contenido didáctico. Una revisión, cursor, fuente, setup, perfil parcial o estado final distintos impiden confirmar.

profileMeasures.ts mide un perfil ya resuelto: integra frustos y evalúa radios físicos, con mínimo de vecinos en hombros y rechazo de dominios inválidos. Es reutilizable y no interpreta G-code ni calcula remoción. La comprobación de referencias no depende del número de cuerdas. La prueba WASM invierte el arco manteniendo el volumen y exige mismatch, demostrando por qué se comprueban cotas locales además del volumen.

Verificación final: 82 pruebas Rust, 85 TypeScript y 17 sobre WASM real correctas; typecheck, ESLint, fmt y Clippy correctos. Build estático y 50 E2E Chromium correctos en raíz (28,9 s) y otros 50 bajo /cnc-edu/ (28,6 s). Export raíz restaurado y preview local 3100 actualizado. QA manual en pestaña nueva: arco 9/9 con T0202, siete cotas y volumen 186875,13075798462 mm³ dentro de ±20 mm³ de la referencia; refrentado 13/13 con T0101 final, tramos Ø50/Ø40/Ø0 y volumen 57600π mm³. Capturas en outputs/torno-ejemplo-arco-guiado.png y torno-ejemplo-refrentado-guiado.png. Evidencia en docs/evidence/guided-operations/. Sin ampliación del intérprete ni del modelo de remoción.


## Ampliación: diagnóstico y referencia corregida

El catálogo de pantalla compone siete recorridos positivos y dos prácticas de diagnóstico, sin alterar los seis casos originales. Ver DIAGNOSTIC_PRACTICES.md: la observación de un diagnóstico no se presenta como perfil confirmado.

Entrega cerrada: 84 pruebas Rust, 89 TypeScript y 18 WASM real correctas; fmt, Clippy, typecheck y ESLint correctos. Builds estáticos y 57 E2E Chromium raíz (35,7 s) y 57 bajo /cnc-edu/ (38,3 s) correctos, incluida persistencia de la práctica. Export raíz restaurado y preview 3100 actualizado. QA real en pestaña nueva: SPINDLE_OFF en línea 4, selección G01 Z-20 F120, perfil congelado tras 3 bloques; corrección recorrida 8/8 con perfil confirmado; G71 seleccionado y ejecución bloqueada. Evidencia docs/evidence/diagnostic-practices/, capturas outputs/torno-diagnostico-husillo.png y torno-diagnostico-codigo.png. Sin ampliación de códigos ni cambios a semántica Rust o ABI WASM. ZIPs de fuentes y preview renovados y comprobados al cerrar.
