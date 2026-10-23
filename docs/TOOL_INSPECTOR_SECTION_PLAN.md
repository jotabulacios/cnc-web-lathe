# Inspector y sección3D — plan de integración

Incremento autorizado tras revisar la referencia visual de Amer Icon. No cambia el intérprete ni el material calculado.

1. Inspector independiente: sigue la herramienta activa por defecto y permite estudiar otra sin cambiar setup, código ni cursor. Proyección2D y preview3D usan TOOL_ASSEMBLIES/createToolObject, con esquina ideal en origen, medidas y procedencia visibles. La preview se monta solo al abrir y libera WebGL al cerrar; ante fallo conserva SVG y medidas.
2. Sección longitudinal: presentación del semiespacio tangencial trasero, con tapas planas sobre las bandas reales del material y agujero conservado. Herramienta completa, misma posición y escala. No altera perfil, volumen, evaluación ni persistencia; toggles de presentación locales.
3. Pruebas: independencia respecto de reproducción/setup, seguimiento de T/retroceso, preview y fallback, geometría cerrada de sección con volumen visual mitad del original y header físico intacto, presupuestos de malla, E2E raíz/subruta y QA manual de mandrinado. Registro por cierres en WORK_LOG.md.

## Estado (22/10/2026)

- Punto 1 implementado y verificado: ver TOOL_INSPECTOR.md.
- Punto 2 implementado y verificado con malla de media revolución y tapas (no clipping): ver SECTION_3D.md.
