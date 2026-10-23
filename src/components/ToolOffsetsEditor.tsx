import type { ToolId } from '../lib/lathe/contract';
import { OFFSET_FIELDS, offsetErrorKey, type OffsetDraft, type OffsetField, type OffsetsDraft, type SetupErrors } from '../lib/lathe/setup';
import { TOOL_CATALOGUE } from '../lib/lathe/tools';

const labels: Record<OffsetField, string> = {
  calibrationErrorX: 'Error de reglaje X (Ø)', calibrationErrorZ: 'Error de reglaje Z',
  wearX: 'Desgaste X (Ø)', wearZ: 'Desgaste Z', noseRadius: 'Radio de punta R',
};
const zero: OffsetDraft = { calibrationErrorX: '0', calibrationErrorZ: '0', wearX: '0', wearZ: '0', noseRadius: '0' };

/** Static per-station table. Editing it is a setup change: it invalidates the run like any other field. */
export default function ToolOffsetsEditor({ offsets, errors, onChange }: {
  offsets: OffsetsDraft | undefined; errors: SetupErrors; onChange: (offsets: OffsetsDraft) => void;
}) {
  const tools = Object.values(TOOL_CATALOGUE).sort((a, b) => a.station - b.station);
  const active = tools.filter(tool => Object.values(offsets?.[tool.id] ?? zero).some(v => Number(v.replace(',', '.')) !== 0)).length;
  function change(toolId: ToolId, field: OffsetField, value: string) {
    onChange({ ...offsets, [toolId]: { ...(offsets?.[toolId] ?? zero), [field]: value } });
  }
  return <details className="offsets-editor" open={offsets !== undefined && active > 0 ? true : undefined}>
    <summary>Correctores de herramienta {active > 0 ? `· ${active} con valores` : '· todos en 0'}</summary>
    <p>Tabla educativa por estación (T0101 usa la fila de T1). X en diámetro, como en el programa. Valores positivos alejan la punta: diámetro o Z mayores. La punta física es el punto programado + error de reglaje + desgaste. Un T no mueve la herramienta: el corrector se aplica con el movimiento siguiente. El DRO sigue mostrando lo programado. El radio de punta R (en radio, 0 a 5 mm) hace que la nariz redonda deje acuerdos en las esquinas y error de forma en conos y arcos; G41/G42 lo compensan en tramos rectos.</p>
    <div className="offsets-table-wrap"><table className="offsets-table">
      <caption>Correctores en mm</caption>
      <thead><tr><th scope="col">Herramienta</th>{OFFSET_FIELDS.map(field => <th scope="col" key={field}>{labels[field]}</th>)}</tr></thead>
      <tbody>{tools.map(tool => <tr key={tool.id}>
        <th scope="row">T{tool.station} <small>{tool.shortName}</small></th>
        {OFFSET_FIELDS.map(field => {
          const error = errors[offsetErrorKey(tool.id, field)];
          return <td key={field}>
            <input value={offsets?.[tool.id]?.[field] ?? '0'} inputMode="decimal" autoComplete="off"
              aria-label={`T${tool.station} ${labels[field]}`} aria-invalid={Boolean(error)}
              onChange={event => change(tool.id, field, event.target.value)}/>
            {error && <span className="field-error" role="alert">{error}</span>}
          </td>;
        })}
      </tr>)}</tbody>
    </table></div>
  </details>;
}
