import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeProgramFile, encodeProgramFile } from '../src/lib/lathe/programFile.ts';
import { MAX_PROGRAM_BYTES } from '../src/lib/lathe/project.ts';

const binary = (text: string) => new TextEncoder().encode(text).buffer;
test('program import strips UTF-8 BOM and normalizes every line ending without interpreting words', () => {
  assert.equal(decodeProgramFile(binary('\uFEFF; 🛠 práctica\rG71 X20\r\nM30\n')), '; 🛠 práctica\nG71 X20\nM30\n');
  assert.equal(decodeProgramFile(binary('')), '');
  assert.equal(encodeProgramFile('; á\r\nG71\r'), '; á\nG71\n');
});
test('invalid UTF-8 and binary null bytes are rejected without replacement characters', () => {
  for (const bytes of [[0xc3], [0xff], [0xc0, 0xaf]]) assert.throws(() => decodeProgramFile(new Uint8Array(bytes).buffer), /UTF-8/);
  assert.throws(() => decodeProgramFile(binary('G00\0X20')), /nulos/);
  assert.throws(() => encodeProgramFile('G00\0X20'), /nulos/);
});
test('program limits measure UTF-8 bytes on import and normalized download', () => {
  const exact = 'é'.repeat(MAX_PROGRAM_BYTES / 2);
  assert.equal(decodeProgramFile(binary(exact)), exact);
  assert.equal(encodeProgramFile(exact), exact);
  assert.throws(() => decodeProgramFile(binary(exact + 'a')), /256 KiB/);
  assert.throws(() => encodeProgramFile(exact + 'a'), /256 KiB/);
});
