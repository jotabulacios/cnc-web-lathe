# Vista dividida 2D + 3D — 22/10/2026

El selector de vista tiene una tercera opción, «Dividida». Muestra el plano técnico 2D y la pieza 3D al mismo tiempo, como la vista dividida del simulador de referencia (REFERENCE_LATHE_SIM.md). Es solo presentación: no toca Rust, WASM, contratos, borradores ni proyectos.

## Comportamiento

- **Distribución:** lado a lado cuando el visor es ancho. Se apila (2D arriba, 3D abajo) si la ventana mide ≤ 900 px o si el visor queda en ≤ 640 px (container query `stage`, para la grilla de 1050–1200 px con el panel lateral).
- **Sincronía:** las dos vistas reciben las mismas props que en modo simple: cursor, punta resuelta, perfil, herramienta, conjuntos ISO y animación del bloque. Avanzar, retroceder, reproducir o animar actualiza las dos.
- **Trayectoria:** el botón «Trayectoria» sigue visible en Dividida y afecta solo al plano 2D. Se oculta solo en «Pieza 3D».
- **Un solo contexto WebGL:** el 2D y el 3D ocupan posiciones fijas dentro de `.stage-view`, sin envoltorios que cambien. Así, pasar de Pieza 3D a Dividida (o al revés) mantiene el mismo lienzo, la cámara, la proyección y la sección. Lo mismo vale para el plano 2D y su estado «Ampliar plano 2D». Al pasar a «Vista 2D» el 3D se desmonta y libera su contexto, igual que antes.
- **Tamaño del lienzo:** `threeScene.ts` ya observa su contenedor con `ResizeObserver` (además de `resize` de la ventana). Por eso el lienzo se ajusta al cambiar de modo o al apilarse, sin código nuevo.
- **Bloqueo y errores 3D:** el estado `blocked` («Esperando un perfil válido…») y el aviso de error afectan solo al panel 3D. El 2D sigue operativo al lado. «Volver a 2D» desde el error pasa a «Vista 2D»: deja de mostrar el panel 3D que falló, y reintentar sigue disponible con «Reintentar vista 3D».
- **Persistencia:** el modo de vista no se guarda en borradores ni proyectos (nunca se guardó). Al recargar, la página arranca en «Vista 2D».
- **Accesibilidad:** el selector sigue siendo un `role=group` «Tipo de vista» con `aria-pressed` en cada botón. «Dividida» tiene un `title` explicativo. Cada panel conserva sus etiquetas (`img` del plano con título y descripción, «Vista 3D del material», «Pieza de torno en 3D»).

## Pruebas

`tests/e2e/split-view.spec.ts`:

- Dividida muestra el plano y el lienzo lado a lado. Al avanzar se actualizan el perfil 3D y el plano 2D (movimientos ejecutados y marcador). El toggle de trayectoria funciona, y la vuelta a 2D y a 3D funciona.
- De 3D a Dividida se conservan el mismo elemento canvas y la cámara ortográfica.
- Con 820 px de ancho el 3D queda debajo del 2D, con el mismo ancho.

Con `SPLIT_VIEW_SCREENSHOTS=1` se guardan `test-results/split-view-wide.png` y `test-results/split-view-narrow.png`.

## Límites

- En el modo lado a lado, los controles 3D superpuestos ocupan dos o tres filas sobre el lienzo, porque el panel es angosto.
- No hay divisor arrastrable ni proporción configurable: las dos columnas miden lo mismo.
