# Proyectos locales

Se guarda el documento de trabajo, no el resultado de simulación. Formato JSON estricto `cnc-web-lathe-project`, version 1, dialecto edu-lathe-v1: fuente, último setup válido, borrador de campos e identidad opcional del ejemplo. No incluye cursor, perfiles/mallas, resultados o logros. Se requiere reinterpretar al abrir.

Los botones de guardado/recuperación en navegador son explícitos: no hay autosave que reemplace el trabajo al abrir la app. Clave aislada y versionada; errores de cuota o bloqueo se comunican sin borrar el documento. Se ofrece descarga JSON y apertura de archivo local, sin backend ni envío de código a un servidor.

El archivo se limita a 2 MiB antes de leer y la fuente a 256 KiB UTF-8. La validación exige formato/dialecto/version, números finitos y setup editable coherente con el borrador si este es válido. Un borrador inválido puede conservarse y mantiene bloqueada la interpretación. Nunca se ejecuta el contenido importado automáticamente. Las lecturas asíncronas se descartan si hubo una edición/carga posterior.

Se reutiliza el mecanismo de copia recuperable: abrir conserva el documento actual y recuperar intercambia ambos. Las funciones de documento se separan de los ejemplos para compartirlas con almacenamiento, sin dependencias de React o Three.

Pruebas previstas: roundtrip, Unicode/bytes y límites, versiones/campos desconocidos, setup inconsistente, borrador inválido, storage bloqueado/cuota, persistencia tras reload, import inválido sin sobrescribir, lectura obsoleta, descarga/apertura y ausencia de ejecución automática.


## Esquema y comportamiento implementados

Clave: cnc-web-lathe.project.v1. El objeto raíz solo admite format/version/dialect/document; el documento solo source/setup/draft/exerciseId. El setup usa el esquema compartido de contract.ts y el draft conserva sus cuatro strings. Los campos del draft admiten hasta 1024 caracteres; el id de ejemplo es null o identificador de hasta 64 caracteres. El setup válido se compara físicamente con el draft cuando este valida; si no valida, se conserva el último setup válido y el formulario abierto muestra sus errores.

El guardado local pertenece al origen del navegador (esquema/host/puerto), no viaja automáticamente a otra dirección/equipo. Para trasladar el trabajo se usa el archivo JSON. No se limpia un guardado corrupto ni se borra el anterior ante un fallo de escritura. No hay migración automática de versiones desconocidas. La lectura falla de forma visible y conserva el documento actual.

La comprobación de bytes usa TextEncoder, no longitud UTF-16 ni z.string.max como sustituto de bytes. Se validan datos antes de escribir. Los errores de formato se distinguen de errores de almacenamiento para no sugerir descargar un documento que excede los límites del formato.

La apertura es explícita y conserva copia recuperable. La fuente no se compila al importarla; no hay perfil/cursor/logros persistidos. Los imports de archivo tienen id de solicitud y contador de documento; una edición, configuración, carga o compilación posterior invalida la lectura en vuelo. El guardado y descarga no cambian el documento ni el cursor.

## Verificación

Verificación final: 44 pruebas TS, typecheck/lint y builds correctos; 24 E2E correctos en raíz y 24 bajo /cnc-edu/. Los cuatro tests de codec cubren roundtrip/aliasing, campos/versiones/dialecto/configuración, límites UTF8/JSON y storage aislado con fallo de escritura. Los cinco E2E nuevos prueban persistencia tras reload con setup, descarga/apertura/recuperación, archivo roto y sobredimensionado conservando cursor, cuota y descarga alternativa, e importación demorada tras edición. Ver projects-*.log para el resultado final en raíz/subruta.

agy revisó el plan sin herramientas. Se adoptaron esquema estricto, límites y contador de edición; se corrigieron dos puntos de su propuesta: los límites de UTF8 se miden en bytes, y la descarga alternativa se ofrece mediante botón, sin iniciar descargas automáticas por un error. La revisión de código con OpenCode/DeepSeek agotó 120 segundos sin informe; no se cuenta como revisión completada.


## Compatibilidad de la herramienta inicial

El borrador JSON v1 admite toolId del catálogo, además de los cuatro campos numéricos. Al cargar un proyecto anterior sin draft.toolId se hereda setup.toolId y se guarda posteriormente de forma explícita; no se cambia la versión ni se relaja el esquema estricto. Un identificador desconocido o una herramienta contradictoria se rechaza incluso si hay números pendientes de corregir. Se conservan los borradores numéricos inválidos y la última configuración válida como antes.
