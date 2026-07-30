import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runScan } from '../cli.mjs';

function tmpProject(files) {
  const dir = mkdtempSync(join(tmpdir(), 'scan-'));
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(join(dir, name), contents);
  }
  return dir;
}

test('runScan on a directory with nothing to flag returns zero findings', async () => {
  const dir = tmpProject({ 'readme.txt': 'hello world' });
  try {
    const { findings } = await runScan(dir);
    assert.equal(findings.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runScan skips node_modules', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'scan-'));
  const { mkdirSync } = await import('node:fs');
  mkdirSync(join(dir, 'node_modules'));
  writeFileSync(join(dir, 'node_modules', 'lib.css'), 'a { width: 500px; }');
  try {
    const { findings } = await runScan(dir);
    assert.equal(findings.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runScan with detectSurfaces returns a surfaces map', async () => {
  const dir = tmpProject({ 'form.html': '<form><input type="text"></form>' });
  try {
    const { surfaces } = await runScan(dir, { detectSurfaces: true });
    assert.equal(surfaces.forms, true);
    assert.equal(surfaces['service-worker'], false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
