# Atajos de ejecución

F8 avanza un bloque; Mayús+F8 retrocede. Ctrl+Enter o ⌘+Enter interpreta el programa. Se muestran bajo los controles y se exponen mediante `aria-keyshortcuts` y los títulos de botones.

F8 y Mayús+F8 se atienden dentro del laboratorio, también con foco en el editor. No insertan texto y no capturan variantes Ctrl/Alt/⌘+F8. Los eventos repetidos por mantener la tecla pulsada se ignoran: cada pulsación física permite un paso, una vez listo el perfil.

El handler usa `canStep` y la acción `step` existentes, exactamente como los botones. Sin interpretación válida o durante el cálculo del perfil, no avanza. Un paso manual pausa la reproducción automática. Los límites del cursor, estados antes/después y descarte de ticks anteriores siguen en playbackReducer. No hay código CNC ni geometría nueva.

Las pruebas de navegador comprueban interpretación desde el editor, avance T1→T2, retroceso a T1, conservación del texto, rechazo de ejecución de G71 no soportado, pausa de reproducción con reloj controlado y ausencia de repetición al mantener F8. El efecto es el mismo en 2D y 3D porque actúa sobre el estado compartido, no sobre la vista.

Entrega final de teclado y arranque: 85 TypeScript, typecheck y ESLint correctos; 55 E2E Chromium raíz (33,3 s) y 55 subruta /cnc-edu/ (34,4 s) correctos, incluida la carga JS demorada. Export raíz restaurado y preview 3100 publicado; HTML, JS y WASM responden 200 con MIME correctos. QA real: recargar, editar inmediatamente T1/T2/M30, interpretar con Ctrl+Enter y avanzar con F8 conserva el texto y llega a T1 en 1/3; avance posterior muestra T2 en 2/3. F8/Mayús+F8 también comprobados en navegador. Evidencia docs/evidence/shortcuts/. Rust/WASM no se modificaron respecto de las 82/17 pruebas previas. Captura outputs/torno-atajos-ejecucion.png. Fuentes y preview respaldados y ZIPs comprobados al cerrar.

## Edición durante el arranque

En QA se observó que un `fill` inmediatamente después de recargar, antes de la hidratación, podía quedar reemplazado por el documento inicial. El textarea exportado por el servidor ahora lleva `readOnly` y `aria-busy=true`. `useSyncExternalStore` habilita la edición cuando el cliente React está listo, sin estado global ni temporizador. Los comandos y atajos siguen usando la misma fuente controlada.

La regresión demora todos los JavaScript de Next, comprueba que el editor inicial no admite edición, libera la carga y exige que una fuente nueva sobreviva a Ctrl+Enter y F8. Esto cubre la pérdida observada en el arranque; no añade guardado automático ni cambia el almacenamiento local.
