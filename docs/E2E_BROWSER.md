# Pruebas de navegador — 20 de octubre de 2026

Se agregó Playwright 1.64.1 fijado en package.json y pnpm-lock.yaml. La suite usa Chromium headless sobre el export Next real y los assets WASM compilados; no reemplaza el motor por mocks. Solo se intercepta la descarga del binario en los casos que prueban fallos y concurrencia.

## Casos comprobados

1. Programa de 13 bloques: diámetros y tramos analíticos tras ambos cortes, posiciones X/Z, anterior, reinicio, husillo detenido y M30.
2. Editar invalida el resultado; una instrucción G71 bloquea ejecución con diagnóstico de línea.
3. Configuración inválida bloquea interpretación y una medida válida exige reinterpretar.
4. Corte diagonal conserva el perfil confiable y muestra la línea, sin impedir continuar la trayectoria.
5. Fallo al descargar WASM: error visible, stepping deshabilitado y recuperación al reintentar sin recargar la página.
6. Edición durante descarga retardada: resultado antiguo no habilita ejecución y el nuevo programa se interpreta correctamente.

Resultado local: 6/6 en raíz y 6/6 bajo `/cnc-edu/`. Typecheck, ESLint y las 23 pruebas TS también pasaron. Se compiló el export Next para cada ruta. Evidencia en `evidence/e2e-*.log`. El primer intento detectó un selector ambiguo entre el error de la app y el anunciador de rutas Next; se corrigió el selector de la prueba. No se necesitó modificar el motor ni el comportamiento de la interfaz.

## Repetir

Requiere Node/pnpm y WASM generado según README. Instalar Chromium una vez:

```sh
pnpm exec playwright install chromium
pnpm build
pnpm test:e2e
NEXT_PUBLIC_BASE_PATH=/cnc-edu pnpm build:web
NEXT_PUBLIC_BASE_PATH=/cnc-edu pnpm test:e2e
pnpm build:web
```

El último comando restaura el export raíz para la vista habitual. `pnpm test:e2e` arranca y detiene un servidor local propio en 127.0.0.1:3199; no reutiliza el servidor de la vista del usuario. `scripts/serve-export.mjs` es soporte de pruebas, no hosting de producción. Los errores guardan screenshot y trace en test-results/. No se usan sleeps fijos para sincronización.

El workflow local de GitHub Actions ahora incluye instalación de Chromium, ambos recorridos y artefactos de fallo. No se publicó ni se ejecutó CI remota. Firefox/WebKit, accesibilidad exhaustiva, rendimiento continuo y recuperación específica de errores del cálculo de perfil siguen fuera de esta cobertura.


## Ampliación: reproducción automática

La suite incorpora ahora cuatro casos de reproducción con reloj virtual (pausa/reanudación/fin, acciones manuales y edición, perfil parcial, cambio de velocidad y setup) y un caso adicional de descarga fallida del glue JS. Total actual: 11 casos. Las primeras seis pruebas y sus logs anteriores se preservan como evidencia histórica. Ver AUTOMATIC_PLAYBACK.md y evidence/autoplay-*.log para el estado de la entrega más reciente. El reintento del glue pasó con el cargador original en Chromium; la hipótesis contraria de la revisión externa no se reprodujo.


## Ampliación: vista 3D

Total actual: 16 E2E correctos en raíz y 16 en /cnc-edu/, con exports separados. Los cinco casos nuevos comprueban sincronía de la malla con el perfil real, rewind/reset y alternancias, perfil parcial/contexto perdido/reintento, fallo de descarga del módulo, cancelación durante carga y ausencia de WebGL (los recorridos se agrupan en cinco tests). Se usa SwiftShader explícitamente en el Chromium aislado de pruebas, no se cambian flags del navegador del usuario. Consultar REVOLUTION_3D.md y evidence/revolution-*.log. No es un profiler GPU ni cobertura multiplataforma.
