'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { DisplayProfile } from '../lib/lathe/annularProfile';
import type { Projection, ThreeScene } from '../lib/lathe/threeScene';
import type { Position } from '../lib/lathe/contract';
import { toolPose } from '../lib/lathe/revolution';
import { getToolDefinition } from '../lib/lathe/tools';
import { TOOL_ASSEMBLIES, type DisplayAssembly } from '../lib/lathe/toolAssemblies';
import { positionAtElapsed } from '../lib/lathe/motionAnimation';
import type { ToolAnimation } from './useToolAnimation';

type Props = {
  stock: { diameterMm: number; lengthMm: number; innerDiameterMm?: number };
  profile: DisplayProfile | null;
  position: Position;
  toolId?: string;
  blocked: boolean;
  section: boolean;
  onSectionChange: (section: boolean) => void;
  projection: Projection;
  assembly?: DisplayAssembly;
  onProjectionChange: (projection: Projection) => void;
  onReturn2D: () => void;
  /** Presentation-only travel for the last forward step; moves the tool without rebuilding the mesh. */
  animation?: ToolAnimation | null;
};

export default function LatheThreeView({ stock: { diameterMm, lengthMm, innerDiameterMm = 0 }, profile, position, toolId, blocked, section, onSectionChange, projection, onProjectionChange, assembly, onReturn2D, animation = null }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ThreeScene | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${diameterMm}/${innerDiameterMm}/${lengthMm}/${attempt}`;
  const [state, setState] = useState({ key, status: 'loading', message: '' });
  const spans = useMemo(() => profile?.spans ?? (innerDiameterMm > 0 ? [{ zStartMm: -lengthMm, zEndMm: 0, innerStartMm: innerDiameterMm / 2, innerEndMm: innerDiameterMm / 2, outerStartMm: diameterMm / 2, outerEndMm: diameterMm / 2 }] : [{ zStartMm: -lengthMm, zEndMm: 0, rStartMm: diameterMm / 2, rEndMm: diameterMm / 2 }]), [profile, lengthMm, diameterMm, innerDiameterMm]);
  const completedBlocks = profile?.evaluatedBlocks ?? 0;
  const latest = useRef({ spans, completedBlocks, position, toolId, section, assembly });
  const latestProjection = useRef(projection);
  const toolInFrame = toolPose(position, { diameterMm, lengthMm }).inMaterialFrame;
  const toolDef = getToolDefinition(toolId);
  const ready = state.key === key && state.status === 'ready';
  const error = state.key === key && state.status === 'error';

  useEffect(() => {
    let cancelled = false;
    let owned: ThreeScene | null = null;
    const fail = (message: string) => { if (!cancelled) setState({ key, status: 'error', message }); };
    void import('../lib/lathe/threeScene').then(({ createThreeScene }) => {
      if (cancelled || !host.current) return;
      owned = createThreeScene(host.current, { diameterMm, lengthMm }, fail);
      scene.current = owned;
      owned.setProjection(latestProjection.current);
      const l = latest.current;
      if (owned.update(l.spans, l.completedBlocks, l.position, l.toolId, l.section, l.assembly)) setState({ key, status: 'ready', message: '' });
    }).catch((error: unknown) => fail(error instanceof Error && error.message.includes('3D') ? error.message
      : 'No se pudo iniciar la vista 3D. Puede faltar WebGL o la descarga del módulo. Podés continuar en 2D.'));
    return () => {
      cancelled = true;
      owned?.dispose();
      if (scene.current === owned) scene.current = null;
    };
  }, [diameterMm, lengthMm, key]);

  useEffect(() => {
    latest.current = { spans, completedBlocks, position, toolId, section, assembly };
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled && scene.current?.update(spans, completedBlocks, position, toolId, section, assembly)) setState({ key, status: 'ready', message: '' });
    }).catch((error: unknown) => {
      if (!cancelled) setState({ key, status: 'error', message: error instanceof Error ? error.message : 'No se pudo construir la pieza 3D.' });
    });
    return () => { cancelled = true; };
  }, [spans, completedBlocks, position, toolId, section, assembly, key]);

  useEffect(() => {
    const owned = scene.current;
    if (!animation || !ready || !owned) return;
    const startedAt = animation.startedAt;
    if (startedAt === null) { owned.setToolPosition(animation.startTip); return () => owned.setToolPosition(null); }
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - startedAt;
      if (elapsed >= animation.durationMs) { owned.setToolPosition(null); return; }
      owned.setToolPosition(positionAtElapsed(animation, Math.max(0, elapsed)));
      raf = requestAnimationFrame(tick);
    };
    tick(performance.now());
    return () => { cancelAnimationFrame(raf); owned.setToolPosition(null); };
  }, [animation, ready]);

  useEffect(() => {
    latestProjection.current = projection;
    scene.current?.setProjection(projection);
  }, [projection]);

  return <div className="three-view" aria-label="Vista 3D del material">
    <div className="three-stage" aria-busy={!ready && !error || blocked}>
      <div ref={host} className="three-surface" style={{ visibility: ready && !blocked && !error ? 'visible' : 'hidden' }}/>
      {error ? <div className="three-placeholder" role="alert"><p>{state.message}</p><div><button onClick={() => setAttempt(attempt + 1)}>Reintentar vista 3D</button><button onClick={onReturn2D}>Volver a 2D</button></div></div>
        : (!ready || blocked) && <p className="three-placeholder" role="status">{blocked ? 'Esperando un perfil válido del bloque actual…' : 'Preparando vista 3D…'}</p>}
    </div>
    <div className="three-controls" aria-label="Controles de cámara 3D">
      <button disabled={!ready || blocked || error} onClick={() => scene.current?.rotate(-Math.PI / 12)} aria-label="Girar vista a la izquierda">↶</button>
      <button disabled={!ready || blocked || error} onClick={() => scene.current?.rotate(Math.PI / 12)} aria-label="Girar vista a la derecha">↷</button>
      <button disabled={!ready || blocked || error} onClick={() => scene.current?.zoom(0.8)} aria-label="Acercar pieza">+</button>
      <button disabled={!ready || blocked || error} onClick={() => scene.current?.zoom(1.25)} aria-label="Alejar pieza">−</button>
      <button disabled={!ready || blocked || error} onClick={() => scene.current?.reset()}>Restablecer cámara</button>
      <span className="three-projection" role="group" aria-label="Proyección de la cámara">
        <button aria-pressed={projection === 'perspective'} onClick={() => onProjectionChange('perspective')}>Perspectiva</button>
        <button aria-pressed={projection === 'orthographic'} onClick={() => onProjectionChange('orthographic')} title="Sin fuga: medidas paralelas comparables, como un plano">Ortográfica</button>
      </span>
      <button disabled={!ready || blocked || error} onClick={() => scene.current?.front()} title="Mirar a lo largo del eje tangencial: Z horizontal y radio vertical, como en 2D">Vista frontal Z/X</button>
      <button aria-pressed={section} onClick={() => onSectionChange(!section)} title="Quita la mitad delantera de la pieza para ver el interior; la herramienta queda completa">Sección longitudinal</button>
    </div>
    <details className="three-notes"><summary>Detalles de la vista</summary>
      <p className="three-tool-position">Punta ideal ({toolDef.shortName}) · X Ø{position.rMm * 2} · Z {position.zMm} mm. {!toolInFrame && 'Herramienta fuera del encuadre del material.'} Conjunto educativo en mm a escala de la pieza; sin colisiones del porta.</p>
      <p className="three-tool-dimensions">{(assembly ?? TOOL_ASSEMBLIES[toolDef.id]).dimensions}.{(assembly?.provenance ?? 'educational-design') === 'educational-design' ? ' Diseño propio educativo; no es un modelo de fabricante.' : ''}</p>
      <p className="three-caption">{!profile ? 'Material inicial.' : !profile.complete ? `Perfil parcial confirmado hasta el bloque ${profile.evaluatedBlocks}.` : 'Material restante según el perfil del motor.'} {spans.every(s => 'innerStartMm' in s ? s.innerStartMm === s.outerStartMm && s.innerEndMm === s.outerEndMm : s.rStartMm === 0 && s.rEndMm === 0) && 'No queda material en este perfil.'} Arrastrá para girar; usá +/− para acercar. Z crece hacia la derecha en la vista inicial. Superficie facetada del perfil calculado (punta ideal o radio de punta de la tabla).{section && ' Sección de presentación: se oculta la mitad delantera y las caras de corte (cobre) marcan el material; el volumen informado es el de la pieza completa.'}</p>
    </details>
  </div>;
}
