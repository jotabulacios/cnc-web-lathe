# Arcos G02/G03 en el dialecto edu-lathe-v1

Estado: **incrementos 4.1 y 4.2 completados**. El intérprete resuelve la geometría del arco en el plano G18 y la vista 2D lo dibuja (4.1). El perfil de material v2 modela arcos monótonos en Z mediante aplanado determinista por cuerdas inscriptas con tolerancia geométrica acotada (4.2); el perfil v1 legacy conserva su comportamiento congelando antes de arcos con `ARC_IN_PROFILE`.

Este documento fija la convención del dialecto educativo. No es una especificación de Fanuc ni de ningún control real, y nada de esto está validado industrialmente.

## Plano y sentido de giro

Se trabaja en el plano **G18 (Z–X)**. La convención se define mirando la máquina desde **+Y**:

- **Z crece hacia la derecha**; el plato está a la izquierda y la cara frontal del stock en Z = 0.
- **X (radio) crece hacia arriba**. La UI muestra X en diámetro, pero la geometría interna usa radio.
- **G02** interpola en sentido **horario**.
- **G03** interpola en sentido **antihorario**.

Con esa vista, el ángulo `θ` del punto `(z, r)` alrededor del centro se parametriza como:

```
z = zc + R·cos θ
r = rc + R·sin θ
```

`θ` creciente es antihorario (G03); `θ` decreciente es horario (G02). El barrido se normaliza al arco más corto posible que una el punto final: `0 < |Δθ| < 2π`.

> Advertencia: si se mira la máquina desde −Y, o si se invierte la pantalla, el sentido de G02 y G03 se percibe al revés. La convención documentada es siempre la de +Y. Una máquina con torreta delantera puede requerir espejar el sentido; este simulador no modela esa diferencia.

## Palabras I y K

- `I` es el desplazamiento **radial** desde el punto de inicio hasta el centro, en mm. **No** está en diámetro, aunque `X` sí lo esté.
- `K` es el desplazamiento **axial** desde el punto de inicio hasta el centro, en mm.
- Ambos son **incrementales respecto del inicio del bloque**. No son absolutos y **no son modales**: no se conservan de un bloque al siguiente.
- Se puede omitir uno de los dos; el omitido vale 0.
- `I`/`K` solo son válidos en un bloque con modo de movimiento G02/G03 y al menos un eje (`X`/`U`/`Z`/`W`).

Ejemplo (arco convexo de cuarto de círculo, R = 10 mm):

```gcode
G21 G18 G98
S900 M03
G00 X40 Z0
G03 X20 Z-10 I-10 K0 F100
M30
```

Inicio: radio 20, Z 0. `I = −10`, `K = 0` → centro en radio 10, Z 0. Radio 10. Fin: radio 10, Z −10. Barrido 90° antihorario, longitud `5π ≈ 15.708 mm`.

## Modo de movimiento y avance

- `G02` y `G03` son **modales**, igual que `G00` y `G01`. Un bloque posterior con ejes y sin G usa el modo vigente.
- Como todo movimiento de avance, G02/G03 exigen un `F` modal positivo (`MISSING_FEED`). Un `G00` no consume ni exige `F`.
- El husillo no se valida en el intérprete para arcos; el perfil v1 sí exige husillo encendido y S > 0 para cualquier corte.
- Un bloque `G02`/`G03` sin ejes solo cambia el modo.

## Validación

Tolerancia de radio: `ε_arc = 1e-6 mm` (absoluta). Es una tolerancia educativa, no la de un control real.

| Código | Cuándo |
| --- | --- |
| `MISSING_ARC_CENTER` | G02/G03 con ejes pero sin `I` ni `K`. |
| `INVALID_ARC_CENTER` | Centro igual al punto de inicio (radio 0) o radio fuera de rango. |
| `ARC_RADIUS_MISMATCH` | El punto final no está sobre la circunferencia: `\|R_fin − R_inicio\| > ε_arc`. |
| `DEGENERATE_ARC` | Inicio = fin (arco completo de 360°). Incluye `G02 I… K…` sin ejes. |
| `UNEXPECTED_ARC_WORD` | `I`/`K` en un bloque G00/G01 o sin modo de arco. |
| `POSITION_RANGE` | El barrido del arco hace que el radio se vuelva negativo (cruza el eje del husillo). |
| `MISSING_FEED` | No hay `F` modal positivo. |

Reglas adicionales:

- El punto final se valida contra la circunferencia completa, no solo contra el cuadrante del barrido.
- Un arco que **toca** el eje (r = 0) en un extremo es válido. Un arco cuyo barrido pasa por r < 0 se rechaza.
- Los errores del intérprete son globales: si un bloque falla, el programa no es ejecutable y no se emite ninguna trayectoria. No hay ejecución parcial silenciosa.
- Un arco completo se rechaza en este dialecto porque no tiene una interpretación útil de torneado exterior. Si más adelante hace falta una ranura circular, deberá definirse explícitamente.

## Perfil de material y remoción en arcos (4.2)

En el incremento 4.2 se integró la remoción de material para arcos en el perfil v2:

- **Aplanado por cuerdas inscriptas**: cada arco monótono en Z se aproxima mediante una secuencia determinista de tramos lineales continuos.
- **Tolerancia geométrica perpendicular**: `ARC_CHORD_TOLERANCE_MM = 0.01 mm`. La tolerancia $\delta$ se define como la distancia perpendicular máxima entre la cuerda inscripta y el arco de circunferencia. No es una cota del error radial a Z constante ni una garantía universal de error volumétrico relativo. Cerca de una tangente axial el error radial puede superar ampliamente δ. Los errores volumétricos medidos en fixtures se informan como resultados particulares, con su denominador explícito.
- **Número de segmentos determinista**:
  $$n = \left\lceil \frac{|\Delta\theta|}{2 \arccos(1 - \delta / R)} \right\rceil$$
  Calculado como función pura del radio $R$ y barrido $|\Delta\theta|$ sin derivas numéricas por acumulación. Los puntos inicial y final coinciden de manera exacta con los extremos calculados por el intérprete.
