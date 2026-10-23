# Estado de situación — 22 de octubre de 2026

**Continuación más reciente:** refrentado tubular y conjuntos dimensionales educativos implementados; ver [log vigente](WORK_LOG.md) y [herramientas actuales](TOOL_ASSEMBLIES.md). El balance siguiente conserva la situación de la revisión original. Base matemática de referencias probada en Rust (TOOL_REFERENCES.md); correctores CNC todavía sin integrar. Ver el log para142 Rust,137 TS,23 WASM y68 E2E raíz/subruta de la continuación final.

## Continuación posterior

El refrentado tubular ya se integró junto con una práctica evaluada (catálogo total 13). Ver [alcance actualizado](TUBULAR_FACING.md) y [log de trabajo](WORK_LOG.md). El balance y las cifras de la revisión original siguientes se conservan como referencia del momento de esa auditoría.

## Dictamen

El escenario MVP de PROJECT.md está implementado y se amplió con arcos, perfiles mecanizados, vista 3D, persistencia y prácticas guiadas. La arquitectura objetivo se cumple: Next.js/React, Three.js y un motor Rust independiente compilado a WebAssembly, sin backend obligatorio. Esto no equivale a haber terminado una plataforma completa de torno ni a validar programas para máquinas reales.

La primera entrega fue auditoría y planificación; la implementación posterior siguió las indicaciones del usuario de continuar. Conviene ahora consolidar una base revisable antes de seguir acumulando funciones.

## Cumplimiento del pedido

| Pedido | Estado comprobado | Límites |
|---|---|---|
| Auditar parser, simulación, editor y estado del original | Documentado en CODE_AUDIT.md, ARCHITECTURE.md e IMPLEMENTATION_PLAN.md | Auditoría del SHA registrado; no seguimiento continuo del upstream |
| Separar torno de fresadora | Proyecto independiente y modelo explícito X/Z | No se conserva compatibilidad funcional con toda la fresadora |
| Motor Rust independiente | cnc-core puro y cnc-wasm; frontend consume resultados estructurados | Contratos versionados requieren mantener pruebas de compatibilidad |
| G00/G01 en X/Z y pasos | Implementado; avance, retroceso, reset, reproducción y línea activa | Dialecto educativo documentado, X en diámetro, geometría interna radial |
| Trayectorias 2D | SVG con material, trayectoria, posición y símbolo de herramienta | Herramientas ideales; apariencia y dimensiones físicas limitadas |
| Visualización 3D | Three.js, superficie de revolución con hueco y tapas | No remoción volumétrica general ni colisiones del portaherramientas |
| Pruebas y documentación incremental | Rust, TypeScript, WASM real y E2E; fixtures y evidencia | CI remoto pendiente y cobertura de navegador principalmente Chromium |
| Preparar ciclos, correctores, catálogos y CAM | Separación de capas permite ampliaciones | Esas funciones todavía no están implementadas |

## Funciones actuales

- Editor adaptado, diagnósticos con ubicación, resaltado y navegación por bloque.
- Setup editable: diámetros exterior/interior, longitud, posición inicial y herramienta.
- G00/G01/G02/G03, X/Z y U/W; estado de avance, husillo, herramientas y fin de programa. G02/G03 tienen restricciones documentadas; no se admite todo el lenguaje de un control comercial.
- Sólidos: cilindrado, conos, hombros, refrentado ideal hasta X0 y ciertos arcos exteriores.
- Tubos con agujero previo: mandrinado T5 y mecanizado exterior longitudinal G00/G01. El perfil anular v3 no admite todavía refrentado tubular ni arcos; activar T5 o material tubular selecciona ese modelo para el programa completo.
- Detección educativa de rápidos que atraviesan material, exigencia de husillo para remover y conservación del último perfil válido ante errores.
- Importación/exportación de programas y proyectos JSON, guardado local manual y recuperación del documento previo.
- Doce prácticas: nueve recorridos positivos y tres diagnósticos intencionales. Las anulares comparan cotas interiores/exteriores, volumen y estado final; completar geometría no basta para declarar terminado un programa.

## Reutilización real del repositorio original

