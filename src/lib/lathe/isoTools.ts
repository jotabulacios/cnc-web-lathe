import type { ToolId } from './contract.ts';
import { TOOL_ASSEMBLIES, type AssemblyMap } from './toolAssemblies.ts';
import { isoAssembly, parseHolderDesignation, parseInsertDesignation, type IsoResult, type IsoToolAssembly } from './isoDesignation.ts';

/** ISO 1832 insert + ISO 5608 holder chosen per station. Display geometry only:
 * it never reaches the engine. Its nose radius is offered, never applied silently. */
export type IsoChoice = { insert: string; holder: string };
export type IsoTools = Partial<Record<ToolId, IsoChoice>>;
/** Stations the ISO builder supports: right-hand external longitudinal turning. */
export const ISO_STATIONS: readonly ToolId[] = ['generic-od', 'roughing-od', 'finishing-od'];

export function resolveIsoChoice(toolId: ToolId, choice: IsoChoice): IsoResult<IsoToolAssembly> {
  const insert = parseInsertDesignation(choice.insert);
  if (!insert.ok) return insert;
  const holder = parseHolderDesignation(choice.holder);
  if (!holder.ok) return holder;
  return isoAssembly(insert.value, holder.value, { id: toolId });
}

/** Educational assemblies with valid ISO choices swapped in. Blank rows are ignored. */
export function resolveAssemblies(isoTools: IsoTools | undefined): { assemblies: AssemblyMap; results: Partial<Record<ToolId, IsoResult<IsoToolAssembly>>> } {
  const assemblies: AssemblyMap = { ...TOOL_ASSEMBLIES };
  const results: Partial<Record<ToolId, IsoResult<IsoToolAssembly>>> = {};
  for (const toolId of ISO_STATIONS) {
    const choice = isoTools?.[toolId];
    if (!choice || (!choice.insert.trim() && !choice.holder.trim())) continue;
    const result = resolveIsoChoice(toolId, choice);
    results[toolId] = result;
    if (result.ok) assemblies[toolId] = result.value;
  }
  return { assemblies, results };
}
