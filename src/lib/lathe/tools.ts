import type { ToolId } from './contract.ts';

export interface ToolDefinition {
  id: ToolId;
  station: number;
  code: string;
  name: string;
  shortName: string;
  description: string;
  geometry: {
    insertAngleDeg: number;
    color: string;
    strokeColor: string;
    type: 'rhombic-80' | 'rhombic-55' | 'grooving' | 'trigon-80' | 'neutral';
  };
}

export const TOOL_CATALOGUE: Record<ToolId, ToolDefinition> = {
  'generic-od': {
    id: 'generic-od',
    station: 0,
    code: 'T0 / T0000',
    name: 'Herramienta neutra exterior',
    shortName: 'Neutra (ideal)',
    description: 'Punta ideal educativa sin compensación de radio ni restricciones de desahogo.',
    geometry: {
      insertAngleDeg: 80,
      color: '#f3c880',
      strokeColor: '#ffe4b4',
      type: 'neutral',
    },
  },
  'roughing-od': {
    id: 'roughing-od',
    station: 1,
    code: 'T0101',
    name: 'Desbaste exterior',
    shortName: 'Desbaste (80°)',
    description: 'Inserto romboidal de 80° para pasadas longitudinales de volumen y conos exteriores.',
    geometry: {
      insertAngleDeg: 80,
      color: '#f3b458',
      strokeColor: '#ffde9e',
      type: 'rhombic-80',
    },
  },
  'finishing-od': {
    id: 'finishing-od',
    station: 2,
    code: 'T0202',
    name: 'Acabado exterior',
    shortName: 'Acabado (55°)',
    description: 'Inserto romboidal agudo de 55° para perfiles finos, conos pronunciados y desahogo.',
    geometry: {
      insertAngleDeg: 55,
      color: '#55c9ea',
      strokeColor: '#a8ebff',
      type: 'rhombic-55',
    },
  },
  'grooving-od': {
    id: 'grooving-od',
    station: 3,
    code: 'T0303',
    name: 'Ranurado y tronzado',
    shortName: 'Ranurado (3 mm)',
    description: 'Cuchilla educativa de 3 mm de ancho visual; el motor sigue cortando con una punta ideal, sin remoción por ancho.',
    geometry: {
      insertAngleDeg: 90,
      color: '#e67347',
      strokeColor: '#ffad8a',
      type: 'grooving',
    },
  },
  'boring-id': {
    id: 'boring-id', station: 5, code: 'T0505',
    name: 'Mandrinado interior', shortName: 'Mandrinado (ideal)',
    description: 'Punta interior educativa para ampliar un agujero existente; sin taladrado ni geometría física de la barra.',
    geometry: { insertAngleDeg: 55, color: '#82dca8', strokeColor: '#c4f6d8', type: 'rhombic-55' },
  },
  'facing-od': {
    id: 'facing-od',
    station: 4,
    code: 'T0404',
    name: 'Refrentado frontal',
    shortName: 'Refrentado (80°)',
    description: 'Inserto triangular educativo de punta 80° para la representación frontal; sin referencia de fabricante.',
    geometry: {
      insertAngleDeg: 80,
      color: '#c285e8',
      strokeColor: '#e7c2ff',
      type: 'trigon-80',
    },
  },
};

export function getToolDefinition(id: ToolId | string | null | undefined): ToolDefinition {
  if (id && id in TOOL_CATALOGUE) {
    return TOOL_CATALOGUE[id as ToolId];
  }
  return TOOL_CATALOGUE['generic-od'];
}
