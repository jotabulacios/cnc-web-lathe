# Refrentado frontal (Facing) en el dialecto edu-lathe-v1

Estado: **incremento 5.1 (diseño e implementación)**.
Este documento define la semántica, restricciones geométricas y consideraciones didácticas del refrentado frontal en el simulador educativo de torno CNC.

## Concepto y objetivo pedagógico

El **refrentado** (*facing*) es habitualmente la primera operación de mecanizado en un torno:
1. Permite preparar y aplanar la cara frontal del material bruto.
2. Establece una cara limpia perpendicular al eje del husillo.
3. Enseña al estudiante la diferencia entre avance longitudinal axial (cilindrado en Z) y avance radial transversal (refrentado en X).

En versiones previas (v1 y v2 inicial), todo movimiento puramente radial (`motion.from.z_mm == motion.to.z_mm`) con remoción de material era rechazado con `UNSUPPORTED_PROFILE_CUT`. Con este incremento, el perfil v2 admite **refrentado frontal pasante hasta el centro ($X0$)**.

## Convención de coordenadas y caras

- El sistema de coordenadas del torno sitúa $Z = 0$ en la cara frontal del stock inicial de longitud $L$ (que ocupa el intervalo axial $[-L, 0]$).
- Cuando se realiza un refrentado a una profundidad $z_{\text{corte}}$ (con $-L < z_{\text{corte}} \le 0$):
  - Todo el material por delante de la herramienta ($z > z_{\text{corte}}$) es eliminado por el filo de corte.
  - El intervalo axial $[z_{\text{corte}}, 0]$ pasa a tener radio cero ($r = 0$).
  - La nueva cara frontal mecanizada de la pieza queda ubicada en $Z = z_{\text{corte}}$.
  - El perfil restante conserva su geometría original en $[-L, z_{\text{corte}}]$.
- **Convención didáctica de cero pieza:** En este dialecto educativo, las coordenadas del programa siguen referidas al origen de configuración inicial ($Z = 0$). La nueva cara queda en $z_{\text{corte}}$; la pieza mide ahora $L + z_{\text{corte}}$ mm de longitud útil. No se realiza desplazamiento automático de origen G54 en este incremento.

## Reglas de validación y condiciones de corte

Un movimiento lineal `G01` a $Z$ constante (`from.z_mm == to.z_mm = z_corte`) es un refrentado válido si:

1. **Monotonicidad radial hacia el centro:**
   - La herramienta avanza hacia el eje: `from.r_mm > to.r_mm`.
2. **Refrentado completo (pasante):**
   - El movimiento finaliza exactamente en el eje: `to.r_mm == 0.0` ($X = 0$).
   - Cortes radiales parciales que no alcancen el centro (`to.r_mm > 0.0`) no están soportados y se diagnostican con `UNSUPPORTED_PROFILE_CUT`.
3. **Inicio fuera del material:**
   - Sea $R_{\text{max}}$ el radio máximo de material existente en $[z_{\text{corte}}, 0]$.
   - El punto inicial debe encontrarse en o fuera de la superficie del material: `from.r_mm >= R_max` (sujeto a la tolerancia numérica de guarda `checked_difference`).
   - Si la herramienta intenta arrancar desde un radio inferior a $R_{\text{max}}$ estando en material sólido, se congela antes del bloque con `UNSUPPORTED_PROFILE_CUT`.
4. **Condiciones de husillo:**
   - Si el refrentado retira material existente ($R_{\text{max}} > 0$), exige husillo encendido (`M03`/`M04`) y $S > 0$. De lo contrario, congela con `SPINDLE_OFF`.
   - Si en $[z_{\text{corte}}, 0]$ ya no había material (pasada en el aire o repetición en zona ya refrentada), no modifica el perfil ni exige husillo.
5. **Límites axiales del material:**
   - $-L < z_{\text{corte}} \le 0$. Si $z_{\text{corte}} \le -L$, se rechaza por superar la longitud del material.

## Geometría y modelo en `LinearProfile`

La operación pura `face_to(z_cut)` sobre `LinearProfile`:
1. Mantiene inalterados todos los tramos con $z_{\text{end}} \le z_{\text{corte}}$.
2. Para tramos que cruzan $z_{\text{corte}}$, recorta la porción retenida $[z_{\text{start}}, z_{\text{corte}}]$ y genera un tramo de radio cero $[z_{\text{corte}}, z_{\text{end}}]$.
3. Para tramos estrictamente por delante de $z_{\text{corte}}$ ($z_{\text{start}} \ge z_{\text{corte}}$), asigna radio cero.
4. La función `push()` fusiona automáticamente todos los tramos de radio cero contiguos en un único intervalo $[z_{\text{corte}}, 0]$ de radio $0.0$.
5. El volumen 3D analítico se actualiza deduciendo exactamente el cilindro (o tronco de cono) retirado:
   $$\Delta V = \pi \int_{z_{\text{corte}}}^0 r(z)^2 \, dz$$

## Integración en la interfaz

- **Explicación didáctica (`explain.ts`):** Un movimiento G01 con $Z$ constante hacia $X0$ se identifica explícitamente como "Refrentado frontal", detallando la profundidad de pasada y la cota de la nueva cara.
- **Vista 2D (`LatheViewport` / `profilePathV2`):** El tramo de radio cero no genera polígono de material (el material termina nítidamente en $z_{\text{corte}}$). El contorno original de la pieza en línea de trazos muestra la cara previa en $Z=0$.
- **Vista 3D (`revolutionMeshV2`):** Genera la tapa frontal circular en $Z = z_{\text{corte}}$ con normal axial hacia $+Z$, y el volumen calculado descuenta la porción refrentada.


## Contacto y repetición

max_radius_in considera únicamente solapamientos axiales de longitud positiva. Un tramo retenido que solo toca z_corte por su frontera no cuenta como material por retirar delante de la cara. Así, repetir exactamente una cara mecanizada o recorrer Z0 no exige husillo ni cambia volumen; profundizar hacia material existente sí lo exige.
