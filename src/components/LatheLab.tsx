'use client';

import { useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent } from 'react';
import GCodeEditor from './GCodeEditor';
import LatheViewport from './LatheViewport';
import LatheThreeView from './LatheThreeView';
import GuidedPractice from './GuidedPractice';
import ProjectActions from './ProjectActions';
import ToolLibrary from './ToolLibrary';
import ToolInspector from './ToolInspector';
import ToolOffsetsEditor from './ToolOffsetsEditor';
import IsoToolsEditor from './IsoToolsEditor';
import { resolveAssemblies, type IsoTools } from '../lib/lathe/isoTools';
import DimensionSheetDialog from './DimensionSheet';
import { exerciseDocument, exerciseReferenceChecks } from '../lib/lathe/exercises';
import { assessPractice, isDiagnostic, type Practice } from '../lib/lathe/diagnosticExercises';
import { copyDocument, normalizeLineEndings, replaceDocument, type LabDocument } from '../lib/lathe/document';
import type { EditorFocusRequest } from '../lib/lathe/editorLocation';
import { compileProgram, computeLabProfile } from '../lib/lathe/engine';
import { profileMatches } from '../lib/lathe/profile';
import { exteriorSpans, type LabProfileResponse } from '../lib/lathe/annularProfile';
import { defaultSetup, toolIdSchema, type ToolId } from '../lib/lathe/contract';
import { currentState, initialPlayback, playbackReducer } from '../lib/lathe/playback';
import { explainBlock, motionShortLabel } from '../lib/lathe/explain';
import { draftFromSetup, validateSetupDraft, type SetupDraft } from '../lib/lathe/setup';
import { getToolDefinition, TOOL_CATALOGUE } from '../lib/lathe/tools';
import { maxAnimationMs } from '../lib/lathe/motionAnimation';
import { resolvedJaws } from '../lib/lathe/chuck';
import type { CollisionMarker } from './LatheViewport';
import { useBlockAnimation } from './useToolAnimation';

const fields: { key: Exclude<keyof SetupDraft,'toolId'|'offsets'|'isoTools'>; label: string; help: string }[] = [
  { key: 'diameter', label: 'Diámetro de la pieza', help: 'Ø mm' },
  { key: 'innerDiameter', label: 'Diámetro interior inicial', help: 'Ø mm' },
  { key: 'length', label: 'Longitud de la pieza', help: 'mm' },
  { key: 'initialX', label: 'X inicial de la herramienta', help: 'Ø mm' },
  { key: 'initialZ', label: 'Z inicial de la herramienta', help: 'mm' },
  { key: 'gripLength', label: 'Largo tomado por las mordazas', help: 'mm' },
  { key: 'jawHeight', label: 'Altura de las mordazas sobre la pieza', help: 'mm' },
];
type TabId = 'programa' | 'pieza' | 'herramientas' | 'explicacion' | 'practicas';
const TABS: { id: TabId; label: string }[] = [
  { id: 'programa', label: 'Programa' }, { id: 'pieza', label: 'Pieza' }, { id: 'herramientas', label: 'Herramientas' },
  { id: 'explicacion', label: 'Explicación' }, { id: 'practicas', label: 'Prácticas' },
];
const formatDuration = (seconds: number) => {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};
const format = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 3, useGrouping: false });

