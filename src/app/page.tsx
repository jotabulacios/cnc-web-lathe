import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import LatheLab from '../components/LatheLab';
import { exerciseDefinitionSchema } from '../lib/lathe/exercises';
import { diagnosticDefinitionSchema, practicesSchema } from '../lib/lathe/diagnosticExercises';
// Read the fixture at static build time; the exported application needs no server.
export default function Home() {
  const source=readFileSync(join(process.cwd(),'fixtures/lathe/two-step-turning.nc'),'utf8');
  const readCatalogue = (file: string) => JSON.parse(readFileSync(join(process.cwd(), 'fixtures/lathe', file), 'utf8')) as unknown[];
  const definitions = [...readCatalogue('exercises.json'), ...readCatalogue('diagnostic-corrections.json'), ...readCatalogue('annular-exercises.json'), ...readCatalogue('annular-corrections.json'), ...readCatalogue('cycle-exercises.json')]
    .map(value => exerciseDefinitionSchema.parse(value));
  const diagnostics = [...readCatalogue('diagnostic-exercises.json'), ...readCatalogue('annular-diagnostics.json')].map(value => diagnosticDefinitionSchema.parse(value));
  const exercises = practicesSchema.parse([...definitions, ...diagnostics].map(definition => ({
    ...definition, source: readFileSync(join(process.cwd(), 'fixtures/lathe', definition.file), 'utf8'),
  })));
  return <LatheLab initialSource={source} exercises={exercises}/>;
}
