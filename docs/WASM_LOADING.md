# Carga del motor con límite temporal

Problema: initialize esperaba import/fetch sin límite; una red colgada podía dejar el estado «Preparando» indefinidamente y deshabilitar reintentar. Se limita la inicialización de assets a 20 segundos; no es un timeout de interpretación ni de seguridad CNC.

Política aislada en loader.ts: inicialización única compartida, resultado exitoso cacheado, fallo elimina solo el intento actual y permite otro. Cada intento tiene AbortController, deadline cancelable y número creciente. Un resultado/rechazo tardío del intento vencido no cambia la caché nueva.

engine.ts carga el glue con identificador de intento al reintentar, valida exports, descarga binario con fetch/AbortSignal y verifica HTTP. Usa el ArrayBuffer admitido por la API generada wasm-bindgen; los 229 KiB del binario se cargan enteros en vez de streaming para controlar el aborto. Se chequea la señal al terminar etapas. La importación dinámica de JS no se puede abortar con AbortSignal: si llega tarde se descarta antes de inicializar WASM. El nuevo intento usa otra URL de glue para no depender del estado pendiente de esa importación vieja.

Sin cambios a Rust o al contrato de interpretación/perfil. No hay bucles de reintento automático. El error visible permite volver a pulsar Interpretar.

Verificación final: 48 pruebas TS correctas, typecheck/lint y builds correctos; 26 E2E correctos en raíz y 26 en /cnc-edu/. Cuatro casos unitarios usan scheduler determinista sin sleeps; dos E2E demoran JS/binario con reloj virtual, verifican timeout, reintento y que el resultado viejo liberado después no cambie el cursor. Ver loader-*.log.
