'use client';

import { forwardRef, useEffect, useId, useRef, useState } from 'react';
import type { DisplayProfile } from '../lib/lathe/annularProfile';
import { buildDimensionSheet, formatDiameter, formatMm, type DimensionSheet, type Feature } from '../lib/lathe/dimensionSheet';
import type { ReferenceCheck } from '../lib/lathe/exercises';
import { profilePathV2 } from '../lib/lathe/profilePathV2';
import { profilePathV3 } from '../lib/lathe/profilePathV3';

export type SheetStock = { diameterMm: number; lengthMm: number; innerDiameterMm?: number };
type SheetProps = { profile: DisplayProfile; stock: SheetStock; fileName: string; tools: string[]; status: string; partial: boolean };

// Printable light technical palette; attributes only, so the exported file is standalone.
const ink = { outline: '#1f2a37', dim: '#1e3a5f', text: '#0f172a', muted: '#5b6774', fill: '#eef2f6', view: '#f8fafc', hatch: '#4b5866', phantom: '#94a3b8', paper: '#ffffff' };
const FONT = 13;
const FAMILY = 'Arial, Helvetica, sans-serif';
const PAD = 24;
const COL = 30;
const ROW = 26;
const SIDE = 34;
const NOTE_ROW = 20;
const MIN_WIDTH = 1100;
const textWidth = (text: string, size = FONT) => text.length * size * 0.58;

/** Largest contour radius touching `z` (a shoulder uses its outer corner). */
function radiusAtZ(features: readonly Feature[], z: number): number {
  let r = 0;
  for (const f of features) {
    if (z < f.zStartMm - 1e-9 || z > f.zEndMm + 1e-9) continue;
    const t = (z - f.zStartMm) / (f.zEndMm - f.zStartMm);
    r = Math.max(r, f.rStartMm + (f.rEndMm - f.rStartMm) * Math.min(1, Math.max(0, t)));
  }
  return r;
}

/** Pure layout: physical mm → sheet units, side columns, rows and note levels. */
function layout(sheet: DimensionSheet, stock: SheetStock) {
  const outerDims = sheet.diameters.filter(d => d.contour === 'outer');
  const right = outerDims.filter(d => d.placement === 'right').sort((a, b) => a.radiusMm - b.radiusMm);
  const left = outerDims.filter(d => d.placement === 'left').sort((a, b) => a.radiusMm - b.radiusMm);
  const below = sheet.lengths.filter(l => l.contour === 'outer');
  const above = sheet.lengths.filter(l => l.contour === 'inner');
  const length = Math.max(sheet.overallLengthMm, 1);
  const rMax = Math.max(sheet.maxRadiusMm, stock.diameterMm / 2, 1);
  const available = MIN_WIDTH - 2 * PAD - 2 * SIDE - 40 - (left.length + right.length) * COL;
  const scale = Math.min(available / length, 320 / (2 * rMax), 14);
  const drawingWidth = 2 * PAD + 2 * SIDE + 40 + (left.length + right.length) * COL + length * scale;
  const width = Math.max(MIN_WIDTH, drawingWidth);
  const x0 = (width - drawingWidth) / 2 + PAD + 20 + left.length * COL + SIDE;
  const x = (z: number) => x0 + (z - sheet.backZMm) * scale;
  // Notes: greedy levels so labels never overlap horizontally.
  const levels: [number, number][][] = [];
  const notes = sheet.notes.map(note => {
    const ax = x(note.zMm);
    const w = textWidth(note.text);
    const toRight = ax + 10 + w < width - PAD;
    const lx = toRight ? ax + 10 : ax - 10 - w;
    let level = levels.findIndex(row => row.every(([a, b]) => lx + w + 12 < a || lx > b + 12));
    if (level < 0) { level = levels.length; levels.push([]); }
    levels[level].push([lx, lx + w]);
    return { note, ax, lx, w, level, toRight };
  });
  const headerBottom = PAD + 30;
  const innerTop = headerBottom + 12 + above.length * ROW;
  const partTop = innerTop + 18 + levels.length * NOTE_ROW + 16;
  const cy = partTop + rMax * scale;
  const y = (r: number) => cy - r * scale;
  const partBottom = cy + rMax * scale;
  const rowsBottom = partBottom + 30 + below.length * ROW;
  const titleTop = rowsBottom + 18;
  const height = titleTop + 96 + PAD;
  const partRight = x(sheet.frontZMm);
  return { scale, width, height, x, y, cy, partTop, partBottom, innerTop, titleTop, right, left, below, above, notes, partRight, partLeft: x(sheet.backZMm) };
}

