# Tubo y mandrinado longitudinal — 22/10/2026

## Comportamiento implementado

En «Pieza y origen» se puede indicar el diámetro interior inicial: cero representa sólido, un valor positivo menor que el diámetro exterior representa un tubo con agujero existente. El botón «Cargar ejemplo de mandrinado» carga `fixtures/lathe/boring.nc` y su configuración, conserva el documento anterior y permite volver a él. Ahora carga una práctica evaluada del catálogo, con seis cotas interiores/exteriores y volumen anular. Ver GUIDED_ANNULAR_PRACTICES.md para la ampliación posterior y el diagnóstico de rápido.

T5/T05/T0505 activa `boring-id`, una herramienta interior con punta ideal. T0–T4 conservan su función exterior. La forma del inserto/holder sigue siendo ilustrativa; el pulido visual continúa aplazado. No se simula el cuerpo de una barra ni se garantiza su acceso físico al agujero.

El perfil anular admite G00/G01 y refrentado exterior completo hacia el agujero; ver [refrentado tubular](TUBULAR_FACING.md). G01 hacia Z negativo retira material interior con T5 y exterior con las otras herramientas. Las cotas X/U se interpretan en diámetro y se convierten una sola vez a radio por el intérprete. La remoción exige husillo encendido y RPM positivas. No se permite taladrar un sólido implícitamente. Cortes radiales parciales, avances hacia Z positivo que penetran material y arcos producen diagnóstico y conservan el último bloque completo. Movimientos rectos en aire o sobre una pared no remueven material. Un rápido a través del agujero es distinto de un rápido a través de la pared.

La elección del perfil es para todo el programa: si hay tubo, herramienta inicial T5 o un bloque que activa T5, se usa v3 en todos sus prefijos. Por eso la restricción de arcos también afecta programas sólidos que activan T5, aunque sea después del arco. No hay cambio de modelo a mitad de la reconstrucción. Sólidos sin T5 conservan el perfil v2, incluidos arcos exteriores y refrentado ya implementados.

## Fronteras y compatibilidad

- `compile` Rust/WASM sigue siendo apiVersion1 + `edu-lathe-v1`: rechaza T5 y setup interior. No se amplió su enum de salida silenciosamente.
- Nuevo `compile_v2`: apiVersion2 + `edu-lathe-v2`; comparte parser, interpretación y límites con v1, añade T5. Sus reglas de estaciones/correctores siguen exigiendo coincidencia (T0504 no es válido).
- Los export `stock_profile` y `stock_profile_v2` mantienen sus peticiones. Sus funciones Rust rechazan resultados de compilación v2, evitando tratar una herramienta interior como exterior.
- Nuevo `stock_profile_v3({program, completedBlocks, innerDiameterMm})`: `program` es una petición compilev2 con `Stock` histórico (solo diámetro exterior/longitud). `innerDiameterMm` es un campo hermano explícito de reconstrucción. La frontera WASM es estricta: no admite campos desconocidos.
- El setup de la UI puede incluir `stock.innerDiameterMm`. El adaptador separa ese material del programa enviado al compilador; no se envía como campo ignorado al Rust `Stock`. El perfil v3 valida revisión, cursor, dominio axial y límites del material antes de renderizar.
- La app actual ejecuta dialecto v2 y sus guardados/descargas de proyecto declaran versión2/dialecto2 explícitamente, incluso si T5 solo aparece en el texto. Se siguen cargando proyectos v1. Las funciones de serialización también conservan la inferencia v1 para consumidores antiguos que no soliciten versión explícita; no se analiza G-code en TypeScript para adivinar la versión.
- La clave de almacenamiento local histórica se mantiene para recuperar proyectos existentes. El borrador interior incompleto se conserva junto al último setup válido; cambiarlo invalida compilación/ejecución y las prácticas comparan interior cero frente al material tubular.

## Geometría y precisión

`AnnularProfile` y `LinearProfile` comparten envolventes y presupuesto. `penetrates` clasifica una recta contra ambas paredes; calcula la intersección de los intervalos donde `r > interior` y `r < exterior`. No basta con comprobar los extremos: una recta puede comenzar en el agujero y terminar por fuera del tubo atravesando material. En un sólido, el eje se considera material; en un tubo es aire. En un hombro axial solo se considera el material común a ambos lados, siguiendo la convención exterior anterior.

La igualdad de radios reconstruidos por interpolación no se considera automáticamente contacto exacto. Dos regresiones halladas durante revisión independiente demostraron pérdida sub-ulp: una trayectoria larga recortada al stock y una pared cónica muy delgada. Se acepta igualdad demostrable de extremos almacenados/constantes/tramos idénticos; la igualdad reconstruida dudosa produce `PROFILE_NUMERICAL_AMBIGUITY`. Un testigo interior inequívoco permite demostrar penetración aunque otro punto sea ambiguo. Esto es un criterio conservador de precisión, no una tolerancia de fabricación.

Cada bloque acumula un candidato y solo lo confirma si todos sus movimientos son válidos. Una intersección dudosa, límite, husillo apagado, rápido en material o cruce de pared conserva el perfil anterior y su volumen. Los bloques en aire/estado no clonan perfiles enteros. Se preservan límites4096tramos y2Moperaciones.

La vista 2D usa contornos con agujero y relleno `evenodd`, incluida la trama de material/remoción. La 3D genera pared exterior, pared interior y caras anulares expuestas en extremos/escalones. No tapa el agujero con discos. Proyección/malla solo consumen perfiles resueltos; no interpretan ni remueven material. La malla tiene presupuesto32MiB y puede reducir facetas para perfiles complejos; degenerados/rango float32 insuficiente ofrecen alternativa2D.

## Oráculo y verificación

Stock Ø50 exterior, Ø20 interior, largo100mm. T5 amplía a Ø30 en los últimos40mm; T1 reduce el exterior a Ø40 en los últimos20mm. Volúmenes independientes:52500π→47500π→43000π mm³. El último corresponde a135088,4841043611mm³. La fixture geométrica anterior y el nuevo programa G-code coinciden con tres secciones finales:

| Z (mm) | Ø interior (mm) | Ø exterior (mm) |
|---|---:|---:|
| −100 a −40 |20|50|
| −40 a −20 |30|50|
| −20 a 0 |30|40|

Pruebas nuevas cubren contacto recto y precisión, prefijos/retroceso/reinicio, T5 versionado, husillo, cruce de pared, rollback de varios movimientos, entradas inválidas, WASM real, topología/orientación de malla y guardado/reapertura en navegador. La evidencia y cifras finales se registran en `evidence/tubular-integration-2026-10-22/` y en HANDOFF.md.

## Siguiente incremento

El refrentado tubular está integrado; ver TUBULAR_FACING.md. Antes de ampliar a arcos interiores, definir operaciones y oráculos propios. La incorporación del mandrinado al sistema de prácticas evaluadas ya está implementada con cotas interiores y volumen anular, junto con un diagnóstico y su corrección; no volver a implementarla. Ranurado con ancho, compensación, mordazas y múltiples puestas siguen siendo incrementos separados. No volver a implementar la base geométrica ni asignar T5 dentro de la interfaz v1.
