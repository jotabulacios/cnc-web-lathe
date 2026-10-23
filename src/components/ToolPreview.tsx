'use client';

import { useEffect, useRef, useState } from 'react';
import type { ToolId } from '../lib/lathe/contract';
import type { DisplayAssembly } from '../lib/lathe/toolAssemblies';
import type { PreviewView, ToolPreviewScene } from '../lib/lathe/toolPreviewScene';

const views: { id: PreviewView; label: string }[] = [
  { id: 'iso', label: 'Isométrica' }, { id: 'front', label: 'Frente Z/R' }, { id: 'top', label: 'Planta Z/tangencial' },
];

/** Mounted only while the inspector is open; owns one WebGL context and releases it on unmount. */
export default function ToolPreview({ toolId, assembly }: { toolId: ToolId; assembly?: DisplayAssembly }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ToolPreviewScene | null>(null);
  const latestTool = useRef({ toolId, assembly });
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ attempt, status: 'loading', message: '' });
  const [view, setView] = useState<PreviewView | null>('iso');
  const stage = useRef<HTMLDivElement>(null);
  const ready = state.attempt === attempt && state.status === 'ready';
  const error = state.attempt === attempt && state.status === 'error';

  useEffect(() => {
    let cancelled = false;
    let owned: ToolPreviewScene | null = null;
    const fail = (message: string) => { if (!cancelled) setState({ attempt, status: 'error', message }); };
    void import('../lib/lathe/toolPreviewScene').then(({ createToolPreviewScene }) => {
      if (cancelled || !host.current) return;
      try { owned = createToolPreviewScene(host.current, fail, () => setView(null)); }
      catch { fail('No se pudo iniciar la vista previa 3D. Puede faltar WebGL. La silueta y las medidas siguen disponibles.'); return; }
      scene.current = owned;
      try { if (owned.setTool(latestTool.current.toolId, latestTool.current.assembly)) setState({ attempt, status: 'ready', message: '' }); }
      catch { fail('No se pudo construir la herramienta en 3D. La silueta y las medidas siguen disponibles.'); }
    }).catch(() => fail('No se pudo cargar la vista previa 3D. La silueta y las medidas siguen disponibles.'));
    return () => {
      cancelled = true;
      owned?.dispose();
      if (scene.current === owned) scene.current = null;
    };
  }, [attempt]);

  useEffect(() => {
    latestTool.current = { toolId, assembly };
    let cancelled = false;
    void Promise.resolve().then(() => { if (!cancelled) scene.current?.setTool(toolId, assembly); }).catch(() => {
      if (!cancelled) setState({ attempt, status: 'error', message: 'No se pudo construir la herramienta en 3D. La silueta y las medidas siguen disponibles.' });
    });
    return () => { cancelled = true; };
  }, [toolId, assembly, attempt]);

  const disabled = !ready || error;
  return <div className="tool-preview" data-attempt={attempt}>
    <div ref={stage} tabIndex={-1} className="tool-preview-stage" aria-busy={!ready && !error}>
      <div ref={host} className="tool-preview-surface" style={{ visibility: ready ? 'visible' : 'hidden' }}/>
      {error ? <div className="three-placeholder" role="alert"><p>{state.message}</p><button onClick={() => { setView('iso'); setAttempt(attempt + 1); stage.current?.focus(); }}>Reintentar vista previa</button></div>
        : !ready && <p className="three-placeholder" role="status">Preparando vista previa…</p>}
    </div>
    <div className="tool-preview-controls" role="group" aria-label="Controles de la vista previa">
      {views.map(v => <button key={v.id} aria-pressed={view === v.id} disabled={disabled} onClick={() => { setView(v.id); scene.current?.view(v.id); }}>{v.label}</button>)}
      <button disabled={disabled} onClick={() => { setView(null); scene.current?.rotate(Math.PI / 12); }} aria-label="Girar vista previa">↷</button>
      <button disabled={disabled} onClick={() => scene.current?.zoom(1.25)} aria-label="Acercar vista previa">+</button>
      <button disabled={disabled} onClick={() => scene.current?.zoom(0.8)} aria-label="Alejar vista previa">−</button>
    </div>
  </div>;
}
