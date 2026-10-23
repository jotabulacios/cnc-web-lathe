import { isDiagnostic, type Practice, type PracticeAssessment } from '../lib/lathe/diagnosticExercises';
import AnnularReferences from './AnnularReferences';
import type { StockProfileV3 } from '../lib/lathe/annularProfile';
import type { EditorFocusRequest } from '../lib/lathe/editorLocation';

type Props = { exercises: Practice[]; activeId: string | null; selectedId: string;
  onSelect: (id: string) => void; onLoad: (exercise: Practice) => void; assessment: PracticeAssessment | null; profile: StockProfileV3 | null; onLocate:(span:EditorFocusRequest['span'])=>void };
export default function GuidedPractice({ exercises, activeId, selectedId, onSelect, onLoad, assessment, profile, onLocate }: Props) {
  const selected = exercises.find(e => e.id === selectedId) ?? exercises[0];
  const active = exercises.find(e => e.id === activeId);
  const annularReference = active ? isDiagnostic(active) ? active.diagnostic.stage === 'annular-profile' ? active.diagnostic.frozenProfile : null : active.expectedAnnularProfile ?? null : null;
  const currentProfile = assessment && assessment.kind !== 'modified' && assessment.kind !== 'pending' ? profile : null;
  const measure=(value:number)=>value>0&&value<1e-4?value.toExponential(1):value.toLocaleString('es-AR',{maximumFractionDigits:6});
  return <details className="guided-practice" open>
    <summary>Ejemplos guiados <span>{active?.title ?? 'Práctica libre'}</span></summary>
    <div className="practice-content">
      <div className="practice-picker"><label htmlFor="exercise-choice">Elegí un ejemplo<select id="exercise-choice" value={selected.id} onChange={event => onSelect(event.target.value)}>{exercises.map(exercise => <option value={exercise.id} key={exercise.id}>{exercise.title}</option>)}</select></label><button onClick={() => onLoad(selected)}>Cargar ejemplo</button></div>
      <p className="practice-preview">Al cargar «{selected.title}»: {selected.objective}</p>
      {active && <div className="practice-guide"><h2>En práctica: {active.title}</h2><p>{active.objective}</p><ol>{active.observations.map((observation, i) => <li key={i}>{observation}</li>)}</ol><p><b>Resultado esperado:</b> {active.expected}</p><p>Configuración del ejemplo: Ø{active.setup.stock.diameterMm} × {active.setup.stock.lengthMm} mm{(active.setup.stock.innerDiameterMm ?? 0) > 0 && <> · Interior Ø{active.setup.stock.innerDiameterMm} mm</>} · Inicio X Ø{active.setup.initialPosition.rMm * 2} / Z {active.setup.initialPosition.zMm}.</p></div>}
      {active&&!isDiagnostic(active)&&active.expectedProfile&&<details className="practice-references"><summary>Cotas y tolerancias de referencia</summary>
        <p>Se comprueban estas cotas y el volumen del material restante. Las tolerancias corresponden a este ejemplo.</p>
        <div className="reference-table"><table aria-label="Cotas de referencia del ejemplo"><thead><tr><th>Z (mm)</th><th>X Ø de referencia (mm)</th><th>Tolerancia en Ø (±mm)</th></tr></thead><tbody>
          {active.expectedProfile.samples.map(sample=><tr key={sample.zMm}><td>{measure(sample.zMm)}</td><td>{measure(sample.radiusMm*2)}</td><td>{measure(sample.toleranceMm*2)}</td></tr>)}
        </tbody></table></div>
        <p>Volumen de referencia: {measure(active.expectedProfile.volumeMm3)} mm³ · tolerancia ±{measure(active.expectedProfile.volumeToleranceMm3)} mm³.</p>
      </details>}
      {annularReference && <AnnularReferences reference={annularReference} profile={currentProfile} diagnostic={Boolean(active && isDiagnostic(active))}/>}
      {assessment && <div className={`exercise-assessment ${assessment.kind}`} role="status" data-testid="exercise-status" data-state={assessment.kind}><strong>{assessment.title}</strong><p>{assessment.detail}</p>{assessment.targetSpan&&<button onClick={()=>onLocate(assessment.targetSpan!)}>Ubicar diagnóstico en línea {assessment.targetSpan.line}</button>}</div>}
      {active&&isDiagnostic(active)&&<div className="diagnostic-reference"><p>La referencia reemplaza el programa y conserva una copia recuperable del documento actual.</p><button onClick={()=>{
        const correction=exercises.find(e=>e.id===active.correctionId);
        if(correction) onLoad(correction);
      }}>Cargar corrección de referencia</button></div>}
      <p className="practice-note">Son ejemplos completos para observar, no una evaluación de programas libres. Podés editarlos. La copia recuperable del programa anterior dura mientras esta pestaña siga abierta.</p>
    </div>
  </details>;
}
