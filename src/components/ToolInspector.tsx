'use client';

import { useState } from 'react';
import { toolIdSchema } from '../lib/lathe/contract';
import { TOOL_CATALOGUE } from '../lib/lathe/tools';
import { TOOL_ASSEMBLIES, type AssemblyMap } from '../lib/lathe/toolAssemblies';
import { assemblyMeasures, inspectedToolId, span, type Extent, type InspectorSelection } from '../lib/lathe/toolInspection';
import LatheToolGlyph from './LatheToolGlyph';
import ToolPreview from './ToolPreview';

const mm = (n: number) => (Math.round(n * 100) / 100).toLocaleString('es-AR', { maximumFractionDigits: 2, useGrouping: false });
const range = (e: Extent) => `${mm(e.min)} … ${mm(e.max)}`;

/** Local study panel. Selecting here never changes the initial tool, setup, program or cursor. */
export default function ToolInspector({ activeToolId, assemblies = TOOL_ASSEMBLIES }: { activeToolId: string; assemblies?: AssemblyMap }) {
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<InspectorSelection>('active');
  const toolId = inspectedToolId(selection, activeToolId);
  const tool = TOOL_CATALOGUE[toolId];
  const assembly = assemblies[toolId];
  const measures = assemblyMeasures(assembly);
  const { axial: z, radial: r } = measures;
  // SVG: x=Z, y=−R, units mm. u ≈ constant on-screen size for a ~1.65:1 frame, so labels
  // read alike for tall shanks and long bars. Margin leaves room for dimensions and axes.
  const u = Math.max(span(z) / 1.65, span(r)) / 45;
  const minX = Math.min(z.min, 0) - 10 * u, maxX = Math.max(z.max, 0) + 6 * u;
  const minY = -Math.max(r.max, 0) - 6 * u, maxY = -Math.min(r.min, 0) + 10 * u;
  const dimY = -Math.min(r.min, 0) + 5 * u, dimX = Math.min(z.min, 0) - 5 * u;

  return <details className="tool-inspector" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Inspector de herramienta · sin cambiar la ejecución</summary>
    {open && <div className="tool-inspector-body" data-testid="tool-inspector" data-tool-id={toolId} data-following-active={selection === 'active'}>
      <div className="tool-inspector-head">
        <label htmlFor="inspector-tool">Herramienta a inspeccionar</label>
        <select id="inspector-tool" value={selection} onChange={event => {
          const parsed = toolIdSchema.safeParse(event.target.value);
          setSelection(parsed.success ? parsed.data : 'active');
        }}>
          <option value="active">Seguir la herramienta activa (T{TOOL_CATALOGUE[inspectedToolId('active', activeToolId)].station})</option>
          {Object.values(TOOL_CATALOGUE).sort((a, b) => a.station - b.station).map(t => <option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}
        </select>
        <p data-testid="inspector-title"><strong>T{tool.station} · {tool.name}</strong> <span>{tool.code}</span>{selection === 'active' ? ' · activa en la punta' : ' · solo inspección local'}</p>
      </div>
      <div className="tool-inspector-views">
        <figure>
          <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} role="img" aria-label={`Silueta longitudinal Z/R de T${tool.station} en mm`} data-testid="inspector-silhouette">
            <g stroke="#c3ccd5" strokeWidth="1" vectorEffect="non-scaling-stroke">
              <line x1={minX} y1={0} x2={maxX} y2={0} vectorEffect="non-scaling-stroke"/>
              <line x1={0} y1={minY} x2={0} y2={maxY} vectorEffect="non-scaling-stroke"/>
            </g>
            <LatheToolGlyph tool={tool} assembly={assembly}/>
            <g stroke="#4b5866" strokeWidth="1" fill="none">
              <path d={`M${z.min} ${dimY}H${z.max}M${z.min} ${dimY - u}v${2 * u}M${z.max} ${dimY - u}v${2 * u}`} vectorEffect="non-scaling-stroke"/>
              <path d={`M${dimX} ${-r.max}V${-r.min}M${dimX - u} ${-r.max}h${2 * u}M${dimX - u} ${-r.min}h${2 * u}`} vectorEffect="non-scaling-stroke"/>
            </g>
            <g fill="#2f3c49" fontSize={2.6 * u} fontFamily="ui-monospace,monospace">
              <text x={(z.min + z.max) / 2} y={dimY + 3.5 * u} textAnchor="middle">{mm(span(z))} mm (Z)</text>
              <text x={dimX - 1.5 * u} y={-(r.min + r.max) / 2} textAnchor="middle" transform={`rotate(-90 ${dimX - 1.5 * u} ${-(r.min + r.max) / 2})`}>{mm(span(r))} mm (R)</text>
              <text x={maxX - u} y={-u} textAnchor="end">Z+</text>
              <text x={u} y={minY + 3 * u}>R+</text>
            </g>
            <circle r={1.1 * u} fill="#fff5df" stroke="#9b7538" strokeWidth={0.3 * u} data-testid="inspector-origin"/>
          </svg>
          <figcaption>Proyección Z/R a escala real del conjunto. El punto claro es la esquina ideal Z0/R0 <em>local</em>: no es una posición de máquina.</figcaption>
        </figure>
        <figure><ToolPreview toolId={toolId} assembly={assembly}/><figcaption>Vista ortográfica aislada en mm. Ejes de 10 mm en la esquina ideal: rojo Z+, verde R+, azul tangencial.</figcaption></figure>
      </div>
      <table className="tool-inspector-table">
        <caption>Medidas del conjunto en mm, relativas a la esquina ideal</caption>
        <thead><tr><th>Parte</th><th>Forma</th><th>Z (mm)</th><th>R (mm)</th><th>Tangencial (mm)</th></tr></thead>
        <tbody>
          {measures.parts.map((part, i) => <tr key={i}><th scope="row">{part.label}</th><td>{part.shape}</td><td>{range(part.axial)}</td><td>{range(part.radial)}</td><td>{range(part.tangential)}</td></tr>)}
          <tr data-testid="inspector-overall"><th scope="row">Conjunto</th><td>Envolvente</td><td>{mm(span(z))}</td><td>{mm(span(r))}</td><td>{mm(span(measures.tangential))}</td></tr>
        </tbody>
      </table>
      <p data-testid="inspector-provenance">{assembly.provenance === 'iso-nominal'
        ? <>{assembly.dimensions}. Procedencia: valores nominales derivados de las designaciones ISO 1832 (inserto) e ISO 5608 (porta); las cotas que la norma no fija son didácticas. No son datos de ningún fabricante.</>
        : <>{assembly.dimensions}. Ángulo de punta {tool.geometry.insertAngleDeg}°. Procedencia: diseño educativo propio, sin datos de fabricante ni norma.</>} El corte usa la punta ideal o el radio de punta de la tabla de correctores; estas medidas no definen colisiones ni alcance.</p>
    </div>}
  </details>;
}
