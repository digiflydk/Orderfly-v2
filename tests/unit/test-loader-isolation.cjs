const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadTs } = require('../helpers/load-ts.cjs');

test('repeated fixture loads preserve independent mocks and opaque module identities', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'orderfly-loader-'));
  const filename = path.join(folder, 'fixture.ts');
  try {
    fs.writeFileSync(filename, "import { value } from 'fixture-dependency'; export const observed = value; const handle = {}; export function mint() { return handle; } export function owns(input: unknown) { return input === handle; }");
    const first = loadTs(filename, { 'fixture-dependency': { value: 'first' } });
    const second = loadTs(filename, { 'fixture-dependency': { value: 'second' } });
    assert.equal(first.observed, 'first');
    assert.equal(second.observed, 'second');
    assert.equal(first.owns(first.mint()), true);
    assert.equal(second.owns(first.mint()), false);
    assert.notEqual(first.mint(), second.mint());
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

test('editing a fixture source between loads cannot execute stale compiled code', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'orderfly-loader-'));
  const filename = path.join(folder, 'fixture.ts');
  try {
    fs.writeFileSync(filename, 'export const schemaVersion: number = 1;');
    assert.equal(loadTs(filename).schemaVersion, 1);
    fs.writeFileSync(filename, 'export const schemaVersion: number = 2;');
    assert.equal(loadTs(filename).schemaVersion, 2);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});
