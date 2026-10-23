'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { LabDocument } from '../lib/lathe/document';
import { decodeProject, encodeProject, loadProject, MAX_PROJECT_BYTES, ProjectFormatError, saveProject } from '../lib/lathe/project';
import { MAX_PROGRAM_BYTES } from '../lib/lathe/project';
import { decodeProgramFile, encodeProgramFile } from '../lib/lathe/programFile';

type Props = { document: LabDocument; onOpen: (document: LabDocument) => void; getDocumentVersion: () => number };
export default function ProjectActions({ document: labDocument, onOpen, getDocumentVersion }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const programInput = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error' | 'busy'; message: string } | null>(null);
  useEffect(() => () => { requestId.current++; }, []);
  function save() {
    try { saveProject(window.localStorage, labDocument, 2); setNotice({ kind: 'ok', message: 'Proyecto guardado en este navegador.' }); }
    catch (error) { setNotice({ kind: 'error', message: error instanceof ProjectFormatError ? error.message : 'No se pudo guardar en este navegador. El programa sigue abierto; podés descargar el proyecto como archivo.' }); }
  }
  function openSaved() {
    requestId.current++;
    try {
      const saved = loadProject(window.localStorage);
      if (!saved) { setNotice({ kind: 'error', message: 'No hay un proyecto guardado en este navegador.' }); return; }
      onOpen(saved);
      setNotice({ kind: 'ok', message: 'Proyecto recuperado. Revisá la configuración y volvé a interpretar.' });
    } catch { setNotice({ kind: 'error', message: 'No se pudo abrir el guardado local o su formato no es válido. Se conservó el programa actual.' }); }
  }
  function download(program = false) {
    try {
      const text = program ? encodeProgramFile(labDocument.source) : encodeProject(labDocument, 2);
      const url = URL.createObjectURL(new Blob([text], { type: program ? 'text/plain;charset=utf-8' : 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = program ? 'torno-programa.nc' : 'torno-proyecto.cnc.json';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice({ kind: 'ok', message: program ? 'Se preparó la descarga del programa G-code.' : 'Se preparó la descarga del proyecto.' });
    } catch (error) { setNotice({ kind: 'error', message: error instanceof Error ? error.message : 'No se pudo preparar la descarga.' }); }
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>, program = false) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const request = ++requestId.current;
    const version = getDocumentVersion();
    if (file.size > (program ? MAX_PROGRAM_BYTES : MAX_PROJECT_BYTES)) { setNotice({ kind: 'error', message: `El archivo supera el límite de ${program ? '256 KiB' : '2 MiB'}. No se modificó el programa.` }); return; }
    setNotice({ kind: 'busy', message: program ? 'Leyendo programa…' : 'Leyendo proyecto…' });
    try {
      const content = program ? decodeProgramFile(await file.arrayBuffer()) : await file.text();
      if (request !== requestId.current) return;
      if (version !== getDocumentVersion()) {
        setNotice({ kind: 'error', message: 'Se conservó tu edición más reciente; volvé a abrir el archivo si querés reemplazarla.' });
        return;
      }
      const imported = program ? { ...labDocument, source: content, exerciseId: null } : decodeProject(content);
      onOpen(imported);
      setNotice({ kind: 'ok', message: program ? 'Programa abierto con la configuración actual. Revisala y volvé a interpretar.' : 'Proyecto abierto. Revisá la configuración y volvé a interpretar.' });
    } catch (error) {
      if (request === requestId.current) setNotice({ kind: 'error', message: `${error instanceof Error ? error.message : 'No se pudo leer el archivo.'} Se conservó el programa actual.` });
    }
  }
  return <details className="project-actions" open>
    <summary>Guardar y abrir proyecto</summary>
    <div className="project-content"><div className="project-buttons">
      <button onClick={save}>Guardar en este navegador</button><button onClick={openSaved}>Abrir guardado local</button>
      <button onClick={() => download()}>Descargar proyecto JSON</button><button onClick={() => fileInput.current?.click()}>Abrir archivo JSON</button>
      <input ref={fileInput} type="file" accept=".json,application/json" hidden aria-label="Archivo de proyecto JSON" onChange={event => void importFile(event)}/>
      <button onClick={() => download(true)}>Descargar programa .nc</button><button onClick={() => programInput.current?.click()}>Abrir programa G-code</button>
      <input ref={programInput} type="file" accept=".nc,.tap,.gcode,.txt,text/plain" hidden aria-label="Archivo de programa G-code" onChange={event => void importFile(event, true)}/>
    </div><p>Se guarda el código y la configuración, incluidos campos pendientes de corregir. Guardar reemplaza el proyecto local anterior. La simulación se calcula nuevamente al abrir. Podés recuperar el programa anterior desde el editor.</p>
      <p>El archivo .nc contiene solo código: al abrirlo se conserva la pieza y el origen actuales. Texto UTF-8 de hasta 256 KiB; los códigos no admitidos se muestran al interpretar.</p>
      {notice && <p role={notice.kind === 'error' ? 'alert' : 'status'} data-testid="project-notice" className={`project-notice ${notice.kind}`}>{notice.message}</p>}
    </div>
  </details>;
}