- **Límite de subdivisión**: `MAX_ARC_SEGMENTS = 512`. Si $n > 512$ (según el radio y el barrido solicitados), el perfil se congela transaccionalmente con `PROFILE_LIMIT` antes de cortar, sin relajar la tolerancia geométrica de forma silenciosa.
- **Monotonicidad axial en Z**: solo se aplanan arcos monótonos en Z. Si el barrido contiene una inversión axial ($\theta = 0$ o $\theta = \pi$), el perfil se congela con `ARC_IN_PROFILE` sin inventar tramos artificiales.
- **Condiciones de corte**: arcos en el aire conservan el perfil sin requerir husillo; si algún segmento penetra el material existente, se exige husillo encendido (`M03`/`M04`) y RPM positivas. El corte es transaccional por bloque.
- **Perfil legacy v1**: `profile_at` v1 no aproxima arcos y continúa congelando con `complete: false` y diagnóstico `ARC_IN_PROFILE`. Se preserva el contrato v2 sin alterar la compatibilidad ni crear un v3.

## Vista 2D

El arco se dibuja con un comando SVG `A` usando el radio real (escala isométrica en Z y radio). El `sweep-flag` se invierte respecto del sentido físico porque el eje Y del SVG crece hacia abajo:

```
sweep-flag = clockwise ? 1 : 0
large-arc-flag = sweepRad > π
```

El encuadre incluye la caja de la circunferencia completa, aunque el arco barrido sea menor, para que el vientre no se recorte.

## Fuera de alcance (por ahora)

- `R` como alternativa a `I`/`K`: no soportado. `R` es ambiguo cerca de 180° y puede desplazar el centro si el punto final no cierra; exigir `I`/`K` hace explícito el centro.
- Otros planos (G17, G19) y arcos helicoidales.
- Arcos con compensación de radio de punta.
- Rosca, ranurado o interpolación circular de interiores.
- Verificación contra un manual de control concreto.

## Qué falta verificar contra un manual real

Estas decisiones son del dialecto educativo y **no** deben presentarse como compatibilidad Fanuc:

1. Si `I` se especifica en radio o en diámetro en el control elegido.
2. El sentido exacto de G02/G03 según el tipo de torreta y el sistema de coordenadas de la máquina.
3. La tolerancia real de cierre de radio y qué hace el control cuando no cierra.
4. El comportamiento con arcos que tocan o cruzan el eje.
5. Si el control admite arcos de 360° y con qué sintaxis.

Cualquier adaptación futura a un control real debe documentarse por separado y con pruebas contra el manual correspondiente.

## Pruebas de referencia

- Rust (`crates/cnc-core/tests/arcs.rs`): cuarto de círculo G03, filete cóncavo G02, semicírculo que toca el eje, modalidad, `I`/`K` no modales, centro faltante, centro inválido, radio inconsistente, arco completo, palabras I/K fuera de arco, cruce del eje, atomicidad y congelamiento de ambos perfiles.
- WASM (`tests/wasm.test.ts`): geometría resuelta a través de la frontera JS y `ARC_IN_PROFILE` en v1 y v2.
- TypeScript (`tests/explain.test.ts`, `tests/viewport.test.ts`): explicación del arco, exigencia estricta de geometría `arc` y encuadre del vientre.
- E2E: trazo `data-arc`, título de la explicación y perfil parcial.

## Aviso

Simulador educativo. La geometría es idealizada: herramienta puntual, sin radio de punta, sin fuerzas, sin colisiones reales y sin validación industrial. No usar para operar una máquina real.


## Clasificación de contacto separada de la aproximación

La penetración se comprueba contra el arco real antes de generar cuerdas: para cada intervalo de stock se evalúa la diferencia entre el radio circular y el tramo lineal en los extremos del solapamiento y sus puntos estacionarios interiores. Solo se usa un arco monótono en Z. Un guard numérico conservador trata comparaciones dudosas como PROFILE_NUMERICAL_AMBIGUITY; no es una holgura física. Las operaciones cuentan dentro de GeometryBudget.

Si el arco real penetra, se exige husillo y dirección admitida aunque sus cuerdas estén en aire. Cuando la representación limitada no produce ninguna remoción pese a haberla detectado en el arco, se congela el bloque con PROFILE_NUMERICAL_AMBIGUITY y se conserva el perfil anterior; no se aumenta el límite de segmentos ni se ignora el corte. Un arco real demostrado en aire no modifica el perfil aunque su cuerda cruce material.

Los radios de los extremos interpretados se conservan al verificar cruces del eje; solo se reconstruyen los mínimos interiores, evitando diferencias entre targets por sin/atan2 en un extremo X0. La regresión nativa y WASM usa el mismo programa.


### Límite al repetir un arco

El perfil conserva cuerdas, no círculos exactos. En un arco inferior puede quedar material residual entre la cuerda anterior y el arco real. Una repetición exacta puede detectar ese residual pero no representarlo mediante las mismas cuerdas: con husillo devuelve PROFILE_NUMERICAL_AMBIGUITY y conserva el perfil; sin husillo diagnostica SPINDLE_OFF cuando la penetración se demuestra. No se debe interpretar esa repetición como un pase en aire garantizado. La incertidumbre del modelo tiene este límite explícito; no se resuelve otorgando una holgura física de0.01mm.
