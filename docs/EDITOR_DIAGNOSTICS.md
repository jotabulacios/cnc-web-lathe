# Ubicar diagnósticos en el editor

Los errores de compilación y avisos del perfil tienen un botón que lleva al tramo indicado por Rust. No se vuelve a interpretar el código en el frontend: se proyectan línea y columnas UTF16 (base1, final exclusivo) a índices JS del textarea.

Solo un click explícito mueve foco y selección. El seguimiento de ejecución conserva el comportamiento anterior: desplaza la vista sin mover caret. La petición de foco incluye sourceRevision; editar/cargar descarta foco y resaltado antiguos. Se sincronizan desplazamientos del input, resaltado y números de línea. Los errores se destacan en rojo y los avisos en ámbar.

Durante el análisis se detectó que el textarea normaliza CRLF/CR a LF, mientras que una fuente importada podía conservar CR puro y enviarlo a Rust como whitespace del mismo bloque. Se normaliza a LF al entrar al documento del editor, para que lo visible y lo interpretado tengan las mismas líneas. El codec JSON conserva el string leído; la normalización ocurre al aplicarlo al editor. Las copias de documento se comparan con esa misma normalización para no pisar una copia recuperable por un cambio exclusivo de saltos de línea.

Verificación: 52 pruebas TS, typecheck/lint/build y 29 E2E tanto en raíz como en /cnc-edu/ correctos. Los cuatro tests puros cubren UTF16, CRLF, caret vacío/EOF, spans inválidos sin clamping, surrogate pairs y normalización/copia. Los tres E2E nuevos cubren importación con CR puro, diagnóstico después de emoji/CRLF y foco descartado al editar, y desplazamiento de línea250 con sincronía de las tres capas. Un caso existente de perfil parcial comprueba ahora navegación de aviso ámbar.

agy revisó el plan y sugirió casos de caret puntual, revisión obsoleta y no navegar automáticamente. Se incorporaron. Su recomendación de clamping no se adoptó: un span fuera de rango o que divide un par sustituto se ignora, para no seleccionar un token diferente. El editor normaliza tanto carga como onChange; no hay una segunda gramática CNC.

QA visual manual en Chromium: el botón del diagnóstico de G71 después de un emoji selecciona exactamente G71 y resalta su línea sin cambiar la fuente. Captura en outputs/torno-diagnostico-editor.png del chat. Evidencia en editor-*.log.
