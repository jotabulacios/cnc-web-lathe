import type { ToolId } from '../lib/lathe/contract';
import { ISO_STATIONS, type IsoTools } from '../lib/lathe/isoTools';
import type { IsoResult, IsoToolAssembly } from '../lib/lathe/isoDesignation';
import { TOOL_CATALOGUE } from '../lib/lathe/tools';

/** Per-station ISO designations (display geometry). The nose radius is only
 * applied to the cutting model when the user copies it to the offset table. */
export default function IsoToolsEditor({ isoTools, results, onChange, onUseNoseRadius }: {
  isoTools: IsoTools | undefined;
  results: Partial<Record<ToolId, IsoResult<IsoToolAssembly>>>;
  onChange: (next: IsoTools) => void;
  onUseNoseRadius: (toolId: ToolId, radiusMm: number) => void;
}) {
  const set = (toolId: ToolId, field: 'insert' | 'holder', value: string) =>
    onChange({ ...isoTools, [toolId]: { insert: '', holder: '', ...isoTools?.[toolId], [field]: value } });
  return <details className="iso-tools" open={Object.keys(results).length > 0 ? true : undefined}>
    <summary>Herramientas ISO (nominales)</summary>
    <p>Escribí la designación ISO 1832 del inserto (p. ej. <code>CNMG 120408</code>) y la ISO 5608 del porta (p. ej. <code>PCLNR 2020K12</code>) para cilindrado exterior a derecha. El dibujo pasa a usar los valores nominales que codifica la norma; las cotas no normalizadas son didácticas. No son datos de fabricante y no cambian el corte, salvo que copies el radio de punta a la tabla de correctores.</p>
    {ISO_STATIONS.map(toolId => {
      const tool = TOOL_CATALOGUE[toolId];
      const choice = isoTools?.[toolId];
      const result = results[toolId];
      return <fieldset key={toolId} className="iso-row" data-testid={`iso-${toolId}`} data-state={!result ? 'empty' : result.ok ? 'valid' : 'invalid'}>
        <legend>T{tool.station} · {tool.shortName}</legend>
        <label>Inserto ISO 1832<input value={choice?.insert ?? ''} placeholder="CNMG 120408" autoComplete="off" spellCheck={false}
          aria-label={`T${tool.station} inserto ISO`} onChange={event => set(toolId, 'insert', event.target.value)}/></label>
        <label>Porta ISO 5608<input value={choice?.holder ?? ''} placeholder="PCLNR 2020K12" autoComplete="off" spellCheck={false}
          aria-label={`T${tool.station} porta ISO`} onChange={event => set(toolId, 'holder', event.target.value)}/></label>
        {result && (result.ok
          ? <p className="iso-status ok">{result.value.dimensions}. <button type="button" className="quiet-button" disabled={result.value.noseRadiusMm === 0}
              onClick={() => onUseNoseRadius(toolId, result.value.noseRadiusMm)}>Usar rε {result.value.noseRadiusMm.toLocaleString('es-AR')} mm en correctores</button></p>
          : <p className="iso-status field-error" role="alert">{result.error.message}</p>)}
      </fieldset>;
    })}
  </details>;
}
