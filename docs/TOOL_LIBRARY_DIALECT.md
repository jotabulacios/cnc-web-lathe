# Dialecto y Catálogo de Herramientas de Torno CNC (`edu-lathe-v1`)

Este documento especifica la semántica de llamada a herramientas (`T`), cambio de herramienta (`M06`), y el catálogo educativo disponible en el simulador de torno CNC de dos ejes (X/Z).

> [!NOTE]
> Este subconjunto es didáctico para navegador y aprendizaje universitario. Las herramientas se modelan como puntas ideales en cinemática pura; no incluye tablas de desgaste de radio ni compensación de punta G41/G42.

---

## 1. Convención de Sintaxis G-code para Torno

Este dialecto educativo admite las llamadas siguientes. No se afirma una sintaxis universal para controles comerciales; el significado se fija aquí y se verifica con fixtures.

### Formato estándar de 4 dígitos (`Tsstt`)
- `ss`: número de estación en la torreta (01 a 99).
- `tt`: número de corrector geométrico y de desgaste (01 a 99).
- En el subconjunto educativo `edu-lathe-v1`:
  - El corrector debe coincidir con la estación (`ss == tt`). Ejemplo: `T0101`, `T0202`, `T0303`, `T0404`.
  - Un corrector diferente genera diagnóstico `INVALID_TOOL_OFFSET`.
  - La estación `0` (`T0000` o `T0`) cancela la herramienta y activa la herramienta neutra genérica (`generic-od`).

### Formato simplificado de 1 o 2 dígitos (`Ts` / `Tss`)
- Se admiten también formatos didácticos directos: `T1`, `T01`, `T2`, `T02`, `T3`, `T03`, `T4`, `T04`, y `T0`.
- El motor asocia automáticamente la estación y el corrector con el mismo índice.

### Código complementario `M06` (Cambio de herramienta)
- Perteneciente al grupo modal `"tool_change"`.
- Aquí M06 es una confirmación educativa opcional; no representa el movimiento físico de una torreta.
- El motor acepta indistintamente:
  - `T0101` (solo palabra T).
  - `T0101 M06` o `M06 T0101` (palabra T con código de cambio).
  - `M06` aislado (ciclo de confirmación modal sin cambio de estación).
- Dos códigos `M06` en el mismo bloque generan diagnóstico `MODAL_CONFLICT`.
- Dos palabras `T` en el mismo bloque generan diagnóstico `DUPLICATE_WORD`.

---

## 2. Catálogo de Herramientas Educativas

| Estación (`T`) | Identificador (`toolId`) | Denominación | Geometría / Inserto | Operaciones típicas |
| :---: | :---: | :---: | :---: | :---: |
| `T0` / `T0000` | `generic-od` | Herramienta neutra exterior | Punta ideal neutra (por defecto) | Ensayos generales, compatibilidad retroactiva |
| `T01` / `T0101` | `roughing-od` | Desbaste exterior | Romboidal 80°, diseño educativo propio | Pasadas longitudinales de desbaste y conos exteriores |
| `T02` / `T0202` | `finishing-od` | Acabado exterior | Romboidal 55°, diseño educativo propio | Copiado fino, perfiles de acabado y chaflanes |
| `T03` / `T0303` | `grooving-od` | Ranurado y tronzado | Cuchilla / placa recta 3 mm | Representación de cuchilla; el motor no remueve por ancho ni simula tronzado físico |
| `T04` / `T0404` | `facing-od` | Refrentado frontal | Triangular de punta 80°, diseño educativo propio | Planeado y refrentado de cara Z0 |

---

## 3. Semántica de Ejecución y Persistencia Modal

1. **Estado inicial (`Setup`):**
   - El setup define la herramienta inicial montada en la máquina (por defecto `toolId: "generic-od"`).
   - Cualquier herramienta del catálogo puede configurarse como herramienta inicial del proyecto.
2. **Propagación en bloques (`State`):**
   - Cuando se interpreta un bloque con `T`, el campo `toolId` del `afterState` se actualiza al identificador correspondiente.
   - Los bloques posteriores conservan modalmente esta herramienta hasta la próxima instrucción `T`.
3. **Asignación en movimientos (`Motion`):**
   - Cada movimiento generado (`G00`, `G01`, `G02`, `G03`) hereda el `toolId` de la herramienta activa en ese instante.
4. **Diagnósticos:**
   - `INVALID_TOOL_NUMBER`: número no entero, negativo o superior a 9999 (ej. `T1.5`, `T-2`, `T10000`).
   - `INVALID_TOOL_OFFSET`: offset no coincide con la estación (ej. `T0102`).
   - `UNSUPPORTED_TOOL`: estación no disponible en la torreta (estaciones válidas: 0 a 4).
   - `DUPLICATE_WORD`: más de una palabra `T` en el mismo bloque.


## Validación del ancho de T

Se conserva el lexema numérico: solo se admiten 1, 2 o 4 dígitos sin signo. Un formato de cuatro dígitos siempre se separa en estación/corrector, incluso cuando su valor numérico es menor a100: T0001 y T0004 generan INVALID_TOOL_OFFSET. T101 y T00101 generan INVALID_TOOL_NUMBER. Los alias válidos T1/T01/T0101 y T0/T00/T0000 siguen funcionando.


## Selector inicial

Pieza y origen permite elegir las cinco herramientas como setup inicial. Cambiarla invalida programa interpretado/cursor y actualiza las vistas con la nueva configuración; exige volver a interpretar. T modifica el estado modal desde su bloque, sin cambiar el setup inicial guardado. Anterior/reset restablecen el estado correspondiente. Se verifican selección, cambio T, retroceso, invalidación, guardado y recarga en navegador.

## Conjuntos dimensionales actuales

T0–T5 se muestran con geometrías educativas propias en milímetros compartidas por SVG y Three.js. No corresponden a modelos de fabricante ni a las designaciones de inserto comerciales mencionadas en versiones anteriores del documento. Ver TOOL_ASSEMBLIES.md para medidas y origen. T5 está disponible únicamente en edu-lathe-v2; las reglas y contratos históricos v1 se conservan. Los sufijos de T siguen sin aplicar correctores reales.
