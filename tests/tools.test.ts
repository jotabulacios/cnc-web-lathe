import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  toolIdSchema,
  setupSchema,
  type ToolId,
  defaultSetup,
  resultSchema,
} from '../src/lib/lathe/contract.ts';
import { getToolDefinition, TOOL_CATALOGUE } from '../src/lib/lathe/tools.ts';
import { explainBlock } from '../src/lib/lathe/explain.ts';

test('tool catalogue defines all 6 educational tools with unique stations and geometries', () => {
  const tools = ['generic-od', 'roughing-od', 'finishing-od', 'grooving-od', 'facing-od', 'boring-id'] as const;
  assert.equal(Object.keys(TOOL_CATALOGUE).length, 6);

  const stations = new Set<number>();
  for (const id of tools) {
    const tool = TOOL_CATALOGUE[id];
    assert.equal(tool.id, id);
    assert.ok(tool.name.length > 0);
    assert.ok(tool.code.length > 0);
    assert.ok(tool.geometry.color.startsWith('#'));
    assert.ok(!stations.has(tool.station), `Duplicate station ${tool.station}`);
    stations.add(tool.station);
  }

  assert.equal(getToolDefinition('unknown' as ToolId).id, 'generic-od');
  assert.equal(getToolDefinition(null).id, 'generic-od');
  assert.equal(getToolDefinition('roughing-od').station, 1);
  assert.equal(getToolDefinition('finishing-od').station, 2);
  assert.equal(getToolDefinition('grooving-od').station, 3);
  assert.equal(getToolDefinition('facing-od').station, 4);
  assert.equal(getToolDefinition('boring-id').station, 5);
  assert.equal(getToolDefinition('boring-id').code, 'T0505');
});

test('contract validates toolId in setup and motions strictly', () => {
  for (const valid of ['generic-od', 'roughing-od', 'finishing-od', 'grooving-od', 'facing-od', 'boring-id'] as const) {
    assert.equal(toolIdSchema.parse(valid), valid);
    const setup = setupSchema.parse({ ...defaultSetup, toolId: valid });
    assert.equal(setup.toolId, valid);
  }

  assert.throws(() => toolIdSchema.parse('milling-endmill'));
  assert.throws(() => setupSchema.parse({ ...defaultSetup, toolId: 'other' }));
});

test('compile results require matching dialect versions and reserve the interior tool for v2', () => {
  const fixture = JSON.parse(readFileSync(new URL('../fixtures/lathe/first-program.result.json', import.meta.url), 'utf8'));
  assert.equal(resultSchema.safeParse(fixture).success, true);
  assert.equal(resultSchema.safeParse({ ...fixture, apiVersion: 2 }).success, false);
  assert.equal(resultSchema.safeParse({ ...fixture, dialect: 'edu-lathe-v2' }).success, false);
  fixture.initialState.toolId = 'boring-id';
  assert.equal(resultSchema.safeParse(fixture).success, false);
  assert.equal(resultSchema.safeParse({ ...fixture, apiVersion: 2, dialect: 'edu-lathe-v2' }).success, true);
});

test('explainBlock explains tool changes clearly when toolId updates in state block', () => {
  const stateBlock = {
    id: 1,
    span: { line: 2, columnStart: 1, columnEnd: 10 },
    source: 'T0101 M06',
    beforeState: {
      position: { rMm: 30, zMm: 5 },
      motion: null,
      feedMmMin: null,
      spindleRpm: 0,
      spindleOn: false,
      spindleDirection: 'cw' as const,
      ended: false,
      toolId: null,
    },
    afterState: {
      position: { rMm: 30, zMm: 5 },
      motion: null,
      feedMmMin: null,
      spindleRpm: 0,
      spindleOn: false,
      spindleDirection: 'cw' as const,
      ended: false,
      toolId: 'roughing-od' as const,
    },
    motionIds: [],
    kind: 'state' as const,
  };

  const exp = explainBlock(stateBlock);
  assert.match(exp.title, /T0101/);
  assert.match(exp.title, /Cambio de herramienta/);
  assert.match(exp.description, /Desbaste exterior/);
  assert.ok(exp.details.some(d => d.includes('Cambio de herramienta: Desbaste exterior (T0101)')));
});
