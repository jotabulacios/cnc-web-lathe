# Archivos de programa G-code

Abrir programa G-code acepta texto UTF-8 de hasta 256 KiB. Las extensiones .nc, .tap, .gcode y .txt son sugerencias del selector, no una validación de semántica. Se decodifica con TextDecoder fatal, se retira el BOM UTF-8 inicial y se normalizan CR/CRLF a LF. Bytes inválidos y caracteres nulos se rechazan sin modificar el documento ni cursor actuales. Un programa vacío o con códigos no soportados puede abrirse: el motor Rust sigue siendo la autoridad al interpretar.

Abrir reemplaza solo el código, conserva setup y campos pendientes, y desvincula el ejemplo guiado. Pasa por la misma operación de documento que JSON: copia recuperable del documento anterior, revisión nueva y reproducción invalidada. No interpreta automáticamente. La lectura comparte el contador de solicitudes con JSON/guardado local, y comprueba la versión del documento antes de aplicar, por lo que una lectura tardía no pisa ediciones, cambios de pieza ni compilaciones posteriores.

Descargar programa .nc produce solo código UTF-8, con saltos LF. Permite guardar código incompleto o con diagnósticos; no certifica compatibilidad con un control real. El proyecto JSON v1 sigue siendo el formato para llevar también pieza, origen y campos pendientes. La importación es local, sin envío a servidor.

## Verificación

Tres pruebas puras: BOM/Unicode/saltos de línea y código sin reinterpretación; UTF-8 mal formado y nulos; frontera exacta de 256 KiB medida en bytes. Cuatro pruebas de navegador: apertura con configuración/copia recuperable, descarga y diagnóstico Rust, rechazo sin alterar ejecución y carreras entre archivos/ediciones/guardado local. Resultados: 55 pruebas TS, typecheck, lint y build correctos; 33 E2E en raíz y 33 en /cnc-edu/. Incluyen las regresiones existentes del WASM y del 3D. Ver program-files-*.log. Revisión visual manual del menú en Chromium, captura torno-archivos-gcode.png en outputs del chat. No cambió el código Rust ni el contrato WASM.
