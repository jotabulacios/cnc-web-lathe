import { useId, useState } from 'react';
import LatheToolGlyph from './LatheToolGlyph';
import { assemblyBounds, TOOL_ASSEMBLIES, type AssemblyMap } from '../lib/lathe/toolAssemblies';
import type { CompileResult, Position } from '../lib/lathe/contract';
import { createLatheView, gridTicks, VIEWPORT, type Stock } from '../lib/lathe/viewport';
import type { DisplayProfile } from '../lib/lathe/annularProfile';
import { profilePathV3 } from '../lib/lathe/profilePathV3';
import { profilePathV2 } from '../lib/lathe/profilePathV2';
import { getToolDefinition, type ToolDefinition } from '../lib/lathe/tools';
import { useAnimatedTip, type ToolAnimation } from './useToolAnimation';
import type { DisplayAssembly } from '../lib/lathe/toolAssemblies';

type Props = {
  motions: CompileResult['motions'];
  cursor: number;
  position: Position;
  stock: Stock & { innerDiameterMm?: number };
  showToolpath: boolean;
  profile?: DisplayProfile | null;
  toolId?: string;
  assemblies?: AssemblyMap;
  /** Presentation-only travel of the tool for the last forward step; `position` stays the resolved tip. */
  animation?: ToolAnimation | null;
};

// Light technical-drawing palette: section hatch on material, dark edges.
const colors = {
  background: '#f8fafc', grid: '#e4e9ef', axis: '#7a8794', text: '#3d4a57',
  stock: '#d5dde4', stockEdge: '#2f3c49', feed: '#0f8a5f', rapid: '#c2410c',
};
const formatTick = (value: number) => Math.abs(value) >= 100_000
  ? value.toExponential(1).replace('.0e', 'e')
  : Number(value.toFixed(3)).toLocaleString('es-AR');

/** Project engine material spans alongside the ideal tool and interpreted motions. */
type MarkerProps = { animation: ToolAnimation | null; position: Position; x: (z: number) => number; y: (r: number) => number; scale: number; toolDef: ToolDefinition; assembly: DisplayAssembly };

/** Only the marker re-renders per animation frame; the view keeps its block-resolved framing. */
function ToolMarker({ animation, position, x, y, scale, toolDef, assembly }: MarkerProps) {
  const { position: tip, animating } = useAnimatedTip(animation, position);
  const frame = VIEWPORT;
  const tipX = x(tip.zMm);
  const tipY = y(tip.rMm);
  const toolVisible = tipX >= frame.left && tipX <= frame.left + frame.plotWidth && tipY >= frame.top && tipY <= frame.top + frame.plotHeight;
  return toolVisible && <g aria-label={`Punta ideal de herramienta (${toolDef.name})`} data-testid="tool-marker" data-tool-id={toolDef.id} data-animating={animating}>
    <g transform={`translate(${tipX} ${tipY}) scale(${scale})`}><LatheToolGlyph tool={toolDef} assembly={assembly}/></g>
    <circle cx={tipX} cy={tipY} r="5" fill="#fff5df" stroke="#9b7538" strokeWidth="1.5"/>
  </g>;
}

