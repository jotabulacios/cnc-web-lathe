**Revisión y correcciones:** [fallos observados](REVIEW_2026-10-20.md) y [reparación verificada](REVIEW_FIXES_2026-10-20.md).

**Punto de entrada vigente para otra IA:** [HANDOFF_COMPLETO_2026-10-22.md](HANDOFF_COMPLETO_2026-10-22.md). Reúne el estado actual, el corte exacto de la tarea y los comandos. Las entradas históricas inferiores no reemplazan ese estado.

**Retoma con otro agente:** leer [HANDOFF.md](HANDOFF.md) para el estado exacto y las verificaciones pendientes.

# Auditoría y propuesta de torno CNC web

Documentación preparada el 2026-10-20 para revisión antes de programar. Se leyó el starter y se auditó una copia de `rudra496/cnc` en SHA `b59fefb5043ce53ddd3adf34079398838a69729d`. La auditoría inicial no modificó upstream. Después, el usuario autorizó la primera implementación independiente.

**Estado actual y prioridades:** [Estado de situación del 22/10/2026](ESTADO_DE_SITUACION_2026-10-22.md). El escenario MVP inicial ya está implementado; los documentos de la primera base conservan contexto histórico.

Para retomar el trabajo, empezar por [Continuidad y punto de partida](CONTINUIDAD.md).

Orden sugerido:

1. [Auditoría](CODE_AUDIT.md): recorrido real, reutilización, problemas confirmados y checks ejecutados.
2. [Arquitectura](ARCHITECTURE.md): Rust puro + WASM, frontend Next/Three, dialecto X/Z y contrato.
3. [Plan de implementación](IMPLEMENTATION_PLAN.md): entregas, escenario esperado, pruebas y siguiente tarea.
4. [Interfaz actual](INTERFACE_ITERATION.md): pantalla de torno, setup editable y explicaciones.
5. [Perfil exterior implementado](STOCK_PROFILE_MODEL.md): reglas de remoción, límites y fixtures.
6. [Arcos G02/G03](ARC_DIALECT.md): convención del dialecto, validación y límites del incremento 4.1.
7. [Pruebas E2E](E2E_BROWSER.md): cobertura Chromium en raíz y subruta.
8. [Reproducción automática](AUTOMATIC_PLAYBACK.md): controles y temporización.
9. [Revisiones externas](EXTERNAL_REVIEWS.md): aportes de OpenCode/DeepSeek y agy.
10. [Vista 3D](REVOLUTION_3D.md): proyección del perfil, lifecycle y pruebas.
11. [Ejemplos guiados](GUIDED_EXERCISES.md): catálogo y recuperación del documento anterior.
12. [Proyectos locales](LOCAL_PROJECTS.md): guardado y formato JSON.
13. [Carga del motor](WASM_LOADING.md): límite temporal y reintento.
14. [Diagnósticos en editor](EDITOR_DIAGNOSTICS.md): selección por spans Rust y consistencia de líneas.
15. [Archivos G-code](PROGRAM_FILES.md): apertura y descarga local de texto UTF-8.
16. [Perfil cónico: plan y kernel](LINEAR_PROFILE_PLAN.md): evolución aditiva y precisión numérica.
17. [Backlog priorizado](ISSUE_CHECKLIST.md): dependencias y criterios de cierre.

Decisión actual: proyecto independiente con reutilización selectiva, aprobada por el usuario después de revisar la recomendación inicial. Ya existe una primera base Rust/WASM + Next.js; [estado de implementación](IMPLEMENTATION_STATUS.md). La auditoría del upstream conserva el contexto histórico y no describe el estado del nuevo motor.

El build exploratorio generó salida estática, pero typecheck y lint fallaron. Se usó resolución pnpm, no el lock Bun original: no es una certificación reproducible de upstream. [Logs y sondas](evidence/) conservan evidencia; las sondas son herramientas de auditoría, no implementación del simulador ni suite completa.

Los documentos de esta carpeta registran decisiones, alcance y verificación de cada incremento. Los logs de verificación (`docs/evidence/`) se conservan localmente y no se publican; el CI de GitHub vuelve a ejecutar todas las pruebas en cada push.

Pendiente visual/dimensional reconocido: [herramientas y portaherramientas](TOOL_GEOMETRY_BACKLOG.md).

Continuación actual: [log de trabajo](WORK_LOG.md) y [refrentado tubular](TUBULAR_FACING.md).

Herramientas: [conjuntos dimensionales implementados](TOOL_ASSEMBLIES.md) y [diseño siguiente de correctores](TOOL_OFFSETS_PLAN.md). [Inspector de herramienta](TOOL_INSPECTOR.md) [sección 3D](SECTION_3D.md) y [cámara ortográfica](ORTHOGRAPHIC_CAMERA.md) [perfil decidido en Rust](LAB_PROFILE.md) [correctores](TOOL_OFFSETS.md) [ciclos G71/G70](CYCLES.md) y [radio de punta G41/G42](NOSE_RADIUS.md) implementados; [banco de trabajo](WORKBENCH.md) según la [revisión visual](visual-review-2026-10-22/VISUAL_REVIEW.md); [fuentes de datos de herramientas](TOOL_DATA_SOURCES.md) [herramientas ISO nominales](ISO_TOOLS.md) y [husillo y tiempo estimado](SPINDLE_TIME.md); [plan inspector/sección 3D](TOOL_INSPECTOR_SECTION_PLAN.md).

Base futura: [referencias y calibración puras Rust](TOOL_REFERENCES.md), aún sin correctores en G-code/UI.

Referencia de presentación solicitada: [herramientas y look de Amer Icon](REFERENCE_TOOL_LOOK_2026-10-22.md).