/** Side view, upper half sectioned. Exported as-is by "Descargar SVG". */
export const DimensionSheetDrawing = forwardRef<SVGSVGElement, SheetProps>(function DimensionSheetDrawing({ profile, stock, fileName, tools, status, partial }, ref) {
  const uid = useId().replace(/:/g, '');
  const sheet = buildDimensionSheet(profile);
  if (!sheet) return <p className="sheet-empty" role="status">El perfil actual no tiene material para acotar.</p>;
  const L = layout(sheet, stock);
  const { x, y, cy } = L;
  // Gap rows (no material) collapse to radius 0 so each path splits into material runs.
  const rows = profile.profileVersion === 3
    ? profile.spans.map(s => ({ zStartMm: s.zStartMm, zEndMm: s.zEndMm, gap: s.innerStartMm === s.outerStartMm && s.innerEndMm === s.outerEndMm, o: [s.outerStartMm, s.outerEndMm], i: [s.innerStartMm, s.innerEndMm] }))
    : profile.spans.map(s => ({ zStartMm: s.zStartMm, zEndMm: s.zEndMm, gap: false, o: [s.rStartMm, s.rEndMm], i: [0, 0] }));
  const outerPath = profilePathV2(rows.map(r => ({ zStartMm: r.zStartMm, zEndMm: r.zEndMm, rStartMm: r.gap ? 0 : r.o[0], rEndMm: r.gap ? 0 : r.o[1] })), x, y);
  const sectionPath = profile.profileVersion === 3 ? profilePathV3(profile.spans, x, y) : outerPath;
  const hiddenBore = profile.profileVersion === 3
    ? profilePathV2(rows.map(r => ({ zStartMm: r.zStartMm, zEndMm: r.zEndMm, rStartMm: r.gap ? 0 : r.i[0], rEndMm: r.gap ? 0 : r.i[1] })), x, y) : '';
  const stockR = stock.diameterMm / 2;
  const arrow = `${uid}-arrow`;
  const dimLine = { stroke: ink.dim, strokeWidth: 0.9, markerStart: `url(#${arrow})`, markerEnd: `url(#${arrow})` };
  const ext = { stroke: ink.dim, strokeWidth: 0.6 };
  const label = { fontFamily: FAMILY, fontSize: FONT, fill: ink.text };
  const halo = { stroke: ink.paper, strokeWidth: 4, paintOrder: 'stroke' as const, strokeLinejoin: 'round' as const };
  const stockText = `${formatDiameter(stock.diameterMm)} × ${formatMm(stock.lengthMm)} mm${(stock.innerDiameterMm ?? 0) > 0 ? ` · interior ${formatDiameter(stock.innerDiameterMm!)}` : ''}`;
  const description = `Vista lateral con medio corte. Largo total ${formatMm(sheet.overallLengthMm)} mm. Diámetros: ${sheet.diameters.map(d => d.text).join(', ')}. Longitudes desde la cara frontal: ${sheet.lengths.map(l => l.text).join(', ')} mm.${sheet.notes.length ? ` ${sheet.notes.map(n => n.text).join('. ')}.` : ''}`;
  return <svg ref={ref} xmlns="http://www.w3.org/2000/svg" className="dimension-sheet-svg" viewBox={`0 0 ${L.width} ${L.height}`} width={L.width} height={L.height}
    role="img" aria-labelledby={`${uid}-title ${uid}-desc`} data-partial={partial} style={{ display: 'block', width: '100%', height: 'auto', background: ink.paper }}>
    <title id={`${uid}-title`}>Hoja de cotas</title>
    <desc id={`${uid}-desc`}>{description}</desc>
    <defs>
      <marker id={arrow} viewBox="0 0 10 10" refX="10" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0 1.5 L10 5 L0 8.5 Z" fill={ink.dim}/></marker>
      <pattern id={`${uid}-hatch`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" x2="0" y1="0" y2="8" stroke={ink.hatch} strokeWidth="0.8" opacity="0.6"/></pattern>
      <clipPath id={`${uid}-upper`}><rect x="0" y="0" width={L.width} height={cy}/></clipPath>
      <clipPath id={`${uid}-lower`}><rect x="0" y={cy} width={L.width} height={L.height - cy}/></clipPath>
    </defs>
    <rect x="0.5" y="0.5" width={L.width - 1} height={L.height - 1} fill={ink.paper} stroke={ink.outline} strokeWidth="1"/>
    <g style={label}>
      <text x={PAD} y={PAD + 14} fontSize="15" fontWeight="700" letterSpacing="1">HOJA DE COTAS</text>
      <text x={PAD + 150} y={PAD + 14} fill={ink.muted}>Vista lateral · medio corte superior · cotas en mm</text>
      <text x={L.width - PAD} y={PAD + 14} textAnchor="end" fontWeight="700" fill={partial ? '#a15c07' : '#18794e'} data-testid="sheet-status">{status}</text>
    </g>
    {/* Initial stock as a phantom (two-dot chain) line. */}
    <rect x={x(-stock.lengthMm)} y={y(stockR)} width={stock.lengthMm * L.scale} height={2 * stockR * L.scale} fill="none" stroke={ink.phantom} strokeWidth="0.8" strokeDasharray="14 3 2 3 2 3"/>
    <g clipPath={`url(#${uid}-upper)`}>
      <path d={sectionPath} fillRule="evenodd" fill={ink.fill} stroke="none"/>
      <path d={sectionPath} fillRule="evenodd" fill={`url(#${uid}-hatch)`} stroke={ink.outline} strokeWidth="1.6" aria-label="Medio corte"/>
    </g>
    <g clipPath={`url(#${uid}-lower)`}>
      <path d={outerPath} fill={ink.view} stroke={ink.outline} strokeWidth="1.6" aria-label="Vista exterior"/>
      {hiddenBore && <path d={hiddenBore} fill="none" stroke={ink.outline} strokeWidth="0.9" strokeDasharray="6 4" aria-label="Agujero oculto"/>}
    </g>
    <line x1={L.partLeft - 22} x2={L.partRight + 22} y1={cy} y2={cy} stroke={ink.outline} strokeWidth="0.7" strokeDasharray="18 4 3 4"/>
    <g style={label}>
      {/* Diameters on the side columns: extension lines run clear of material. */}
      {[...L.right.map((d, k) => ({ d, k, side: 1 })), ...L.left.map((d, k) => ({ d, k, side: -1 }))].map(({ d, k, side }) => {
        const xc = side > 0 ? L.partRight + SIDE + k * COL : L.partLeft - SIDE - k * COL;
        const from = x(d.zMm) + side * 3;
        return <g key={`${side}-${d.zMm}-${d.radiusMm}`} data-dim="diameter" data-placement={d.placement}>
          <line x1={from} x2={xc + side * 6} y1={y(d.radiusMm)} y2={y(d.radiusMm)} {...ext}/>
          <line x1={from} x2={xc + side * 6} y1={y(-d.radiusMm)} y2={y(-d.radiusMm)} {...ext}/>
          <line x1={xc} x2={xc} y1={y(d.radiusMm)} y2={y(-d.radiusMm)} {...dimLine}/>
          <text x={xc - 5} y={cy} transform={`rotate(-90 ${xc - 5} ${cy})`} textAnchor="middle" {...halo}>{d.text}</text>
        </g>;
      })}
      {/* Diameters that cannot leave the part (bores, enclosed grooves) stay on the feature. */}
      {sheet.diameters.filter(d => d.placement === 'inside').map(d => {
        const xi = x(d.zMm);
        return <g key={`in-${d.contour}-${d.zMm}-${d.radiusMm}`} data-dim="diameter" data-placement="inside" data-contour={d.contour}>
          <line x1={xi} x2={xi} y1={y(d.radiusMm)} y2={y(-d.radiusMm)} {...dimLine}/>
          <text x={xi - 5} y={cy} transform={`rotate(-90 ${xi - 5} ${cy})`} textAnchor="middle" {...halo}>{d.text}</text>
        </g>;
      })}
      {/* Exterior lengths: parallel dimensioning from the front face, shortest nearest the part. */}
      {L.below.map((l, k) => {
        const yr = L.partBottom + 30 + k * ROW;
        const x1 = x(l.fromZMm); const x2 = x(l.toZMm);
        const fits = Math.abs(x1 - x2) > textWidth(l.text) + 16;
        return <g key={`len-${l.toZMm}`} data-dim="length" data-contour="outer">
          <line x1={x2} x2={x2} y1={y(-radiusAtZ(sheet.outer, l.toZMm)) + 3} y2={yr + 6} {...ext}/>
          <line x1={x1} x2={x1} y1={y(-radiusAtZ(sheet.outer, l.fromZMm)) + 3} y2={yr + 6} {...ext}/>
          <line x1={x2} x2={x1} y1={yr} y2={yr} {...dimLine}/>
          <text x={fits ? (x1 + x2) / 2 : Math.min(x1, x2) - 6} y={yr - 4} textAnchor={fits ? 'middle' : 'end'} {...halo}>{l.text}</text>
        </g>;
      })}
      {/* Bore lengths above the part, also from the front face. */}
      {L.above.map((l, k) => {
        const yr = L.innerTop - k * ROW;
        const x1 = x(l.fromZMm); const x2 = x(l.toZMm);
        const fits = Math.abs(x1 - x2) > textWidth(l.text) + 16;
        return <g key={`ilen-${l.toZMm}`} data-dim="length" data-contour="inner">
          <line x1={x2} x2={x2} y1={y(radiusAtZ(sheet.inner, l.toZMm)) - 3} y2={yr - 6} {...ext}/>
          <line x1={x1} x2={x1} y1={y(radiusAtZ(sheet.outer, l.fromZMm)) - 3} y2={yr - 6} {...ext}/>
          <line x1={x2} x2={x1} y1={yr} y2={yr} {...dimLine}/>
          <text x={fits ? (x1 + x2) / 2 : Math.min(x1, x2) - 6} y={yr - 4} textAnchor={fits ? 'middle' : 'end'} {...halo}>{l.text}</text>
        </g>;
      })}
      {/* Cone angles, chamfers, radii and faced fronts: leaders to labels stacked above the part. */}
      {L.notes.map(({ note, ax, lx, w, level, toRight }, i) => {
        const ly = L.partTop - 16 - level * NOTE_ROW;
        const ay = y(note.rMm);
        const kneeX = toRight ? lx - 4 : lx + w + 4;
        return <g key={`note-${i}`} data-dim="note" data-kind={note.kind}>
          <circle cx={ax} cy={ay} r="2" fill={ink.dim}/>
          <polyline points={`${ax},${ay} ${kneeX},${ly + 4} ${toRight ? lx + w : lx},${ly + 4}`} fill="none" stroke={ink.dim} strokeWidth="0.7"/>
          <text x={lx} y={ly} {...halo}>{note.text}</text>
        </g>;
      })}
    </g>
    {/* Title block. */}
    <g style={{ ...label, fontSize: 12 }} data-testid="sheet-title-block">
      <rect x={PAD} y={L.titleTop} width={L.width - 2 * PAD} height="96" fill="none" stroke={ink.outline} strokeWidth="1"/>
      <line x1={L.width / 2} x2={L.width / 2} y1={L.titleTop} y2={L.titleTop + 96} stroke={ink.outline} strokeWidth="0.6"/>
      {[32, 64].map(dy => <line key={dy} x1={PAD} x2={L.width - PAD} y1={L.titleTop + dy} y2={L.titleTop + dy} stroke={ink.outline} strokeWidth="0.6"/>)}
      <text x={PAD + 10} y={L.titleTop + 21}><tspan fill={ink.muted}>Programa: </tspan><tspan fontWeight="700">{fileName}</tspan></text>
      <text x={L.width / 2 + 10} y={L.titleTop + 21}><tspan fill={ink.muted}>Estado: </tspan>{status}</text>
      <text x={PAD + 10} y={L.titleTop + 53}><tspan fill={ink.muted}>Material inicial: </tspan>{stockText}</text>
      <text x={L.width / 2 + 10} y={L.titleTop + 53}><tspan fill={ink.muted}>Herramientas: </tspan>{tools.join(' · ') || '—'}</text>
      <text x={PAD + 10} y={L.titleTop + 85}><tspan fill={ink.muted}>Largo total: </tspan>{formatMm(sheet.overallLengthMm)} mm<tspan fill={ink.muted}> · Ø = diámetro · longitudes desde la cara frontal · X en diámetro</tspan></text>
      <text x={L.width / 2 + 10} y={L.titleTop + 85} fontWeight="700">Dibujo educativo — no es un plano de fabricación</text>
    </g>
  </svg>;
});

const fine = (value: number) => value !== 0 && Math.abs(value) < 1e-4 ? value.toExponential(1) : value.toLocaleString('es-AR', { maximumFractionDigits: 6, useGrouping: false });
function checkLabel(check: ReferenceCheck): string {
  if (check.kind === 'volume') return 'Volumen restante (mm³)';
  const z = formatMm(check.zMm!).replace('-', '−');
  return `${check.kind === 'inner' ? 'Ø interior' : 'Ø exterior'} en Z ${z}`;
}

type DialogProps = SheetProps & {
  open: boolean; onClose: () => void;
  comparison: { title: string; ok: boolean; checks: ReferenceCheck[] } | null;
};
/** Modal sheet with the optional practice comparison and the SVG download. */
export default function DimensionSheetDialog({ open, onClose, comparison, ...sheet }: DialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);
  // Same download pattern as ProjectActions: Blob → object URL → temporary link.
  function download() {
    try {
      if (!svg.current) throw new Error('No hay hoja para descargar.');
      const text = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg.current)}`;
      const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `hoja-de-cotas-${sheet.fileName.replace(/\.[^.]+$/, '') || 'torno'}.svg`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice({ kind: 'ok', message: 'Se preparó la descarga de la hoja de cotas en SVG.' });
    } catch (error) { setNotice({ kind: 'error', message: error instanceof Error ? error.message : 'No se pudo preparar la descarga.' }); }
  }
  return <dialog ref={dialog} className="dimension-sheet-dialog" aria-labelledby="dimension-sheet-heading" onClose={onClose} onCancel={onClose}>
    <div className="sheet-header">
      <h2 id="dimension-sheet-heading">Hoja de cotas</h2>
      <span className={`sheet-badge ${sheet.partial ? 'partial' : ''}`}>{sheet.status}</span>
      <div className="sheet-actions"><button onClick={download}>Descargar SVG</button><button className="primary" onClick={onClose}>Cerrar</button></div>
    </div>
    {open && <>
      <p className="sheet-note">{sheet.partial
        ? 'Muestra el perfil hasta el bloque actual del recorrido. Avanzá hasta el final para ver la pieza terminada.'
        : 'Perfil calculado al final del programa.'} Medidas redondeadas a 0,01 mm. Arcos reconocidos como radio solo si sus cuerdas ajustan a un círculo; si no, «perfil curvo».</p>
      <div className="sheet-frame"><DimensionSheetDrawing ref={svg} {...sheet}/></div>
      {comparison && <section className="sheet-comparison" aria-labelledby="sheet-comparison-heading">
        <h3 id="sheet-comparison-heading">Pedido vs. obtenido</h3>
        <p className={`sheet-verdict ${comparison.ok ? 'ok' : 'mismatch'}`} data-testid="sheet-verdict">{comparison.title}</p>
        <div className="reference-table"><table aria-label="Pedido vs. obtenido">
          <thead><tr><th>Medida</th><th>Pedido</th><th>Obtenido</th><th>Desvío</th><th>Tolerancia (±)</th><th>Estado</th></tr></thead>
          <tbody>{comparison.checks.map((check, i) => <tr key={i} className={check.ok ? 'ok' : 'mismatch'}>
            <td>{checkLabel(check)}</td><td>{formatMm(check.expected)}</td>
            <td>{check.obtained === null ? '—' : formatMm(check.obtained)}</td>
            <td>{check.obtained === null ? '—' : formatMm(check.obtained - check.expected)}</td>
            <td>{fine(check.tolerance)}</td>
            <td aria-label={check.ok ? 'Dentro de tolerancia' : 'Fuera de tolerancia'}>{check.ok ? '✓' : '✗'}</td>
          </tr>)}</tbody>
        </table></div>
        <p className="sheet-note">Cada fila descompone la comprobación de la práctica (mismas medidas y tolerancias); el resultado general es el del recorrido guiado. Simulación educativa: no valida una pieza real.</p>
      </section>}
      {notice && <p role={notice.kind === 'error' ? 'alert' : 'status'} data-testid="sheet-notice" className={`project-notice ${notice.kind}`}>{notice.message}</p>}
    </>}
  </dialog>;
}