Sí hubo reutilización, pero en cantidad de código es acotada. El componente extraído y registrado es `src/components/GCodeEditor.tsx`, adaptado desde `rudra496/cnc`, commit `b59fefb5043ce53ddd3adf34079398838a69729d`. Se sustituyó su acoplamiento a Zustand por props y se añadieron accesibilidad, coordenadas U/W, seguimiento de línea y diagnósticos Rust.

El parser Rust, estado modal, contratos WASM, reproducción, geometría de torno, renderers y evaluación educativa son implementaciones nuevas. No se reutilizaron el parser de fresado, su remoción por heightmap ni su store global. Three.js y OrbitControls son dependencias compartidas, no una copia de la escena original. La licencia MIT y atribución están preservadas en THIRD_PARTY_NOTICES.md y licenses/.

La selección tiene sentido técnico: trasladar la semántica de fresadora habría introducido errores en torno y dependencia del motor JavaScript. No afirmamos haber agotado todo componente potencialmente útil: antes de catálogos o CAM conviene una revisión puntual de UI reutilizable, verificando acoplamiento, licencia y ahorro real.

La copia de referencia no tiene cambios funcionales registrados; su estado muestra solamente dos archivos pnpm sin seguimiento, generados por la auditoría. El proyecto nuevo tiene Git inicializado pero aún no tiene commits ni remoto: los archivos están sin seguimiento. Los ZIP sirven como respaldo, pero falta consolidar historial de cambios revisable.

## Calidad: evidencia y pendientes

Última validación registrada en `evidence/guided-annular-2026-10-22/`: 129 pruebas Rust, 133 TypeScript y 22 de WASM real; fmt, Clippy con advertencias como errores, typecheck y ESLint correctos. También export estático y 64 E2E Chromium en raíz más 64 bajo `/cnc-edu/`. Son resultados de la entrega anterior, no una nueva ejecución durante este informe documental.

Una referencia exacta adicional contrastó 28.672 trayectorias anulares: 28.506 clasificaciones definidas coincidentes y 166 incertidumbres explícitas. Su dominio acotado no prueba toda geometría posible. El motor mantiene límites de recursos y puede detener casos numéricos ambiguos.

Pendientes de consolidación: commits locales con hitos claros, CI ejecutado en un remoto cuando se autorice, revisión en otros navegadores y pantallas, y prueba pedagógica con usuarios. No hay publicación pública, piloto docente ni certificación industrial. La documentación acumuló entradas históricas contradictorias; este informe es la síntesis actual y HANDOFF.md conserva el detalle técnico de continuidad.

## Orden recomendado

1. **Cerrar una base MVP revisable.** Consolidar historial local, mantener una entrada documental vigente y recorrer con un usuario tres casos: cilindrado exterior, mandrinado y diagnóstico de rápido. Registrar dificultades antes de ampliar alcance. No hace falta reescribir la arquitectura.
2. **Refrentado tubular como próximo incremento funcional.** Completa la secuencia frente → mandrinado → exterior. Seguir NEXT_TUBULAR_FACING.md, que es una propuesta todavía sin implementar. Primero resolver intervalos de material vacío; después geometría, integración Rust/WASM, retroceso y vistas, y finalmente una práctica evaluada.
3. **Herramientas y correctores con datos explícitos.** Mejorar legibilidad mínima de T1…T5 y definir dimensiones/orientación, referencia de punta y offsets antes de compensación de radio. La apariencia fue aplazada por el usuario; no confundir símbolos actuales con herramientas físicas.
4. **Ciclos y programación asistida después.** Elegir un dialecto/control concreto y añadir un ciclo acotado con fixtures independientes. Catálogos y CAM vendrán sobre esos contratos; no conviene incorporarlos junto con la siguiente operación geométrica.

Criterio de cierre del refrentado tubular: referencia analítica de volumen, agujero conservado, posteriores cortes sobre frente vacío correctos, rápidos sin remoción, rollback por error, avance/retroceso consistente, compatibilidad de contratos anteriores y verificación WASM/UI en raíz y subruta. Los detalles y oráculos están en el diseño existente.

## Aclaración posterior sobre herramientas

La revisión del renderer confirmó formas y medidas ilustrativas sin fuente dimensional, misma malla entre tipos y escala no física respecto del stock. Ver [pendiente detallado](TOOL_GEOMETRY_BACKLOG.md). El usuario pidió conservar el orden de prioridades anterior; esta mejora sigue después del refrentado tubular.
