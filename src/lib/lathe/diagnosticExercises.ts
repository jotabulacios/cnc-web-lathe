import { z } from 'zod';
import { setupSchema } from './contract.ts';
import { assessExercise, exerciseSchema, expectedSpanSchema, expectedSpansMatch, sampledAnnularProfileSchema, validAnnularReference, expectedAnnularProfileMatches, type AssessmentInput, type Exercise, type ExerciseAssessment } from './exercises.ts';
import { normalizeLineEndings, sameSetup } from './document.ts';

const originSchema=z.object({line:z.number().int().positive(),columnStart:z.number().int().positive(),columnEnd:z.number().int().positive()}).strict()
  .refine(span=>span.columnEnd>span.columnStart,'El span debe tener longitud positiva.');
const expectedDiagnostic=z.discriminatedUnion('stage',[
  z.object({stage:z.literal('compile'),code:z.literal('UNSUPPORTED_CODE'),severity:z.literal('error'),span:originSchema}).strict(),
  z.object({stage:z.literal('profile'),code:z.literal('SPINDLE_OFF'),severity:z.literal('warning'),span:originSchema,
    failedAtBlock:z.number().int().positive(),evaluatedBlocks:z.number().int().nonnegative(),
    frozenSpans:z.array(expectedSpanSchema).min(1).max(4096),toleranceMm:z.number().finite().nonnegative().max(1e-6),
  }).strict().refine(d=>d.evaluatedBlocks===d.failedAtBlock-1,'Debe conservarse el prefijo anterior al corte.'),
  z.object({stage:z.literal('annular-profile'),code:z.literal('RAPID_IN_STOCK'),severity:z.literal('warning'),span:originSchema,
    failedAtBlock:z.number().int().positive(),evaluatedBlocks:z.number().int().nonnegative(),frozenProfile:sampledAnnularProfileSchema,
  }).strict().refine(d=>d.evaluatedBlocks===d.failedAtBlock-1,'Debe conservarse el prefijo anterior al rápido.'),
]);
export const diagnosticDefinitionSchema=z.object({
  id:z.string().regex(/^[a-z-]+$/),file:z.string().regex(/^[a-z-]+\.nc$/),
  title:z.string().min(1),objective:z.string().min(1),observations:z.array(z.string().min(1)).min(1),expected:z.string().min(1),
  setup:setupSchema,diagnostic:expectedDiagnostic,correctionId:z.string().regex(/^[a-z-]+$/),
}).strict().superRefine((practice,ctx)=>{
  if(practice.diagnostic.stage==='annular-profile'&&!validAnnularReference(practice.diagnostic.frozenProfile,practice.setup)) {
    ctx.addIssue({code:'custom',path:['diagnostic','frozenProfile'],message:'Las referencias del material congelado deben estar dentro del stock.'});
  }
});
export const diagnosticExerciseSchema=diagnosticDefinitionSchema.safeExtend({source:z.string().min(1)});
export type DiagnosticExercise=z.infer<typeof diagnosticExerciseSchema>;
export type Practice=Exercise|DiagnosticExercise;
export function isDiagnostic(practice:Practice):practice is DiagnosticExercise { return 'diagnostic' in practice; }
export const practicesSchema=z.array(z.union([exerciseSchema,diagnosticExerciseSchema])).min(1).superRefine((items,ctx)=>{
  if(new Set(items.map(p=>p.id)).size!==items.length) ctx.addIssue({code:'custom',message:'Identificador de práctica duplicado.'});
  for(const practice of items) if(isDiagnostic(practice)&&!items.some(p=>p.id===practice.correctionId&&!isDiagnostic(p))) {
    ctx.addIssue({code:'custom',message:`La corrección de ${practice.id} debe ser un recorrido con perfil de referencia.`});
  }
});
export type PracticeAssessment=Omit<ExerciseAssessment,'kind'>&{
  kind:ExerciseAssessment['kind']|'observed';targetSpan?:z.infer<typeof originSchema>;
};
const sameSpan=(a:z.infer<typeof originSchema>,b:z.infer<typeof originSchema>)=>a.line===b.line&&a.columnStart===b.columnStart&&a.columnEnd===b.columnEnd;
/** Observe only current Rust diagnostics; never infer CNC errors from source text. */
export function assessPractice(practice:Practice,input:AssessmentInput):PracticeAssessment {
  if(!isDiagnostic(practice)) return assessExercise(practice,input);
  const {source,setup,result,revision,cursor,profile:received,profileError}=input;
  if(normalizeLineEndings(source)!==normalizeLineEndings(practice.source)||!setup||!sameSetup(setup,practice.setup)) {
    return {kind:'modified',title:'Práctica libre · ejemplo modificado',detail:'La comprobación de diagnóstico corresponde al programa y la configuración originales.'};
  }
  if(!result||result.sourceRevision!==revision) return {kind:'pending',title:'Interpretá la práctica de diagnóstico',detail:'Observá el aviso del motor y ubicá su bloque antes de cargar la referencia.'};
  const want=practice.diagnostic;
  const matches=(items:typeof result.diagnostics)=>items.length===1&&items[0].code===want.code&&items[0].severity===want.severity&&sameSpan(items[0].span,want.span);
  const observed=(span:z.infer<typeof originSchema>):PracticeAssessment=>({kind:'observed',title:'Diagnóstico observado',detail:practice.expected,targetSpan:{...span}});
  const mismatch=():PracticeAssessment=>({kind:'mismatch',title:'El diagnóstico difiere de la referencia',detail:'No se confirmó este caso. Revisá el aviso, su bloque y el estado del perfil.'});
  if(want.stage==='compile') return !result.executable&&cursor===0&&matches(result.diagnostics)?observed(result.diagnostics[0].span):mismatch();
  if(!result.executable||result.diagnostics.length) return mismatch();
  if(profileError) return {kind:'blocked',title:'Perfil no disponible',detail:'Reintentá el cálculo antes de comprobar el diagnóstico.'};
  if(cursor!==want.failedAtBlock) return {kind:'progress',title:`Buscá el bloque ${want.failedAtBlock}`,detail:cursor<want.failedAtBlock
    ?want.stage==='annular-profile'?'Avanzá hasta el rápido y observá el perfil.':'Avanzá hasta el corte y observá el perfil.'
    :'Retrocedé al bloque del diagnóstico para comprobarlo.'};
  const profile=received?.sourceRevision===revision&&received.completedBlocks===cursor?received:null;
  if(!profile) return {kind:'waiting',title:'Esperando el perfil del bloque',detail:'La comprobación usa la respuesta actual del motor.'};
  if(want.stage==='annular-profile') return profile.profileVersion===3&&result.apiVersion===2&&result.dialect==='edu-lathe-v2'&&!profile.complete
    &&profile.evaluatedBlocks===want.evaluatedBlocks&&matches(profile.diagnostics)
    &&expectedAnnularProfileMatches(profile,{setup:practice.setup,expectedAnnularProfile:want.frozenProfile})
      ?observed(profile.diagnostics[0].span):mismatch();
  return profile.profileVersion===2&&!profile.complete&&profile.evaluatedBlocks===want.evaluatedBlocks
    &&matches(profile.diagnostics)&&expectedSpansMatch(profile.spans,want.frozenSpans,want.toleranceMm)?observed(profile.diagnostics[0].span):mismatch();
}
