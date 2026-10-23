import { resultSchema, type CompileRequest, type CompileResult } from './contract.ts';
import { stockProfileSchema, stockProfileV2Schema, type ProfileRequest, type StockProfile, type StockProfileV2 } from './profile.ts';
import { createTimedLoader } from './loader.ts';
import { stockProfileV3Schema, type DisplayProfile } from './annularProfile.ts';
type WasmModule = { default: (options: { module_or_path: ArrayBuffer }) => Promise<unknown>; compile: (request: CompileRequest) => unknown; compile_v2?: (request: CompileRequest) => unknown; stock_profile: (request: ProfileRequest) => unknown; stock_profile_v2?: (request: ProfileRequest) => unknown; stock_profile_v3?: (request: ProfileRequest & { innerDiameterMm: number }) => unknown; lab_profile?: (request: ProfileRequest & { innerDiameterMm: number }) => unknown };
const initialize = createTimedLoader<WasmModule>(async (signal, attempt) => {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  const path = `${base}/wasm/v1/cnc_wasm.js${attempt ? `?attempt=${attempt}` : ''}`;
  const wasm: WasmModule = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ path);
  signal.throwIfAborted();
  if (typeof wasm.default !== 'function' || typeof wasm.compile !== 'function' || typeof wasm.stock_profile !== 'function') {
    throw new Error('El módulo del motor no tiene la versión de interfaz esperada.');
  }
  const response = await fetch(`${base}/wasm/v1/cnc_wasm_bg.wasm`, { signal });
  if (!response.ok) throw new Error(`No se pudo descargar el motor (HTTP ${response.status}).`);
  const binary = await response.arrayBuffer();
  signal.throwIfAborted();
  await wasm.default({ module_or_path: binary });
  signal.throwIfAborted();
  return wasm;
}, 20_000);
export async function compileProgram(request: CompileRequest): Promise<CompileResult> {
  const wasm = await initialize();
  if (request.apiVersion === 2 && !wasm.compile_v2) throw new Error('El motor no tiene la interfaz de torno v2.');
  const result = resultSchema.parse((request.apiVersion === 2 ? wasm.compile_v2! : wasm.compile)(wireRequest(request)));
  if (result.apiVersion !== request.apiVersion || result.dialect !== request.dialect || result.sourceRevision !== request.sourceRevision) throw new Error('El motor devolvió una revisión incorrecta.');
  return result;
}

/** Material interior belongs to reconstruction, never an ignored compiler field. */
function wireRequest(request: CompileRequest): CompileRequest {
  const { diameterMm, lengthMm } = request.setup.stock;
  return { ...request, setup: { ...request.setup, stock: { diameterMm, lengthMm } } };
}

/** Rust chooses the exterior (v2) or annular (v3) model; the adapter only validates it. */
export async function computeLabProfile(request: ProfileRequest): Promise<DisplayProfile> {
  const innerDiameterMm = request.program.setup.stock.innerDiameterMm ?? 0;
  const wasm = await initialize();
  if (!wasm.lab_profile) throw new Error('El motor no tiene la interfaz de perfil del laboratorio.');
  const raw = wasm.lab_profile({ ...request, program: wireRequest(request.program), innerDiameterMm });
  const version = (raw as { profileVersion?: unknown } | null)?.profileVersion;
  if (version === 2) {
    if (innerDiameterMm !== 0) throw new Error('El motor eligió un perfil exterior para un tubo.');
    return checkExterior(stockProfileV2Schema.parse(raw), request);
  }
  const profile = stockProfileV3Schema.parse(raw);
  const stock = request.program.setup.stock;
  if (profile.sourceRevision !== request.program.sourceRevision || profile.completedBlocks !== request.completedBlocks
    || !profile.spans.length || profile.spans[0].zStartMm !== -stock.lengthMm || profile.spans.at(-1)!.zEndMm !== 0
    || profile.spans.some(s => Math.max(s.outerStartMm, s.outerEndMm) > stock.diameterMm / 2
      || Math.min(s.innerStartMm, s.innerEndMm) < innerDiameterMm / 2)) {
    throw new Error('El perfil tubular no corresponde al material, revisión o bloque solicitados.');
  }
  return profile;
}

export async function computeStockProfile(request: ProfileRequest): Promise<StockProfile> {
  const wasm = await initialize();
  const profile = stockProfileSchema.parse(wasm.stock_profile(request));
  if (profile.sourceRevision !== request.program.sourceRevision || profile.completedBlocks !== request.completedBlocks) {
    throw new Error('El perfil no corresponde a la revisión y bloque solicitados.');
  }
  return profile;
}

/** Current laboratory profile adapter; v1 exports remain available separately. */
export async function computeStockProfileV2(request: ProfileRequest): Promise<StockProfileV2> {
  const wasm = await initialize();
  if (typeof wasm.stock_profile_v2 !== 'function') throw new Error('El módulo del motor no tiene la interfaz de perfil lineal v2.');
  return checkExterior(stockProfileV2Schema.parse(wasm.stock_profile_v2(request)), request);
}

function checkExterior(profile: StockProfileV2, request: ProfileRequest): StockProfileV2 {
  if (profile.sourceRevision !== request.program.sourceRevision || profile.completedBlocks !== request.completedBlocks) {
    throw new Error('El perfil no corresponde a la revisión y bloque solicitados.');
  }
  const stock = request.program.setup.stock;
  if (!profile.spans.length || profile.spans[0].zStartMm !== -stock.lengthMm
    || profile.spans.at(-1)!.zEndMm !== 0
    || profile.spans.some(s => s.rStartMm > stock.diameterMm / 2 || s.rEndMm > stock.diameterMm / 2)) {
    throw new Error('El perfil lineal no corresponde a las dimensiones del material.');
  }
  return profile;
}