export default function LatheLab({ initialSource, exercises }: { initialSource: string; exercises: Practice[] }) {
  const defaultExercise = exercises.find(e => e.source === initialSource) ?? exercises[0];
  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(defaultExercise.id);
  const [selectedExerciseId, setSelectedExerciseId] = useState(defaultExercise.id);
  const [previousDocument, setPreviousDocument] = useState<LabDocument | null>(null);
  const documentVersion = useRef(0);
  const [source, setSource] = useState(() => normalizeLineEndings(initialSource));
  const [editorFocus, setEditorFocus] = useState<EditorFocusRequest | null>(null);
  const [setup, setSetup] = useState(defaultSetup);
  const [draft, setDraft] = useState(() => draftFromSetup(defaultSetup));
  const [tab, setTab] = useState<TabId>('programa');
  const [showToolpath, setShowToolpath] = useState(true);
  // Presentation only (not persisted). 'split' shows the 2D plane and the 3D part together.
  const [viewMode, setViewMode] = useState<'2d' | '3d' | 'split'>('2d');
  // Presentation only; survives 2D/3D switches, never saved nor part of execution.
  const [section3d, setSection3d] = useState(false);
  const [projection, setProjection] = useState<'perspective' | 'orthographic'>('perspective');
  const [blocksPerSecond, setBlocksPerSecond] = useState(1);
  // Presentation only (not saved): smooth tool travel per forward step.
  const [animateTool, setAnimateTool] = useState(true);
  const [playback, dispatch] = useReducer(playbackReducer, initialPlayback);
  const { result, cursor, status } = playback;
  const [profileResponse, setProfileResponse] = useState<LabProfileResponse | null>(null);
  const [profileAttempt, setProfileAttempt] = useState(0);
  const profileCurrent = result?.executable && profileMatches(profileResponse, playback.revision, cursor, profileAttempt);
  const geometry = profileCurrent ? profileResponse?.profile ?? null : null;
  const profileError = profileCurrent ? profileResponse?.error ?? null : null;
  const profileBusy = Boolean(result?.executable && !profileCurrent);
  useEffect(() => {
    if (!result?.executable) return;
    let cancelled = false;
    const revision = playback.revision;
    const attempt = profileAttempt;
    void computeLabProfile({
      program: { apiVersion: 2, dialect: 'edu-lathe-v2', sourceRevision: revision, source, setup },
      completedBlocks: cursor,
    }).then(profile => {
      if (!cancelled) {
        setProfileResponse({ revision, cursor, attempt, profile, error: null });
        if (!profile.complete) dispatch({ type: 'pause' });
      }
    }).catch((error: unknown) => {
      if (!cancelled) {
        setProfileResponse({ revision, cursor, attempt, profile: null,
          error: error instanceof Error ? error.message : String(error) });
        dispatch({ type: 'pause' });
      }
    });
    return () => { cancelled = true; };
  }, [result, playback.revision, cursor, source, setup, profileAttempt]);
  const validation = validateSetupDraft(draft);
  const { assemblies, results: isoResults } = useMemo(() => resolveAssemblies(draft.isoTools), [draft.isoTools]);
  const machine = currentState(playback);
  // DRO shows the programmed point; views draw the physical tip after offsets.
  const position = machine?.position ?? setup.initialPosition;
  const tipPosition = machine?.tipPosition ?? position;
  const tipShifted = tipPosition.rMm !== position.rMm || tipPosition.zMm !== position.zMm;
  const toolAnimation = useBlockAnimation({ result, revision: playback.revision, cursor, tip: tipPosition, enabled: animateTool,
    maxMs: maxAnimationMs(playback.running ? blocksPerSecond : null) });
  const activeBlock = cursor > 0 ? result?.blocks[cursor - 1] ?? null : null;
  const activeToolId = activeBlock?.afterState.toolId ?? setup.toolId ?? 'generic-od';
  const activeTool = getToolDefinition(activeToolId);
  const explanation = explainBlock(activeBlock, result?.motions);
  // Estimated time of the completed blocks (cursor counts blocks, not motions).
  const elapsedTimeS = (result?.motions ?? []).reduce((sum, motion) => motion.blockId < cursor ? sum + (motion.timeS ?? 0) : sum, 0);
  const total = result?.blocks.length ?? 0;
  const canControl = status === 'ready' && result?.executable === true;
  const canStep = canControl && !profileBusy;
  const canPlay = canStep && !profileError && geometry?.complete === true && cursor < total;
  const canCompile = status !== 'loading' && validation.setup !== null;
  const diagnostics = result?.diagnostics ?? [];
  const jaws = resolvedJaws(setup);
  // Collision points of executed blocks (the warning's span is its block).
  const collisionMarkers: CollisionMarker[] = diagnostics.flatMap(d => {
    if (!d.point || !(d.code === 'TOOL_HOLDER_COLLISION' || d.code === 'JAW_COLLISION')) return [];
    const block = result?.blocks.findIndex(b => b.span.line === d.span.line) ?? -1;
    return block >= 0 && block < cursor ? [{ code: d.code, line: d.span.line, zMm: d.point.zMm, rMm: d.point.rMm }] : [];
  });
  const errors = diagnostics.filter(d => d.severity === 'error').length;
  const activeExercise = exercises.find(e => e.id === activeExerciseId);
  const exerciseAssessment = activeExercise ? assessPractice(activeExercise, { source, setup: validation.setup,
    revision: playback.revision, cursor, result, profile: geometry, profileError }) : null;
  // Dimension sheet follows the profile at the cursor; partial until the last block.
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetFinal = Boolean(geometry?.complete && cursor === total && total > 0);
  const sheetStatus = sheetFinal ? `Final — bloque ${cursor}/${total}` : `Parcial — bloque ${geometry?.evaluatedBlocks ?? cursor}/${total}`;
  const sheetTools = [...new Set((result?.motions ?? []).filter(m => m.blockId < cursor && m.kind !== 'rapid').map(m => m.toolId))]
    .map(id => getToolDefinition(id)).map(tool => `T${tool.station} ${tool.shortName}`);
  const sheetComparison = activeExercise && !isDiagnostic(activeExercise) && geometry && exerciseAssessment
    && (exerciseAssessment.kind === 'complete' || exerciseAssessment.kind === 'mismatch')
    ? { title: exerciseAssessment.title, ok: exerciseAssessment.kind === 'complete', checks: exerciseReferenceChecks(activeExercise, geometry) } : null;
  const fileName = activeExercise?.file ?? 'practica-torno.nc';
  const statusLabel = !validation.setup ? 'Completá la configuración'
    : status === 'loading' ? 'Preparando programa…'
    : status === 'error' ? 'Error al preparar'
    : result && !result.executable ? 'Revisar programa'
    : machine?.ended ? 'Programa finalizado'
    : result?.executable ? 'Listo para ejecutar'
    : 'Programa sin interpretar';

  useEffect(() => {
    if (!playback.running || !canPlay) return;
    const timer = window.setTimeout(() => dispatch({ type: 'tick', revision: playback.revision,
      cursor, runId: playback.runId }), 1000 / blocksPerSecond);
    return () => window.clearTimeout(timer);
  }, [playback.running, playback.revision, playback.runId, cursor, canPlay, blocksPerSecond]);

  useEffect(() => {
    if (!playback.running) return;
    const pauseWhenHidden = () => { if (document.hidden) dispatch({ type: 'pause' }); };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => document.removeEventListener('visibilitychange', pauseWhenHidden);
  }, [playback.running]);

  /** ISO geometry is display-only: it is saved with the document but never invalidates a run. */
  function changeIsoTools(isoTools: IsoTools) {
    documentVersion.current++;
    setDraft({ ...draft, isoTools });
  }
  /** Copying the ISO nose radius is a real setup change: it alters the cut. */
  function applyNoseRadius(toolId: ToolId, radiusMm: number) {
    const zero = { calibrationErrorX: '0', calibrationErrorZ: '0', wearX: '0', wearZ: '0' };
    changeSetup('offsets', { ...draft.offsets, [toolId]: { ...zero, ...draft.offsets?.[toolId], noseRadius: String(radiusMm) } });
  }
  /** Diagnostics live in the editor: bring its tab forward before focusing. */
  function locate(span: EditorFocusRequest['span'], severity: EditorFocusRequest['severity']) {
    setTab('programa');
    setEditorFocus({ revision: playback.revision, span, severity });
  }
  function edit(text: string) {
    documentVersion.current++;
    setSource(normalizeLineEndings(text));
    dispatch({ type: 'edit' });
  }
  function changeSetup<K extends keyof SetupDraft>(field: K, value: SetupDraft[K]) {
    documentVersion.current++;
    const nextDraft = { ...draft, [field]: value };
    setDraft(nextDraft);
    const next = validateSetupDraft(nextDraft);
    if (next.setup) setSetup(next.setup);
    dispatch({ type: 'edit' });
  }
  function restoreExample() {
    loadExercise(activeExercise ?? defaultExercise);
  }
  function snapshot(): LabDocument {
    return copyDocument({ source, setup, draft, exerciseId: activeExerciseId });
  }
  function applyDocument(document: LabDocument) {
    documentVersion.current++;
    setSource(normalizeLineEndings(document.source));
    setSetup(document.setup);
    setDraft(document.draft);
    setActiveExerciseId(document.exerciseId);
    if (document.exerciseId) setSelectedExerciseId(document.exerciseId);
    if (!validateSetupDraft(document.draft).setup) setTab('pieza');
    dispatch({ type: 'edit' });
  }
  function loadExercise(exercise: Practice) {
    const next = replaceDocument(snapshot(), exerciseDocument(exercise), previousDocument);
    setPreviousDocument(next.previous);
    applyDocument(next.document);
  }
  function openProject(document: LabDocument) {
    const next = replaceDocument(snapshot(), document, previousDocument);
    setPreviousDocument(next.previous);
    applyDocument(next.document);
  }
  function recoverDocument() {
    if (!previousDocument) return;
    const recovered = copyDocument(previousDocument);
    setPreviousDocument(snapshot());
    applyDocument(recovered);
  }
  async function compile() {
    if (!canCompile || !validation.setup) return;
    documentVersion.current++;
    const revision = playback.revision;
    dispatch({ type: 'compile', revision });
    try {
      const result = await compileProgram({ apiVersion: 2, dialect: 'edu-lathe-v2', sourceRevision: revision,
        source, setup: validation.setup });
      dispatch({ type: 'result', result });
    } catch (error) {
      dispatch({ type: 'error', revision, message: `No se pudo preparar el programa. ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  function keyboard(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'F8' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      if (!event.repeat && canStep) dispatch({ type: 'step', delta: event.shiftKey ? -1 : 1 });
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      void compile();
    }
  }

  return <main className="lathe-app workbench" onKeyDown={keyboard}>
    <header className="topbar">
      <a className="brand" href="#laboratorio" aria-label="Ir al laboratorio de torno">
        <span className="brandmark" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M6 8h17v16H6zM3 12h6m-6 8h6m8-15v22m10-11h-9" fill="none" stroke="currentColor" strokeWidth="1.6"/><circle cx="17" cy="16" r="3" fill="currentColor"/></svg></span>
        <span><strong>Torno CNC</strong><small>Laboratorio X/Z · modo educativo</small></span>
      </a>
      <div className={`session-status ${errors || status === 'error' ? 'has-error' : ''}`} role="status"><i/>{statusLabel}</div>
      <span className="learning-badge" title="Simulación educativa: sin validación para una máquina real."><i/>Modelo educativo</span>
      <button className="primary interpret-button" onClick={() => void compile()} disabled={!canCompile} aria-keyshortcuts="Control+Enter Meta+Enter">{status === 'loading' ? 'Preparando…' : 'Interpretar programa'}<kbd>Ctrl ↵</kbd></button>
    </header>

    <section className="stage panel" id="laboratorio" aria-labelledby="viewport-title">
      <div className="stage-toolbar">
        <h2 id="viewport-title" className="visually-hidden">Vista del torno</h2>
        <div className="view-selector segmented" role="group" aria-label="Tipo de vista"><button aria-pressed={viewMode === '2d'} onClick={() => setViewMode('2d')}>Vista 2D</button><button aria-pressed={viewMode === '3d'} onClick={() => setViewMode('3d')}>Pieza 3D</button><button aria-pressed={viewMode === 'split'} onClick={() => setViewMode('split')} title="Plano 2D y pieza 3D a la vez, sincronizados">Dividida</button></div>
        {viewMode !== '3d' && <button className="path-toggle" aria-pressed={showToolpath} onClick={() => setShowToolpath(!showToolpath)}><span aria-hidden="true">{showToolpath ? '◉' : '○'}</span> Trayectoria</button>}
        <div className="setup-summary"><span>Ø{format(setup.stock.diameterMm)} × {format(setup.stock.lengthMm)} mm{(setup.stock.innerDiameterMm ?? 0) > 0 && <> · interior Ø{format(setup.stock.innerDiameterMm!)}</>}</span><b data-testid="setup-tool-label">T{activeTool.station} · {activeTool.name}</b></div>
      </div>
      {/* Fixed child slots: switching to/from split keeps the mounted 2D/3D instances (camera, single WebGL context). */}
      <div className={`stage-view${viewMode === 'split' ? ' is-split' : ''}`} data-view-mode={viewMode}>
        {viewMode !== '3d' && <LatheViewport motions={result?.motions ?? []} cursor={cursor} position={tipPosition} stock={setup.stock} showToolpath={showToolpath} profile={geometry?.spans.length ? geometry : null} toolId={activeToolId} assemblies={assemblies} animation={toolAnimation} jaws={jaws} collisions={collisionMarkers}/>}
        {viewMode !== '2d' && <LatheThreeView stock={setup.stock} profile={geometry} position={tipPosition} toolId={activeToolId} section={section3d} onSectionChange={setSection3d} projection={projection} onProjectionChange={setProjection} assembly={assemblies[activeTool.id]} blocked={Boolean(result?.executable && (profileBusy || profileError || !geometry?.spans.length))} onReturn2D={() => setViewMode('2d')} animation={toolAnimation} jaws={jaws}/>}
      </div>
      <div className={`profile-readout ${geometry && !geometry.complete ? 'partial' : ''}`} data-profile-complete={geometry?.complete} data-profile-blocks={geometry?.evaluatedBlocks}>
        <span role="status" data-testid="profile-status">{!result?.executable ? 'Interpretá el programa para calcular el perfil.'
            : profileBusy ? 'Calculando perfil…' : profileError ? 'Perfil no disponible'
            : geometry?.complete ? `Perfil actualizado · bloque ${cursor}`
            : `Perfil parcial · hasta el bloque ${geometry?.evaluatedBlocks ?? 0}`}</span>
        {profileError && <div className="profile-error" role="alert"><p>{profileError}</p><button onClick={() => setProfileAttempt(profileAttempt + 1)}>Reintentar perfil</button></div>}
        {geometry && !geometry.complete && <div className="profile-warning"><p>La trayectoria puede continuar. El perfil queda en el último bloque que admite este modelo.</p>{geometry.diagnostics.map((d, i) => <p key={i}><button className="diagnostic-link" aria-label={`Ubicar ${d.code} en línea ${d.span.line}, columna ${d.span.columnStart}`} onClick={() => locate(d.span, d.severity)}>L{d.span.line} · {d.code}</button> {d.message}</p>)}</div>}
        {geometry?.profileVersion === 3 && <p data-testid="annular-volume">Volumen restante: {format(geometry.volumeMm3)} mm³ · perfil tubular G00/G01</p>}
      </div>
    </section>

    <section className="control-deck panel" aria-label="Posiciones y ejecución">
      <div className="transport">
          <div className="block-progress"><label htmlFor="execution-progress">{cursor === 0 ? 'Antes del primer bloque' : `Línea ${activeBlock?.span.line} completada`}<b data-testid="block-count">{cursor} / {total}</b></label><progress id="execution-progress" max={Math.max(1, total)} value={cursor}/></div>
          <div className="execution-controls">
            <div className="automatic-controls"><button className="play-button" aria-label={playback.running ? 'Pausar ejecución' : 'Reproducir programa'} disabled={!playback.running && !canPlay} onClick={() => dispatch({ type: playback.running ? 'pause' : 'play' })}>{playback.running ? 'Ⅱ Pausar' : '▶ Reproducir'}</button><label>Velocidad de reproducción<select aria-label="Velocidad de reproducción" value={blocksPerSecond} onChange={event => setBlocksPerSecond(Number(event.target.value))}><option value={0.5}>0,5 bloques/s</option><option value={1}>1 bloque/s</option><option value={2}>2 bloques/s</option><option value={4}>4 bloques/s</option></select></label><label className="animate-toggle" title="Solo presentación: la herramienta recorre las trayectorias del bloque. Con movimiento reducido del sistema salta directamente."><input type="checkbox" checked={animateTool} onChange={event => setAnimateTool(event.target.checked)}/>Animar trayectoria</label></div>
            <p className="playback-note visually-hidden" role="status">{playback.running ? 'Reproducción automática por bloques.' : 'Reproducción pausada.'} La velocidad es didáctica; no representa el avance F ni el tiempo de mecanizado.</p>
            <div className="transport-buttons"><button className="reset-button" onClick={() => dispatch({ type: 'reset' })} disabled={!canControl || cursor === 0} aria-label="Reiniciar ejecución"><span aria-hidden="true">↺</span> Reiniciar</button><button aria-keyshortcuts="Shift+F8" title="Anterior · Mayús+F8" onClick={() => dispatch({ type: 'step', delta: -1 })} disabled={!canStep || cursor === 0}>← Anterior</button><button className="primary next-button" aria-keyshortcuts="F8" title="Siguiente bloque · F8" onClick={() => dispatch({ type: 'step', delta: 1 })} disabled={!canStep || cursor >= total}>Siguiente bloque <span aria-hidden="true">→</span></button></div>
          </div>
        </div>
      <div className="current-block"><span>{activeBlock ? `Línea ${activeBlock.span.line}` : 'Bloque'}</span><code className="completed-code" data-testid="active-block">{activeBlock?.source ?? 'G00 / G01'}</code>
        {result?.estimatedTimeS !== undefined && <span className="time-readout" data-testid="time-readout" title="Estimación educativa: avance programado, rápidos a velocidad didáctica fija, sin aceleraciones ni cambios de herramienta.">Tiempo estimado {formatDuration(elapsedTimeS)} / {formatDuration(result.estimatedTimeS)}</span>}</div>
      <div className="telemetry">
          <div className="coordinate"><small>X <span>DIÁMETRO</span></small><output className={Math.abs(position.rMm * 2) >= 1e6 ? "long-number" : undefined} data-testid="dro-x">{(position.rMm * 2).toFixed(3)}</output><em>mm</em></div>
          <div className="coordinate"><small>Z <span>AXIAL</span></small><output className={Math.abs(position.zMm) >= 1e6 ? "long-number" : undefined} data-testid="dro-z">{position.zMm.toFixed(3)}</output><em>mm</em></div>
          <div className="aux-reading"><small>AVANCE F</small><strong data-testid="dro-feed">{machine?.feedMmMin === null || !machine ? '—' : format(machine.feedMmMin)} <em>{machine?.feedPerRev ? 'mm/vuelta · G99' : 'mm/min'}</em></strong><span>{motionShortLabel(machine?.motion ?? null)}</span></div>
          <div className="aux-reading spindle-reading"><small>HUSILLO S</small><strong>{format(machine?.spindleRpm ?? 0)} <em>rpm</em></strong><span className={machine?.spindleOn ? 'spindle-on' : ''}><i/>{machine?.spindleOn ? `Encendido · ${machine.spindleDirection === 'cw' ? 'horario' : 'antihorario'}` : 'Detenido'}</span>{machine?.cssMMin !== undefined && <span data-testid="dro-css">G96 · Vc {format(machine.cssMMin)} m/min · máx {format(machine.maxRpm ?? 0)} rpm</span>}</div>
          <div className="aux-reading tool-reading"><small>HERRAMIENTA T</small><strong data-testid="dro-tool-name">{activeTool.shortName}</strong><span data-testid="dro-tool-code">{activeTool.code}</span></div>
          {setup.toolOffsets && <div className="aux-reading tip-reading"><small>PUNTA FÍSICA</small><strong data-testid="tip-readout">X {(tipPosition.rMm * 2).toFixed(3)} · Z {tipPosition.zMm.toFixed(3)}</strong><span>{machine?.compensation ? `Compensación ${machine.compensation.toUpperCase()} activa · ` : ''}{tipShifted ? 'Con corrector: difiere de lo programado' : 'Coincide con lo programado'}</span></div>}
        </div>
    </section>

    <aside className="side-panel panel" aria-label="Panel de trabajo">
      <div className="side-tabs" role="tablist" aria-label="Secciones del laboratorio">
        {TABS.map(item => <button key={item.id} role="tab" id={`tab-${item.id}`} aria-selected={tab === item.id} aria-controls={`panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1}
          onClick={() => setTab(item.id)} onKeyDown={event => {
            const index = TABS.findIndex(t => t.id === tab);
            const move = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
            if (!move) return;
            event.preventDefault();
            const next = TABS[(index + move + TABS.length) % TABS.length];
            setTab(next.id);
            document.getElementById(`tab-${next.id}`)?.focus();
          }}>{item.label}{item.id === 'programa' && errors > 0 && <><span className="tab-badge" aria-hidden="true">{errors}</span><span className="visually-hidden"> ({errors} {errors === 1 ? 'error' : 'errores'})</span></>}</button>)}
      </div>

      <div className="tab-panel editor-panel" role="tabpanel" id="panel-programa" aria-labelledby="tab-programa" hidden={tab !== 'programa'}>
        <h2 id="program-title" className="visually-hidden">Programa G-code</h2>
        <div className="editor-document"><span className="file-dot"/>{activeExercise?.file ?? 'practica-torno.nc'} <span>{activeExercise && source === normalizeLineEndings(activeExercise.source) ? 'Ejemplo editable' : 'Modificado'}</span></div>
        <GCodeEditor source={source} onChange={edit} currentLine={activeBlock?.span.line ?? 0} revision={playback.revision} focusRequest={editorFocus}/>
        <div className="editor-actions"><button className="quiet-button" onClick={restoreExample}>Restaurar ejemplo</button><span>F8 siguiente · Mayús+F8 anterior · Ctrl/⌘+Enter interpretar</span></div>
        {previousDocument && <button className="recover-document" onClick={recoverDocument}>Recuperar programa anterior <span>(incluye configuración)</span></button>}
        {playback.error && <div className="engine-error" role="alert"><b>No se pudo preparar el programa</b><p>{playback.error} Revisá el detalle y volvé a interpretar. Si el problema persiste, recargá la página.</p></div>}
        {diagnostics.length > 0 && <div className="diagnostics-panel" aria-live="polite"><p>{errors > 0 ? `${errors} ${errors === 1 ? 'error impide' : 'errores impiden'} ejecutar el programa` : 'Avisos del programa'}. Seleccioná un diagnóstico para ubicarlo en el editor.</p><ul className="diagnostics" aria-label="Diagnósticos">{diagnostics.map((d, i) => <li key={i} className={d.severity}><button className="diagnostic-link" aria-label={`Ubicar ${d.code} en línea ${d.span.line}, columna ${d.span.columnStart}`} onClick={() => locate(d.span, d.severity)}>L{d.span.line}:{d.span.columnStart} · {d.code}</button><span>{d.message}</span></li>)}</ul></div>}
        <details className="dialect-help"><summary>¿Qué puedo programar?</summary><p>G00/G01 · X/Z absolutos · U/W incrementales · F en mm/min. X y U se programan en diámetro.</p><p>G02/G03 en G18: I desplaza el centro en radio y K en Z, relativos al inicio del arco. No se admite R ni círculos completos.</p><p>Ciclos: <code>G71 U… R…</code> (profundidad en radio y retracción), <code>G71 P… Q… U… W… F…</code> (perfil N, sobremedida X en diámetro y Z) y <code>G70 P… Q…</code> para el acabado. Desbaste exterior tipo I: el perfil empieza moviendo solo X, sigue con G00/G01, Z nunca aumenta y X nunca disminuye.</p><p>Radio de punta: G40 sin compensación, G42 con la nariz a la derecha del recorrido (cilindrado exterior hacia el plato) y G41 a la izquierda (mandrinado). Se activan y cancelan con el movimiento G00/G01 siguiente, solo en tramos rectos; el radio se carga en la tabla de correctores.</p><p>Husillo y avance: G97 S… rpm directas; G50 S… límite de rpm y G96 S… velocidad de corte constante en m/min (requiere G50 antes). G98 F en mm/min; G99 F en mm/vuelta (con el husillo encendido). El tiempo estimado es educativo: avance programado y rápidos a velocidad fija, sin aceleraciones.</p><p>G21, G18 · S, M03/M04/M05 · M02/M30. Herramientas T1/T01/T0101 hasta T4/T04/T0404; T5/T05/T0505 para mandrinado; T0/T0000 vuelve a la neutra. M06 es opcional.</p><p>El perfil admite cilindrado, conos y arcos hacia Z negativo, y refrentado frontal G01 hasta X0. Los límites del modelo se muestran en los avisos del perfil. En tubos: G00/G01 y mandrinado T5 desde un agujero existente, con refrentado exterior completo hasta el agujero; sin arcos ni cortes radiales parciales. Dialecto educativo <code>edu-lathe-v2</code>.</p></details>
      </div>

      <div className="tab-panel" role="tabpanel" id="panel-pieza" aria-labelledby="tab-pieza" hidden={tab !== 'pieza'}>
        <div className="setup-form" id="setup-form">
          <div className="setup-fields">{fields.map(field => <div className="setup-field" key={field.key}>
            <label htmlFor={`setup-${field.key}`}>{field.label}</label>
            <div className="input-unit"><input id={`setup-${field.key}`} value={draft[field.key] ?? (field.key === 'gripLength' ? String(jaws.gripLengthMm) : field.key === 'jawHeight' ? String(jaws.jawHeightMm) : '0')} onChange={e => changeSetup(field.key, e.target.value)} inputMode="decimal" autoComplete="off" aria-invalid={Boolean(validation.errors[field.key])} aria-describedby={validation.errors[field.key] ? `error-${field.key}` : undefined}/><span>{field.help}</span></div>
            {validation.errors[field.key] && <p className="field-error" id={`error-${field.key}`}>{validation.errors[field.key]}</p>}
          </div>)}
          <div className="setup-field setup-tool-field"><label htmlFor="setup-tool">Herramienta inicial</label>
            <select id="setup-tool" value={draft.toolId ?? setup.toolId} aria-describedby="setup-tool-help" onChange={event => {
              const tool=toolIdSchema.safeParse(event.target.value);
              if(tool.success) changeSetup('toolId',tool.data);
            }}>{Object.values(TOOL_CATALOGUE).sort((a, b) => a.station - b.station).map(tool => <option key={tool.id} value={tool.id}>{tool.code} · {tool.name}</option>)}</select>
            <p id="setup-tool-help">El programa puede cambiarla mediante T. La ejecución comienza con esta herramienta.</p>
          </div></div>
          <ToolOffsetsEditor offsets={draft.offsets} errors={validation.errors} onChange={offsets => changeSetup('offsets', offsets)}/>
          <button type="button" className="quiet-button" onClick={() => {
            const guided = exercises.find(exercise => exercise.id === 'boring-and-turning');
            if (guided) loadExercise(guided);
          }}>Cargar ejemplo de mandrinado</button>
          <p className="setup-note">Interior Ø0 indica sólido. Un tubo requiere un agujero existente; T5 es mandrinado. Z0 está en la cara frontal y Z negativo va hacia el plato. Las mordazas son nominales: toman la pieza desde el plato y el motor avisa si la herramienta, el mango o el inserto entran en esa zona o tocan el material que queda (aviso educativo, no una garantía de seguridad). Al cambiar una medida o herramienta, volvé a interpretar el programa.{!validation.setup && ' La vista conserva la última configuración válida.'}</p>
        </div>
        <div className="sheet-launch"><button onClick={() => setSheetOpen(true)} disabled={!geometry?.spans.length}>Hoja de cotas</button><span>{geometry?.spans.length ? `${sheetStatus} · dibujo con cotas de la pieza obtenida` : 'Interpretá el programa para dibujar la pieza.'}</span></div>
        <details className="profile-details"><summary>Modelo de corte y medidas del perfil</summary><p>En sólidos: cilindrado, conos y arcos exteriores hacia Z negativo; refrentado frontal G01 hasta X0. En tubos: G00/G01 longitudinales y T5 desde un agujero existente; refrentado exterior completo hasta el agujero. El corte requiere husillo encendido y S mayor que cero; los rápidos no remueven material. Los arcos se aproximan con cuerdas de tolerancia perpendicular 0,01 mm. La herramienta corta con punta ideal o con el radio de punta de la tabla.</p>
          {geometry && geometry.spans.length > 0 && <table aria-label="Medidas del perfil calculado"><thead><tr><th>Z inicial (mm)</th><th>Z final (mm)</th><th>Diámetro exterior inicio → fin (mm)</th>{geometry.profileVersion === 3 && <th>Diámetro interior inicio → fin (mm)</th>}</tr></thead><tbody>{exteriorSpans(geometry).slice(-20).map((span, i) => <tr key={i}><td>{format(span.zStartMm)}</td><td>{format(span.zEndMm)}</td><td>{span.rStartMm === span.rEndMm ? format(span.rStartMm * 2) : `${format(span.rStartMm * 2)} → ${format(span.rEndMm * 2)}`}</td>{geometry.profileVersion === 3 && <td>{format(geometry.spans.slice(-20)[i].innerStartMm * 2)} → {format(geometry.spans.slice(-20)[i].innerEndMm * 2)}</td>}</tr>)}</tbody></table>}
          {geometry && geometry.spans.length > 20 && <p>Se muestran los últimos 20 de {geometry.spans.length} intervalos; los arcos se aproximan con tramos lineales.</p>}
        </details>
      </div>

      <div className="tab-panel" role="tabpanel" id="panel-herramientas" aria-labelledby="tab-herramientas" hidden={tab !== 'herramientas'}>
        <ToolLibrary initialToolId={draft.toolId ?? setup.toolId ?? 'generic-od'} activeToolId={activeToolId} onSelect={id => changeSetup('toolId', id)} assemblies={assemblies}/>
        <IsoToolsEditor isoTools={draft.isoTools} results={isoResults} onChange={changeIsoTools} onUseNoseRadius={applyNoseRadius}/>
        <ToolInspector activeToolId={activeToolId} assemblies={assemblies}/>
      </div>

      <div className="tab-panel learning-panel" role="tabpanel" id="panel-explicacion" aria-labelledby="tab-explicacion" hidden={tab !== 'explicacion'} aria-live="polite">
        <span className="learning-icon" aria-hidden="true">i</span><div className="learning-copy"><p className="eyebrow">{activeBlock ? `BLOQUE COMPLETADO · LÍNEA ${activeBlock.span.line}` : 'APRENDÉ CON CADA BLOQUE'}</p><h2>{explanation.title}</h2><p>{explanation.description}</p><details key={activeBlock?.id ?? 'initial'} open><summary>Ver explicación y coordenadas</summary><ul>{explanation.details.map((detail, i) => <li key={i}>{detail}</li>)}</ul></details></div>
        <p className="model-note"><b>X en diámetro</b> · Z0 en la cara · mm. Simulación educativa: perfiles idealizados, sin validación para una máquina real.</p>
      </div>

      <div className="tab-panel" role="tabpanel" id="panel-practicas" aria-labelledby="tab-practicas" hidden={tab !== 'practicas'}>
        <GuidedPractice exercises={exercises} activeId={activeExerciseId} selectedId={selectedExerciseId} onSelect={setSelectedExerciseId} onLoad={loadExercise} assessment={exerciseAssessment} profile={geometry?.profileVersion === 3 ? geometry : null} onLocate={span => locate(span, activeExercise && 'diagnostic' in activeExercise ? activeExercise.diagnostic.severity : 'warning')}/>
        {sheetComparison && <div className="sheet-launch"><button onClick={() => setSheetOpen(true)}>Ver hoja de cotas · pedido vs. obtenido</button></div>}
        <ProjectActions document={snapshot()} onOpen={openProject} getDocumentVersion={() => documentVersion.current}/>
      </div>
    </aside>
    {geometry && geometry.spans.length > 0 && <DimensionSheetDialog open={sheetOpen} onClose={() => setSheetOpen(false)} profile={geometry} stock={setup.stock}
      fileName={fileName} tools={sheetTools.length ? sheetTools : [`T${activeTool.station} ${activeTool.shortName}`]} status={sheetStatus} partial={!sheetFinal} comparison={sheetComparison}/>}
  </main>;
}
