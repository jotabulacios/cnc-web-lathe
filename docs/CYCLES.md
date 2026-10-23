# Ciclos G71 (desbaste) y G70 (acabado) — 22/10/2026

Subconjunto educativo en edu-lathe-v2. El dialecto v1 sigue rechazando G70/G71 con UNSUPPORTED_CODE. No es la emulación de un control: el orden de pasadas y la retracción son un modelo documentado.

## Formato (estilo Fanuc de dos bloques)

```
G71 U<Δd> R<e>                 profundidad por pasada (radio) y retracción, en mm
G71 P<ns> Q<nf> U<Δu> W<Δw> F<f>  perfil N…, sobremedida X (diámetro) y Z, avance de desbaste
N<ns> G00 X…                   primer bloque del perfil: solo X (tipo I)
…                              G00/G01 con X/Z/U/W y F; Z nunca aumenta, X nunca disminuye
N<nf> …
G70 P<ns> Q<nf>                acabado: recorre el perfil con su F y vuelve al inicio
```

- Desbaste exterior tipo I únicamente. Sobremedidas U/W no negativas. Sin arcos, T, S ni M dentro del perfil.
- El primer G71 no mueve nada. El segundo usa la última profundidad y retracción definidas (CYCLE_SEQUENCE si no hay ninguna).
- Los bloques ns…nf deben escribirse después del G71. El flujo principal los saltea y G70 los ejecuta. Los N del perfil deben ser únicos.
- El punto de inicio es la posición al llamar al ciclo: debe quedar por fuera del perfil más la sobremedida, y el perfil empieza en su Z.

## Expansión en Rust

Cada ciclo es UN bloque con varios movimientos G00/G01 comunes. La reconstrucción del material, los correctores, las vistas y la reproducción los consumen sin cambios.

- G71: niveles R = R_inicio − k·Δd mientras superen el radio inicial del perfil con sobremedida. Por nivel: rápido a (R, Z_inicio), corte G01 hacia −Z hasta el perfil con sobremedida, retracción rápida a 45° (+e en R y Z) y vuelta rápida a Z_inicio. Después hay una pasada de contorno sobre el perfil con sobremedida, se sale radialmente al R de inicio y se vuelve al punto de inicio.
- En tramos inclinados, cada pasada termina CYCLE_PASS_CLEARANCE_MM (0,001 mm) antes en Z. El kernel del perfil declara ambigua cualquier diferencia de pocos ulps, y una esquina interpolada sobre la línea del contorno cae justo ahí. Con este margen el contorno corta el escalón de forma transversal. La pieza tras el G71 es la misma, porque ese sobrante lo remueve el contorno. En hombros verticales y vértices se usan valores exactos.
- G70: recorre los bloques del perfil desde el punto actual con su F, sale radialmente y vuelve al punto de inicio. Conserva el F modal previo.
- Límites: hasta 4096 movimientos por ciclo (CYCLE_LIMIT) y Δd ≥ 0,01 mm.
- `Block.cycle` (aditivo: roughing-setup, roughing, finishing) permite que la UI explique el bloque sin interpretar el texto.
- `lab_profile` usa para el modelo exterior la compilación v2 ya hecha (ciclos y correctores incluidos), etiquetada como v1. Sin T5 tiene la misma forma, y la prueba de lab_profile confirma la igualdad con la reconstrucción legacy.

## Práctica guiada y UI

- Nuevo catálogo solo v2: fixtures/lathe/cycle-exercises.json con cycle-roughing-finishing.nc. Desbaste con T1 y acabado con T2. Pieza final: Ø20 hasta Z−10, cono a Ø30, Ø30 hasta Z−35 y cono a Ø50 en Z−40, con volumen 45500π mm³. Se confirma solo al terminar.
- La explicación del bloque cuenta movimientos de corte y rápidos y el recorrido de corte. La ayuda del dialecto incluye el formato.
- La práctica de diagnóstico «código no soportado» ahora usa G76 (roscado, sin soporte) en lugar de G71. Los E2E que usaban G71 como código desconocido pasan a G76. Las pruebas v1 (Rust y WASM) mantienen G71 como no soportado en ese dialecto.

## Verificación

- 6 pruebas Rust en tests/cycles.rs:
  - expansión exacta (niveles, Z de corte con oráculo manual, contorno, continuidad, avances);
  - material tras G71 contra el volumen analítico del perfil con sobremedida recortado al stock, y tras G70 exactamente 45500π;
  - G70 con su F y retorno;
  - correctores aplicados a los movimientos del ciclo, con oráculo analítico;
  - 13 errores atómicos y rechazo en v1;
  - barrido de 108 combinaciones (3 perfiles con hombros, conos y mixto × 6 profundidades × 3 sobremedidas × 2 retracciones), donde el material tras G71 y tras G70 coincide con el volumen analítico sin ambigüedades.
- El barrido detectó un defecto real durante el desarrollo: el contorno arrancaba en Z_inicio en lugar de Z_inicio+Δw y removía material de más en perfiles que empiezan con un cono. Corregido.
- WASM real: la práctica confirma solo en el bloque 12 en todos los cursores, y v1 rechaza ciclos. E2E cycles.spec.ts: práctica guiada, explicaciones, DRO en el punto de inicio, revocación al retroceder, volumen 3D y diagnóstico en línea.
- Revisión independiente (agente de solo lectura). Bugs corregidos, cada uno con su prueba:
  - un bucle de niveles sin tope cuando los niveles no generan movimientos: un X enorme podía congelar la UI. Ahora el límite cuenta niveles;
  - el F del propio G71 no se usaba para resolver el perfil (MISSING_FEED indebido);
  - un G70 escrito antes de su perfil lo ejecutaba dos veces: ahora es CYCLE_PROFILE;
  - una línea `%` dentro del perfil rompía el ciclo;
  - un G71 fallido duplicaba diagnósticos al no saltear el perfil;
  - el orden de los errores con `N10 G71`.
- Total: 160 Rust, fmt/Clippy; 147 TS; 26 WASM; 77 E2E en raíz y 77 bajo /cnc-edu/. Hash WASM afdc926cfaacaf9f16e18aebd0e09ab0955f0f9e2c7124e21a3ec7556690ea8a. Logs y capturas en evidence/cycles-g71-g70-2026-10-22/.

## Comportamiento y límites conocidos

- U/R del primer G71 se conservan: un segundo `G71 P…Q…` sin nuevo `G71 U… R…` reutiliza los últimos valores.
- No se exige que el punto de inicio esté fuera del stock: si empieza dentro, la primera pasada corta más que Δd sin aviso propio. La reconstrucción sí detecta los rápidos que atraviesan material.
- Un perfil escrito después de M30 se ejecuta por el G71 sin aviso AFTER_END.
- Con un programa no ejecutable que contiene T5, lab_profile cae en la rama exterior (perfil inválido v2 en lugar de v3). No afecta a programas ejecutables.

## Pendiente

G71 tipo II (perfiles con valles), desbaste interior (U negativo con T5), arcos en el perfil, G72 frontal, G76 de roscado y ejecución paso a paso dentro de un ciclo.
