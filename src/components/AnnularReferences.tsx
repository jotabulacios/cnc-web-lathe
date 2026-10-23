import type { AnnularReference } from '../lib/lathe/exercises';
import type { StockProfileV3 } from '../lib/lathe/annularProfile';
import { annularRadiiAt, annularVolumeMm3 } from '../lib/lathe/annularMeasures';

type Props = { reference: AnnularReference; profile: StockProfileV3 | null; diagnostic?: boolean };
const measure = (value: number) => value !== 0 && Math.abs(value) <= 1e-4
  ? value.toExponential(1)
  : value.toLocaleString('es-AR', { maximumFractionDigits: 6 });

/** Compare measured resolved sections with a reference; no CNC interpretation
 * or completion decision. The parent supplies only the current confirmed profile. */
export default function AnnularReferences({ reference, profile, diagnostic = false }: Props) {
  const volume = profile ? annularVolumeMm3(profile.spans) : null;
  const difference = volume === null ? null : volume - reference.volumeMm3;
  return <details className="practice-references">
    <summary>{diagnostic ? 'Material que debe conservarse tras el aviso' : 'Cotas interiores, exteriores y volumen de referencia'}</summary>
    <p>{diagnostic
      ? 'Estas cotas describen el material que debe conservarse. El aviso se comprueba en su bloque; la coincidencia de medidas por sí sola no confirma el diagnóstico.'
      : 'La comparación corresponde al objetivo final. Durante el recorrido es normal que las cotas aún difieran; coincidir en una sección no confirma por sí solo el recorrido completo.'}</p>
    <p>X se muestra en diámetro. Cada tolerancia en Ø es el doble de la tolerancia radial de esta referencia.</p>
    <div className="reference-table"><table aria-label="Cotas anulares de referencia del ejemplo"><thead><tr>
      <th>Z (mm)</th><th>Ø interior de referencia (mm)</th><th>Ø exterior de referencia (mm)</th>
      <th>Tolerancia en Ø (±mm)</th><th>Ø interior actual (mm)</th><th>Ø exterior actual (mm)</th><th>Comparación</th>
    </tr></thead><tbody>{reference.samples.map(sample => {
      const radii = profile ? annularRadiiAt(profile.spans, sample.zMm) : null;
      const state = radii === null ? 'unavailable'
        : Math.abs(radii.innerMm - sample.innerRadiusMm) <= sample.toleranceMm
          && Math.abs(radii.outerMm - sample.outerRadiusMm) <= sample.toleranceMm ? 'match' : 'different';
      return <tr key={sample.zMm} data-testid="annular-reference-row" data-state={state}>
        <td>{measure(sample.zMm)}</td><td>{measure(sample.innerRadiusMm * 2)}</td><td>{measure(sample.outerRadiusMm * 2)}</td>
        <td>{measure(sample.toleranceMm * 2)}</td><td>{radii === null ? '—' : measure(radii.innerMm * 2)}</td><td>{radii === null ? '—' : measure(radii.outerMm * 2)}</td>
        <td>{state === 'unavailable' ? 'Sin perfil' : state === 'match' ? 'Coincide' : 'Aún difiere'}</td>
      </tr>;
    })}</tbody></table></div>
    <p data-testid="annular-reference-volume">Volumen de referencia: {measure(reference.volumeMm3)} mm³ · tolerancia ±{measure(reference.volumeToleranceMm3)} mm³.</p>
    {profile && <>
      <p>Material confirmado hasta el bloque {profile.evaluatedBlocks}.</p>
      <p data-testid="annular-measured-volume">Volumen actual medido: {volume === null ? '—' : measure(volume)} mm³.</p>
      <p data-testid="annular-volume-difference">Diferencia respecto de la referencia: {difference === null ? '—' : `${difference > 0 ? '+' : ''}${measure(difference)}`} mm³.</p>
    </>}
  </details>;
}
