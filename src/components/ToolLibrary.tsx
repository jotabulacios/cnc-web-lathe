import type { ToolId } from '../lib/lathe/contract';
import { TOOL_CATALOGUE, getToolDefinition } from '../lib/lathe/tools';
import LatheToolGlyph from './LatheToolGlyph';
import { assemblyBounds, TOOL_ASSEMBLIES, type AssemblyMap } from '../lib/lathe/toolAssemblies';

type Props = { initialToolId: ToolId; activeToolId: string; onSelect: (id: ToolId) => void; assemblies?: AssemblyMap };
export default function ToolLibrary({ initialToolId, activeToolId, onSelect, assemblies = TOOL_ASSEMBLIES }: Props) {
  return <details className="tool-library" open>
    <summary>Herramientas T0–T5 · elegir inicial</summary>
    <div className="tool-cards" role="group" aria-label="Elegir herramienta inicial">
      {Object.values(TOOL_CATALOGUE).sort((a, b) => a.station - b.station).map(tool => {
        const bounds = assemblyBounds(assemblies[tool.id]);
        return <button type="button" key={tool.id}
        aria-label={`Usar T${tool.station} como herramienta inicial: ${tool.name}`}
        aria-pressed={initialToolId === tool.id} data-active={activeToolId === tool.id}
        onClick={() => { if (initialToolId !== tool.id) onSelect(tool.id); }}>
        <svg viewBox={`${bounds.minZ - 3} ${-bounds.maxR - 3} ${bounds.maxZ - bounds.minZ + 6} ${bounds.maxR - bounds.minR + 6}`} aria-hidden="true"><LatheToolGlyph tool={tool} assembly={assemblies[tool.id]}/><circle r="2" fill="#fff5df" stroke="#9b7538" strokeWidth="0.6"/></svg>
        <strong>T{tool.station}</strong><span>{tool.shortName}</span>
        <small>{activeToolId === tool.id ? 'En la punta' : initialToolId === tool.id ? 'Inicial' : tool.code}</small>
      </button>; })}
    </div>
    <p data-testid="active-tool-dimensions">Conjunto activo: {assemblies[getToolDefinition(activeToolId).id].dimensions}.</p>
    <p>Elegir otra herramienta inicial reinicia la ejecución; volvé a interpretar. Los bloques T cambian la herramienta desde su paso. Conjuntos de diseño educativo en mm o, si cargás una designación ISO, nominales ISO; nunca datos de fabricante. El corte usa la punta ideal o el radio de punta de la tabla de correctores (pestaña Pieza); no hay remoción por ancho ni colisiones del porta.</p>
  </details>;
}
