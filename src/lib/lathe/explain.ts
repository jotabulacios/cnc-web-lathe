import type { CompileResult } from './contract.ts';
import { getToolDefinition } from './tools.ts';

type Block = CompileResult['blocks'][number];
type Explanation = { title: string; description: string; details: string[] };
const format = (value: number) => Number(value.toFixed(6)).toString();
const degrees = (radians: number) => `${format(radians * 180 / Math.PI)}°`;
type Motion = Block['afterState']['motion'];
export const motionLabel = (motion: Motion) => motion === 'rapid' ? 'G00 (rápido)'
  : motion === 'linear' ? 'G01 (lineal)'
  : motion === 'arc-cw' ? 'G02 (arco horario)'
  : motion === 'arc-ccw' ? 'G03 (arco antihorario)'
  : 'sin modo de movimiento';
export const motionShortLabel = (motion: Motion) => motion === 'rapid' ? 'G00 · Rápido'
  : motion === 'linear' ? 'G01 · Lineal'
  : motion === 'arc-cw' ? 'G02 · Arco horario'
  : motion === 'arc-ccw' ? 'G03 · Arco antihorario'
  : 'Sin movimiento seleccionado';

/** Describes the engine's resolved snapshots; it never interprets source text. */
export function explainBlock(block: Block | null, motions: CompileResult['motions'] = []): Explanation {
  if (!block) return {
    title: 'Listo para aprender',
    description: 'Interpretá el programa y elegí Siguiente bloque para recorrerlo paso a paso.',
    details: ['X se muestra en diámetro; Z y el desplazamiento radial se expresan en milímetros.'],
  };

  const before = block.beforeState;
  const after = block.afterState;
  const details: string[] = [];
  if (before.feedMmMin !== after.feedMmMin) details.push(after.feedMmMin === null
    ? 'El avance modal queda sin definir.'
    : `Avance modal F: ${format(after.feedMmMin)} mm/min.`);
  if (before.spindleRpm !== after.spindleRpm) details.push(`Velocidad del husillo: ${format(after.spindleRpm)} rpm.`);
  if (before.spindleDirection !== after.spindleDirection) details.push(`Sentido del husillo: ${after.spindleDirection === 'cw' ? 'horario' : 'antihorario'}.`);
  if (before.spindleOn !== after.spindleOn) details.push(after.spindleOn ? 'Husillo encendido.' : 'Husillo detenido.');
  if (before.motion !== after.motion) details.push(`Modo modal seleccionado: ${motionLabel(after.motion)}.`);
  if (before.cssMMin !== after.cssMMin) details.push(after.cssMMin !== undefined
    ? `G96 · velocidad de corte constante ${format(after.cssMMin)} m/min: las rpm se recalculan con el diámetro (n = 1000·Vc/(π·D)), limitadas por G50 a ${format(after.maxRpm ?? 0)} rpm.`
    : 'G97 · rpm directas: S vuelve a indicar revoluciones por minuto.');
  if (before.maxRpm !== after.maxRpm && after.maxRpm !== undefined) details.push(`G50 · límite de husillo ${format(after.maxRpm)} rpm para G96.`);
  if (Boolean(before.feedPerRev) !== Boolean(after.feedPerRev)) details.push(after.feedPerRev
    ? 'G99 · avance por vuelta: F en mm/vuelta; la velocidad de avance real es F × rpm.'
    : 'G98 · avance por minuto: F en mm/min.');
  if (before.compensation !== after.compensation) details.push(after.compensation
    ? `Compensación de radio ${after.compensation.toUpperCase()}: la nariz queda a la ${after.compensation === 'g42' ? 'derecha' : 'izquierda'} del recorrido; se activa con este movimiento o el siguiente.`
    : 'G40: se cancela la compensación de radio con el movimiento de este bloque o el siguiente.');
  if (before.toolId !== after.toolId && after.toolId) {
    const tool = getToolDefinition(after.toolId);
    details.push(`Cambio de herramienta: ${tool.name} (${tool.code}).`);
  }

  if (block.kind === 'end' || after.ended) return {
    title: 'Fin del programa',
    description: 'La ejecución terminó. No hay más movimientos por ejecutar.',
    details,
  };

  if (block.cycle === 'roughing-setup') return {
    title: 'G71 · Parámetros de desbaste',
    description: 'Fija la profundidad por pasada (U, en radio) y la retracción (R). No mueve la herramienta: el bloque G71 siguiente usa estos valores.',
    details,
  };
  if (block.cycle === 'roughing' || block.cycle === 'finishing') {
    const own = motions.filter(item => block.motionIds.includes(item.id));
    const cuts = own.filter(item => item.kind === 'linear');
    const length = cuts.reduce((sum, item) => sum + item.lengthMm, 0);
    details.unshift(
      `El motor expandió el ciclo en ${own.length} movimientos: ${cuts.length} de corte (G01) y ${own.length - cuts.length} rápidos (G00).`,
      `Recorrido de corte total: ${format(length)} mm. Punto de inicio y regreso: X ${format(2 * after.position.rMm)} · Z ${format(after.position.zMm)}.`,
    );
    return block.cycle === 'roughing' ? {
      title: 'G71 · Ciclo de desbaste',
      description: 'Pasadas paralelas a Z hasta el perfil P…Q más la sobremedida U/W; cada una se retira a 45° y vuelve en rápido. Una pasada final sigue el contorno. Los bloques del perfil no se ejecutan acá: quedan para G70.',
      details,
    } : {
      title: 'G70 · Acabado del perfil',
      description: 'Recorre los bloques P…Q del perfil con su propio avance F y vuelve al punto de inicio. Quita la sobremedida que dejó G71.',
      details,
    };
  }

  if (block.kind === 'motion' && block.motionIds.length > 0) {
    const from = before.position;
    const to = after.position;
    const arc = motions.find(item => item.id === block.motionIds[0])?.arc ?? null;
    details.unshift(
      `X (diámetro): ${format(2 * from.rMm)} → ${format(2 * to.rMm)} mm${from.rMm === to.rMm ? ' (se mantiene)' : ''}.`,
      `Z: ${format(from.zMm)} → ${format(to.zMm)} mm${from.zMm === to.zMm ? ' (se mantiene)' : ''}.`,
      `Desplazamiento radial: ${format(to.rMm - from.rMm)} mm; variación del diámetro: ${format(2 * (to.rMm - from.rMm))} mm.`,
    );
    if (after.motion === 'linear' && from.zMm === to.zMm && from.rMm > to.rMm && to.rMm === 0) {
      details.push('Refrentado frontal: el corte radial avanza hasta el centro (X0) preparando la cara de la pieza.');
    }
    if (arc) details.push(
      `Centro del arco: X ${format(2 * arc.center.rMm)} mm (diámetro), Z ${format(arc.center.zMm)} mm.`,
      `Radio: ${format(arc.radiusMm)} mm. Barrido: ${degrees(arc.sweepRad)}. Sentido: ${arc.clockwise ? 'horario' : 'antihorario'}.`,
      'El perfil v2 aproxima el arco con tramos lineales de tolerancia acotada; el perfil v1 conserva el último bloque completo.',
    );
    details.push(after.motion === 'rapid'
      ? 'El movimiento rápido no utiliza F como velocidad de avance.'
      : after.feedMmMin === null ? 'El estado no tiene avance F definido.' : `Avance del movimiento: ${format(after.feedMmMin)} mm/min.`);
    return {
      title: after.motion === 'rapid' ? 'G00 · Movimiento rápido'
        : after.motion === 'linear' ? 'G01 · Movimiento lineal'
        : after.motion === 'arc-cw' ? 'G02 · Arco horario' : 'G03 · Arco antihorario',
      description: `La herramienta se desplaza entre las posiciones resueltas por el motor con ${motionLabel(after.motion)}.`,
      details,
    };
  }

  const changed = details.length > 0;
  if (block.kind === 'state' && before.toolId !== after.toolId && after.toolId) {
    const tool = getToolDefinition(after.toolId);
    return {
      title: `${tool.code} · Cambio de herramienta`,
      description: `Se activa ${tool.name} para los mecanizados siguientes.`,
      details,
    };
  }
  if (!changed) details.push('El dialecto educativo utiliza milímetros, el plano X/Z, X en diámetro y avance en mm/min.');
  return {
    title: 'Estado del programa',
    description: !changed
      ? 'Este bloque conserva el estado del motor y no genera desplazamiento.'
      : 'Este bloque actualiza el estado modal sin desplazar la herramienta.',
    details,
  };
}
