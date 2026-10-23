# Procedencia del código reutilizado

Este es un proyecto independiente: no un fork sincronizado de CNC Simulator Pro.

| Archivo local | Fuente | Commit | Cambios |
|---|---|---|---|
| `src/components/GCodeEditor.tsx` | [rudra496/cnc — src/components/cnc/GCodeEditor.tsx](https://github.com/rudra496/cnc/blob/b59fefb5043ce53ddd3adf34079398838a69729d/src/components/cnc/GCodeEditor.tsx) | b59fefb5043ce53ddd3adf34079398838a69729d | Props en lugar de Zustand, sin seek al editar, estilos CSS propios, etiquetas accesibles, colores U/W, corrección de claves de resaltado y seguimiento automático de línea y navegación por diagnósticos Rust y conservación de selección de diagnóstico al redimensionar el editor |

Copyright (c) 2026 Rudra Sarker. Se preserva íntegra la licencia MIT original en `licenses/rudra496-cnc.MIT.txt`. Ese archivo debe acompañar redistribuciones del componente, junto con este aviso. El motor Rust, contrato, reproducción y pantalla del laboratorio son implementaciones nuevas; no se copió el parser ni el motor de remoción de fresado.

Las dependencias de Cargo y pnpm tienen sus propias licencias; los lockfiles registran sus versiones. No se incorporaron catálogos de fabricantes ni assets remotos del simulador original.


Three.js 0.186.1 y OrbitControls se usan como dependencia de render de la vista 3D, bajo MIT. Se incluye su licencia íntegra en licenses/three.MIT.txt y public/licenses/three-MIT.txt para la distribución estática. No aportan semántica de interpretación CNC.
