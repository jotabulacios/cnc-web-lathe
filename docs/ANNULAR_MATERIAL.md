# Material tubular: contrato y primera implementación

Estado actualizado: base geométrica e integración inicial completas. Ya se puede seleccionar tubo y ejecutar mandrinado T5 en2D/3D; ver TUBULAR_SIMULATION.md. Este documento conserva las decisiones de la primera base geométrica.

## Decisión

Separar la geometría de material de la interpretación de G-code. Añadir `annular_profile` a `cnc-core`, sin cambiar `Stock`, `CompileRequest`, `stock_profile`, `stock_profile_v2` ni los JSON guardados. Las versiones exteriores existentes conservan sus contratos. La primera entrega estableció la API Rust; la integración posterior publica una frontera WASM aditiva, documentada en TUBULAR_SIMULATION.md.

Cada tramo comparte un intervalo axial creciente y cuatro radios físicos: interior inicial/final y exterior inicial/final. Se exige `0 ≤ interior ≤ exterior` en ambos extremos. Entre extremos los radios son lineales; esto garantiza el orden en todo el tramo. Los tramos son contiguos en Z y pueden presentar escalones radiales. La igualdad interior/exterior representa material nulo en ese tramo, conservando el dominio axial. Radio interior cero permite representar también un sólido.

La remoción exterior aplica la envolvente inferior al radio exterior; el mandrinado aplica la envolvente superior al interior. Se reutiliza el algoritmo de intersección de `LinearProfile`, ampliándolo con una envolvente superior. No se usa una transformación `C-r`: perdería precisión al restar radios pequeños de una constante grande. Una operación que haga cruzar las paredes se rechaza entera; no se recorta silenciosamente. Los perfiles de entrada permanecen intactos incluso ante error o límite de recursos. El presupuesto es compartido entre validación, corte y reconstrucción.

El volumen se integra como `π/3 · longitud · ((Ro0² + Ro0·Ro1 + Ro1²) − (Ri0² + Ri0·Ri1 + Ri1²))`. La implementación usa diferencias factorizadas para reducir cancelación en paredes delgadas. No se infiere contacto, husillo, dirección de avance, herramienta ni posibilidad física de acceso a partir de esta API geométrica.

## Pruebas de aceptación de esta base

- Tubo Ø50 exterior, Ø20 interior, longitud100: volumen52500π mm³.
- Ampliar el agujero a Ø30 en los últimos40mm: volumen47500π mm³; repetir no remueve más material.
- Conos interiores/exteriores: volumen analítico y particiones de intersección, sin añadir material.
- Cortes exteriores e interiores sucesivos mantienen ambos límites y no alteran el original.
- Coordenadas inválidas/no finitas, radios invertidos, dominio no contiguo y paredes cruzadas producen error.
- Los límites de tramos/operaciones siguen siendo acotados. La precisión dudosa conserva un error explícito.
- Regresiones de geometría e intérprete v1/v2 deben seguir pasando.

Hay 22 pruebas nuevas en `crates/cnc-core/tests/annular_profile.rs`, incluida una grilla determinista de625pares de rectas comprobada en101puntos por par contra `max` analítico. La fixture compartida `fixtures/annular-material.json` fija los volúmenes inicial, tras mandrinado y tras cilindrado exterior, además de las tres secciones finales. Es una fixture geométrica, no una práctica G-code cargable en la interfaz.

`AnnularProfile::new` valida la entrada y mantiene los tramos privados; se exponen para lectura con `spans()`. `cylinder` construye sólido/tubo inicial, `bore` amplía el agujero, `cut_outer` reduce el exterior y `volume_mm3` integra el resultado. `AnnularError::WallCrossing` distingue un cruce de pared de `GeometryError` (entrada, complejidad o precisión). Un tramo nulo es válido como resultado; el constructor de stock inicial exige material de espesor positivo. Como en el motor anterior, magnitudes limitadas a1e9mm,4096tramos y2Moperaciones. El presupuesto consumido no se reinicia en cada corte; la geometría anterior se conserva.

Los radios y volúmenes usan `f64`, sin promesa de exactitud arbitraria para escalas subnormales. Se evita el caso de diámetro positivo que se convierte en radio cero por underflow. La integración factorizada y la suma compensada reducen cancelación, sin convertir esa mejora en una tolerancia industrial.

## Plan inicial de integración (implementado en TUBULAR_SIMULATION.md)

1. Usar esta base en una reconstrucción de prefijos con petición de material interior explícita. El tubo comienza con un agujero existente; no se simula taladrado implícito. Definir operación/herramienta interior de forma explícita; no reinterpretar T1–T4 exteriores como barras de mandrinar. Primer alcance: G00/G01 y mandrinado longitudinal hacia Z negativo, punta ideal, diagnósticos y rollback por bloque.
2. Añadir un export WASM aditivo y validación TypeScript estricta. Definir versión de material y migración explícita del proyecto: documentos anteriores equivalen a sólido con interior cero. Probar que configuración/material invalidan la revisión y las prácticas guiadas comparan el setup completo.
3. Incorporar configuración de tubo y barra de mandrinar; sección 2D con hueco, revolución 3D con pared interior y caras anulares. Compartir el perfil calculado, sin duplicar remoción en TypeScript. Probar ejecución, retroceso, reinicio, guardado y reapertura.
4. Añadir ejercicio guiado con oráculo de volumen anterior y pruebas sobre WASM real y navegador en raíz/subruta. Arcos interiores, ranurado con ancho, compensaciones, mordazas y puestas quedan fuera de ese primer alcance.

Antes de publicar esa frontera, resolver expresamente el identificador de la herramienta interior: los consumidores actuales validan un enum estricto de cinco herramientas. Añadir T5 a la salida de `compile` sin negociación rompería consumidores antiguos. La ampliación deberá tener un contrato/dialecto versionado o un export aditivo; el contrato actual debe seguir rechazando lo que hoy no soporta. La primera base geométrica no asignaba T5. La integración posterior lo implementó en compile_v2, conservando compilev1. No se agrega una operación global que contradiga T1–T4 y no introduce campos que se descarten al compilar.

Tampoco basta con restar el volumen de un agujero al resultado v2: un rápido dentro de ese agujero sería diagnosticado erróneamente como contacto por el clasificador exterior. La próxima reconstrucción necesita comprobar trayectorias contra el intervalo material entre ambas paredes, incluidos casos cuyos extremos están en aire pero atraviesan la pared. Las entradas/salidas radiales, el contacto en hombros, el husillo apagado y el acceso desde un agujero existente necesitan fixtures propias antes de habilitar mandrinado en la UI.

La API geométrica acepta líneas de corte; no certifica un mecanizado ni decide qué movimientos están soportados por el dialecto. Las restricciones del simulador deberán aplicarse en la reconstrucción antes de llamar a la geometría.
