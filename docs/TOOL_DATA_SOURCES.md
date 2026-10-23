# Fuentes de datos dimensionales de herramientas — investigación 22/10/2026

Investigación hecha por un agente de solo lectura, a pedido del usuario («¿podemos sacar medidas de Sandvik?»). No es asesoría legal. No se descargó ni incorporó ningún dato de fabricante.

## Sandvik Coromant

- Publica datos ISO 13399 empaquetados como GTC (Generic Tool Catalog), gratis con cuenta web: https://sandvik.coromant.com/en-gb/tools/tool-data · formato del paquete: https://www.sandvik.coromant.com/tr-tr/support/coroplus-tool-library-support/export-gtc-package
- Las páginas de producto tienen tablas y CAD 2D/3D. No se revisó la licencia específica de las descargas CAD. No se encontró una API pública documentada.
- Aviso legal (https://www.sandvik.coromant.com/en-gb/legal-notice): «You may download this data for internal use that does not include compiling and/or distributing the data to third parties». El uso comercial requiere un compromiso firmado. Las marcas (SANDVIK COROMANT, COROMANT, T-MAX…) necesitan permiso escrito.
- Conclusión práctica: incorporar al repo público (MIT) tablas, paquetes GTC o modelos STEP/DXF de Sandvik parece incompatible con «no distribuir a terceros».

## Alternativas

- **ISO 1832 (insertos):** la designación codifica parámetros nominales comunes a todos los fabricantes. Por ejemplo, CNMG 120408: rombo de 80°, incidencia 0°, IC 12,7, espesor 4,76 y radio de punta 0,8. El texto de la norma tiene copyright y no se copia.
- **ISO 5608 (portaherramientas):** por ejemplo, PCLNR 2020K12: sujeción por palanca, inserto de 80°, κr 95°, mano derecha, mango 20×20, largo K = 125 mm. La longitud de cabeza y el offset f varían según el fabricante: quedarían como parámetros didácticos editables. ISO 5610 define dimensiones normalizadas, pero es de pago.
- **Datasets abiertos:** FreeCAD CAM (LGPL) está orientado a fresado. No se encontró un dataset con licencia permisiva para portaherramientas de torno.

## Recomendación

1. **A (recomendada):** generar los conjuntos desde designaciones ISO 1832/5608, rotulados «nominal ISO, no datos de fabricante», con las cotas no normalizadas editables.
2. **B:** importador local de ISO 13399/GTC en el navegador del usuario, sin subir ni guardar datos en el repo. El usuario es responsable de los términos de su proveedor. Necesita confirmación legal o de Sandvik.
3. **C:** permiso escrito de Sandvik para un subconjunto. Es lento e incierto bajo MIT.

Evitar: copiar tablas o CAD de fabricantes al repo o a fixtures, usar marcas o logos, sugerir equivalencia con productos reales, y hacer scraping o descargas automatizadas con login.
