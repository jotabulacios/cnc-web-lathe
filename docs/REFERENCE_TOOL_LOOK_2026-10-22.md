# Referencia visual: herramientas y presentación de Amer Icon

Revisión solicitada por el usuario el22/10/2026: https://x.com/amer_icon/status/2111804281640624523/photo/1 y la segunda imagen del mismo carrusel. Se observaron ambas imágenes en el navegador; el acceso por lector web devolvió403. No se descargaron ni incorporaron assets al proyecto. Esta entrega es análisis visual, sin cambios del simulador.

## Qué se observa

- Un conjunto de mandrinado reconocible: barra cilíndrica, cabeza con recortes/asiento y plaquita diferenciada en violeta. La orientación del inserto respecto de la barra se entiende mejor que con un cilindro/prisma simples.
- Acero con reflejo longitudinal marcado y porta oscuro; color del inserto separa componentes. El contraste surge de materiales e iluminación, sin exigir texturas fotográficas.
- Escena en gris neutro con plato/mordazas. Hay controles de cámara y Ortho seleccionado. Se muestran controles de sección/cutaway y una escena recortada que permite leer zonas interiores.
- Un inspector lateral reúne lista de herramientas, parámetros, silueta2D, preview3D y puntos de referencia. Esas piezas de interfaz aportan tanta claridad como la escena grande.
- Paneles claros y densos, con controles compactos; viewport oscuro/gris, menos espacio decorativo y una organización de trabajo técnico.

Son observaciones de las capturas. No verifican precisión dimensional, procedencia CAD, algoritmo de contacto ni fiabilidad de colisiones. El texto del autor habla de su biblioteca y de falsos positivos de colisión; no proporciona aquí el método o una validación reproducible.

## Diferencias con nuestra base

La versión actual ya tiene dimensiones educativas propias compartidas entre2D/3D y familias diferenciadas. Siguen faltando asiento/cabeza de porta detallados, radio de nariz, referencia de montaje visual, inspector dedicado y sección3D. El material opaco oculta la punta de mandrinado dentro de la pieza; lo constató el QA del incremento dimensional. La cámara actual es perspectiva, mientras la referencia presenta modo ortográfico.

Nuestros conjuntos tienen geometría nominal simplificada, sin procedencia de fabricante. Añadir un asiento y una cabeza coherentes mejora la lectura visual, pero no los convierte en CAD comercial ni en un cuerpo de colisión validado.

## Dirección visual propuesta

1. **Inspector de conjunto:** herramienta activa, medidas/origen de datos, proyección longitudinal y preview3D grande, con la esquina ideal señalada. Mantenerlo separado de la posición de ejecución para estudiar el conjunto sin mover la punta.
2. **Sección3D con punta visible:** recorte de presentación del material que permita leer agujero/barra/inserto. Debe conservar volumen y perfil Rust, usar la misma posición y no interpretarse como remoción. Verificar tapa de sección, normales, huecos, restablecimiento y export bajo subruta.
3. **Cámara ortográfica opcional y materiales:** vistas alineadas y encuadre de conjunto, acero claro, porta oscuro, inserto destacado, iluminación que muestre las caras. Conservar giro/reset y fallback sinWebGL.
4. **Cabezas y asientos paramétricos:** detallar el montaje de exterior y mandrinado desde dimensiones documentadas; seguir compartiendo parámetros con la proyección2D y preservar la esquina programada. Datos de fabricante, si se incorporan, deben tener fuente/licencia comprobada.
5. **Organización visual:** agrupar edición de herramienta en un inspector; controles de transporte junto al viewport y menor peso visual del catálogo en la escena. La adopción de un tema claro es una decisión independiente; no hace falta rediseñar toda la aplicación para mejorar la lectura geométrica.

El primer candidato visual es inspector + sección3D, porque resuelve la falta actual de visibilidad interior. Las referencias y calibración siguen el plan TOOL_OFFSETS_PLAN.md; un cambio de look no debe sumar offsets al renderer ni alterar el motor.

## Pruebas antes de integrar cambios visuales futuros

El mismo programa/cursor debe conservar perfil, volumen y evaluación al cambiar sección, cámara o iluminación. El inspector debe mostrar la herramienta de ejecución y restaurarla al retroceder. Verificar que referencia de punta y medidas concuerden con el catálogo compartido en varios tamaños de stock. La sección debe mostrar el agujero sin taparlo accidentalmente y limpiar materiales/recursos al salir. Mantener acceso2D, controles accesibles y guardado sin cambios geométricos implícitos.
