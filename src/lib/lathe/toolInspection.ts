import type { ToolId } from './contract.ts';
import { getToolDefinition } from './tools.ts';
import { assemblyBounds, partOutline, TOOL_ASSEMBLIES, type DisplayAssembly, type ToolPart } from './toolAssemblies.ts';

/** Inspector state is local presentation: it never feeds setup, cursor or execution. */
export type InspectorSelection = 'active' | ToolId;

export function inspectedToolId(selection: InspectorSelection, activeToolId: string | null | undefined): ToolId {
  return selection === 'active' ? getToolDefinition(activeToolId).id : selection;
}

export type Extent = { min: number; max: number };
const extent = (values: number[]): Extent => ({ min: Math.min(...values), max: Math.max(...values) });
export const span = (e: Extent) => e.max - e.min;

function tangentialExtent(part: ToolPart): Extent {
  const half = (part.kind === 'prism' ? part.thicknessMm : part.diameterMm) / 2;
  return { min: part.tangentialCenterMm - half, max: part.tangentialCenterMm + half };
}

const roleLabel = { insert: 'Inserto', holder: 'Porta / cuerpo', clamp: 'Abrazadera' } as const;

/** Bounding measures of the displayed educational assembly, in mm, relative to the ideal corner. */
export function assemblyMeasures(tool: ToolId | DisplayAssembly) {
  const assembly = typeof tool === 'string' ? TOOL_ASSEMBLIES[tool] : tool;
  const bounds = assemblyBounds(assembly);
  const tangential = assembly.parts.map(tangentialExtent);
  return {
    axial: { min: bounds.minZ, max: bounds.maxZ },
    radial: { min: bounds.minR, max: bounds.maxR },
    tangential: extent(tangential.flatMap(t => [t.min, t.max])),
    parts: assembly.parts.map((part, i) => {
      const outline = partOutline(part);
      return {
        role: part.role, label: roleLabel[part.role], shape: part.kind === 'prism' ? 'Prisma extruido' : 'Barra cilíndrica axial',
        axial: extent(outline.map(p => p[0])), radial: extent(outline.map(p => p[1])), tangential: tangential[i],
      };
    }),
  };
}
