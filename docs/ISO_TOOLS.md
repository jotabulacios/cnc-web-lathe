# Herramientas desde designaciones ISO (nominales) — 22/10/2026

Opción A de TOOL_DATA_SOURCES.md, elegida por el usuario. No se usan ni redistribuyen datos de ningún fabricante.

## Módulo puro (`src/lib/lathe/isoDesignation.ts`)

Escrito por un agente y revisado.
- `parseInsertDesignation`, para ISO 1832. Formas C, D, E, M, V, S, T, W; incidencias A–G, N, P; espesores 01–09 y T1–T3; radio en décimas de mm.
- `parseHolderDesignation`, para ISO 5608. Sujeción C/M/P/S/D; estilos con κr: A90, B75, D45, E60, F90, G90, J93, K75, L95, N63, R75, S45, T60, U93, V72.5, Y85; mano; mango h×b; largo por letra.
- `checkCompatibility` e `isoAssembly`.
- Los resultados son `{ok, value|error}` con mensajes en español. Nunca lanza excepciones.
- **Lado del filo:** desde el IC, cada lado tangente al círculo inscripto vale (IC/2)·(cot α/2 + cot β/2). El IC se obtiene de la serie estándar en pulgadas, verificando que el código de tamaño reproduzca el lado. Por ejemplo, CNMG 120408 da 80°, IC 12,7, e 4,76, rε 0,8 y lado 12,896.
- **Geometría del porta:** alto h en dirección tangencial, ancho b en axial, largo radial desde la esquina. Largo de cabeza (2,5·IC) y offset f (1,25·b) son parámetros didácticos explícitos, porque ISO no los fija. Solo se arman portas exteriores de mano derecha para cilindrado.

## Integración

- **Pestaña Herramientas → «Herramientas ISO (nominales)»:** inserto + porta para T0, T1 y T2, con validación en vivo y mensajes de compatibilidad.
- Si la designación es válida, `resolveAssemblies` reemplaza el conjunto educativo de esa estación en el plano 2D (incluido el encuadre), la escena 3D, la biblioteca, el inspector y su preview. El texto de procedencia indica «Nominal ISO, no datos de fabricante».
- **Solo visual:** se guarda en el proyecto, dentro de `draft.isoTools`, pero no va a Rust ni invalida la ejecución.
- **«Usar rε … en correctores»** copia el radio de punta del inserto a la tabla de correctores. Ese sí es un cambio de setup: altera el corte e invalida la ejecución.

## Verificación

- 8 pruebas del módulo con oráculos calculados a mano (ángulos, IC, lado, κr medido en el polígono, mango, compatibilidad, errores).
- 2 pruebas de integración: reemplazo por estación, filas vacías e inválidas, encuadre 2D, y proyecto que guarda las designaciones fuera del setup.
- E2E iso-tools.spec.ts:
  - una designación inválida muestra error;
  - una válida cambia las cotas del cuerpo en 3D sin invalidar la ejecución;
  - el inspector muestra procedencia ISO;
  - copiar rε lleva 0,8 a los correctores e invalida la ejecución;
  - las designaciones sobreviven a guardar y reabrir.
- Total: 168 Rust, 158 TS, 27 WASM y 79 E2E en raíz y 79 bajo /cnc-edu/. Capturas en evidence/iso-tools-2026-10-22/.

## Límites

Sin portas de mano izquierda, de refrentado, de ranurado ni barras de mandrinar (ISO 6261), ni insertos redondos. El largo de cabeza y el offset f son didácticos. La forma de la nariz no se dibuja.