export default function LatheViewport({ motions, cursor, position, stock, showToolpath, profile, toolId, assemblies = TOOL_ASSEMBLIES, animation = null }: Props) {
  const [expanded, setExpanded] = useState(false);
  const uid = useId().replace(/:/g, '');
  const toolDef = getToolDefinition(toolId);
  const assembly = assemblies[toolDef.id];
  const view = createLatheView(motions, position, stock, assemblyBounds(assembly), assemblies);
  const { x, y, radius, chuckDepth, scale } = view;
  const zTicks = gridTicks(view.minZ, view.maxZ, 6);
  const rTicks = gridTicks(view.minR, view.maxR, 7);
  const frame = VIEWPORT;
  // Tool name sits in the title strip above the plot: never over the stock.
  const toolLabelX = frame.left + frame.plotWidth / 2 - 124;
  const toolLabelY = 12;
  const chuckLeft = x(-stock.lengthMm - chuckDepth);
  const chuckRight = x(-stock.lengthMm);
  const chuckHeight = radius * 1.4;
  const labelStyle = { fontFamily: 'inherit', fontSize: 20, fill: colors.text };
  const solidOutline = profilePathV2([{ zStartMm: -stock.lengthMm, zEndMm: 0, rStartMm: radius, rEndMm: radius }], x, y);
  const initialOutline = (stock.innerDiameterMm ?? 0) > 0 ? profilePathV3([{ zStartMm: -stock.lengthMm, zEndMm: 0,
    innerStartMm: stock.innerDiameterMm! / 2, innerEndMm: stock.innerDiameterMm! / 2, outerStartMm: radius, outerEndMm: radius }], x, y) : solidOutline;
  const materialOutline = profile ? profile.profileVersion === 3 ? profilePathV3(profile.spans, x, y) : profilePathV2(profile.spans, x, y) : initialOutline;
  return <div className={`lathe-viewport${expanded ? " is-expanded" : ""}`} style={{ width: '100%', minWidth: 0 }}>
    <div className="plane-size-control"><button type="button" aria-pressed={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Reducir plano 2D' : 'Ampliar plano 2D'}</button></div>
    <svg className="lathe-viewport-svg" viewBox={`0 0 ${frame.width} ${frame.height}`} role="img" aria-labelledby={`${uid}-title ${uid}-description`} style={{ display: 'block', width: '100%', height: 'auto', background: colors.background }}>
      <title id={`${uid}-title`}>Torno CNC · vista longitudinal X/Z</title>
      <desc id={`${uid}-description`}>Plato a la izquierda y material inicial de diámetro {stock.diameterMm} mm y longitud {stock.lengthMm} mm. Z crece hacia la derecha y la cara frontal está en Z cero. X se programa en diámetro; la geometría usa radio con igual escala física en ambos ejes. La herramienta ideal está en X {(position.rMm * 2).toFixed(3)} y Z {position.zMm.toFixed(3)} mm. Las líneas verdes representan avance G01, los arcos verdes G02/G03 y las discontinuas ámbar rápido G00. Las trayectorias completadas se resaltan. {profile ? 'El perfil muestra el material restante confirmado por el motor; el área ámbar representa material removido en un modelo de paredes interior/exterior. La trayectoria verde es el contacto de la herramienta: punta ideal, o nariz redonda si la tabla de correctores define radio de punta.' : 'Se muestra el material inicial.'}</desc>
      <defs>
        <clipPath id={`${uid}-field`}><rect x={frame.left} y={frame.top} width={frame.plotWidth} height={frame.plotHeight}/></clipPath>
        <linearGradient id={`${uid}-metal`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e8edf1"/><stop offset="0.5" stopColor="#d3dbe2"/><stop offset="1" stopColor="#c3ccd5"/></linearGradient>
        <pattern id={`${uid}-hatch`} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" x2="0" y1="0" y2="10" stroke="#4b5866" strokeWidth="1" opacity="0.45"/></pattern>
        <pattern id={`${uid}-removed`} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="9" height="9" fill="#f59e0b" fillOpacity="0.08"/><line x1="0" x2="0" y1="0" y2="9" stroke="#d97706" strokeWidth="1" opacity="0.35"/></pattern>
      </defs>
      <g style={labelStyle}>
        <text x={frame.left} y="25" fill="#4b5866" fontSize="17" letterSpacing="1.5">VISTA LONGITUDINAL</text>
        <text x={frame.left + frame.plotWidth} y="25" fontSize="18" textAnchor="end">X Ø · Z en mm</text>
      </g>
      <g clipPath={`url(#${uid}-field)`}>
        {zTicks.map(z => <line key={`z-${z}`} x1={x(z)} x2={x(z)} y1={frame.top} y2={frame.top + frame.plotHeight} stroke={colors.grid}/>)}
        {rTicks.map(r => <line key={`r-${r}`} x1={frame.left} x2={frame.left + frame.plotWidth} y1={y(r)} y2={y(r)} stroke={colors.grid}/>)}
        {profile && <path d={`${initialOutline} ${materialOutline}`} fill={`url(#${uid}-removed)`} fillRule="evenodd" aria-label="Material removido según el modelo ideal"/>}
        <path d={materialOutline} fillRule="evenodd" fill={`url(#${uid}-metal)`} stroke={colors.stockEdge} strokeWidth="1.4" aria-label="Material restante"/>
        <path d={materialOutline} fillRule="evenodd" fill={`url(#${uid}-hatch)`}/>
        <path d={initialOutline} fill="none" stroke={colors.stockEdge} strokeWidth="1.2" strokeDasharray={profile ? '6 5' : undefined} opacity={profile ? 0.65 : 1} aria-label="Contorno del material inicial"/>
        <g aria-label="Plato de sujeción esquemático">
          <rect x={chuckLeft} y={y(chuckHeight)} width={chuckRight - chuckLeft} height={2 * chuckHeight * scale} rx="3" fill="#cfd6dd" stroke="#5b6874"/>
          <rect x={chuckLeft + (chuckRight - chuckLeft) * 0.64} y={y(chuckHeight * 0.86)} width={(chuckRight - chuckLeft) * 0.36 + 3} height={(chuckHeight * 0.86 - radius * 0.8) * scale} rx="1" fill="#9aa6b1" stroke="#4b5866"/>
          <rect x={chuckLeft + (chuckRight - chuckLeft) * 0.64} y={y(-radius * 0.8)} width={(chuckRight - chuckLeft) * 0.36 + 3} height={(chuckHeight * 0.86 - radius * 0.8) * scale} rx="1" fill="#9aa6b1" stroke="#4b5866"/>
          <line x1={chuckLeft + 4} x2={chuckLeft + 4} y1={y(chuckHeight) + 8} y2={y(-chuckHeight) - 8} stroke="#5b6874" opacity="0.4"/>
        </g>
        <line x1={frame.left} x2={frame.left + frame.plotWidth} y1={y(0)} y2={y(0)} stroke={colors.axis} strokeDasharray="10 5 2 5" strokeWidth="1"/>
        <line x1={x(0)} x2={x(0)} y1={frame.top} y2={frame.top + frame.plotHeight} stroke={colors.axis} strokeDasharray="3 7" opacity="0.55"/>
        {showToolpath && motions.map(motion => {
          const executed = motion.blockId < cursor;
          const stroke = motion.kind === 'rapid' ? colors.rapid : colors.feed;
          if (motion.arc) {
            // SVG y grows downward, so a clockwise arc in (Z, radius) needs sweep-flag 1.
            const r = motion.arc.radiusMm * scale;
            const large = motion.arc.sweepRad > Math.PI ? 1 : 0;
            const sweep = motion.arc.clockwise ? 1 : 0;
            return <path key={motion.id} data-motion-id={motion.id} data-arc={motion.arc.clockwise ? 'cw' : 'ccw'} data-executed={executed}
              d={`M ${x(motion.from.zMm)} ${y(motion.from.rMm)} A ${r} ${r} 0 ${large} ${sweep} ${x(motion.to.zMm)} ${y(motion.to.rMm)}`}
              fill="none" stroke={stroke} strokeWidth={executed ? 2.5 : 1.5} opacity={executed ? 1 : 0.28}/>;
          }
          return <line key={motion.id} data-motion-id={motion.id} data-executed={executed} x1={x(motion.from.zMm)} y1={y(motion.from.rMm)} x2={x(motion.to.zMm)} y2={y(motion.to.rMm)} stroke={stroke} strokeWidth={executed ? 2.5 : 1.5} strokeDasharray={motion.kind === 'rapid' ? '7 5' : undefined} opacity={executed ? 1 : 0.28}/>;
        })}
        <g aria-label="Origen de pieza Z cero" stroke="#2f3c49" strokeWidth="1.2"><circle cx={x(0)} cy={y(0)} r="4" fill={colors.background}/><line x1={x(0) - 8} x2={x(0) + 8} y1={y(0)} y2={y(0)}/><line x1={x(0)} x2={x(0)} y1={y(0) - 8} y2={y(0) + 8}/></g>
        <ToolMarker animation={animation} position={position} x={x} y={y} scale={scale} toolDef={toolDef} assembly={assembly}/>
      </g>
      {/* Outside the plot clip: the title strip never overlaps the stock. */}
      <g data-testid="tool-label">
        <rect x={toolLabelX} y={toolLabelY} width="248" height="28" rx="5" fill={colors.background} fillOpacity="0.95" stroke={toolDef.geometry.color} strokeWidth="2"/>
        <text x={toolLabelX + 124} y={toolLabelY + 19} textAnchor="middle" fill={colors.stockEdge} fontSize="17">T{toolDef.station} · {toolDef.shortName}</text>
      </g>
      <g style={labelStyle}>
        {zTicks.map(z => <text key={z} x={x(z)} y={frame.top + frame.plotHeight + 21} textAnchor="middle">{formatTick(z)}</text>)}
        {rTicks.filter(r => r >= 0).map(r => <text key={r} x={frame.left - 12} y={y(r) + 6} textAnchor="end">{formatTick(r * 2)}</text>)}
        <text x="24" y="44" fontSize="18" fill="#2f3c49">X Ø ↑</text>
        <text x={frame.left + frame.plotWidth} y={frame.top + frame.plotHeight + 43} textAnchor="end" fill="#2f3c49">Z →</text>
        <text x={Math.max(frame.left, chuckLeft)} y={Math.min(frame.top + frame.plotHeight - 10, y(-chuckHeight) + 20)} fontSize="18" letterSpacing="1">PLATO</text>
        <text x={x(0) + 8} y={Math.min(frame.top + frame.plotHeight - 8, y(-radius) + 20)} fontSize="18">CARA · Z0</text>
        <text x={frame.left} y="506" fontSize="18">{profile ? 'Perfil del modelo de corte · punta ideal o radio de la tabla' : 'Material inicial'} · escala física X/Z 1:1</text>
      </g>
    </svg>
    <div className="lathe-viewport-legend" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 22px', padding: '10px 18px', color: colors.text, fontSize: 12, borderTop: '1px solid #d6dce2', background: '#ffffff' }}>
      <span><span aria-hidden="true" style={{ color: colors.feed }}>━ </span>Avance G01</span>
      <span><span aria-hidden="true" style={{ color: colors.feed }}>◜ </span>Arco G02/G03</span>
      <span><span aria-hidden="true" style={{ color: colors.rapid }}>┄ </span>Rápido G00</span>
      <span>Tenue: previsto · intenso: completado</span>
      <span>Herramienta educativa en mm · el punto claro indica la punta ideal</span>
      {profile && <><span><span aria-hidden="true" style={{ color: colors.stockEdge }}>■ </span>Material restante</span><span><span aria-hidden="true" style={{ color: colors.rapid }}>▧ </span>Removido · modelo ideal</span></>}
      {view.largeRange && <span role="status" style={{ color: colors.rapid }}>Vista ajustada a todo el programa; el material puede verse pequeño.</span>}
    </div>
  </div>;
}
