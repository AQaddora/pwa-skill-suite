import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRules } from '../lib/registry.mjs';
import { runScan } from '../cli.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixtureDir = (kind, slug) => join(HERE, '..', 'fixtures', kind, slug);

const rules = await loadRules();

for (const rule of rules) {
  const { slug } = rule;

  test(`${slug}: declares explicit applicability`, () => {
    assert.equal(typeof rule.appliesTo, 'function');
  });

  test(`${slug}: fires on bad fixture`, async () => {
    const dir = fixtureDir('bad', slug);
    assert.ok(existsSync(dir), `missing bad fixture for ${slug}`);
    const { findings, coverageById } = await runScan(dir);
    for (const id of rule.ids) {
      assert.ok(coverageById[id] > 0, `expected ${id} to cover at least one bad fixture file`);
      assert.ok(
        findings.some((f) => f.id === id),
        `expected ${id} to fire on bad/${slug}, got: ${findings.map((f) => f.id).join(',') || 'none'}`,
      );
    }
  });

  test(`${slug}: silent on good fixture`, async () => {
    const dir = fixtureDir('good', slug);
    assert.ok(existsSync(dir), `missing good fixture for ${slug}`);
    const { findings, coverageById } = await runScan(dir);
    for (const id of rule.ids) {
      assert.ok(coverageById[id] > 0, `expected ${id} to cover at least one good fixture file`);
      assert.ok(
        !findings.some((f) => f.id === id),
        `expected ${id} to stay silent on good/${slug}, got: ${findings
          .filter((f) => f.id === id)
          .map((f) => `${f.file}:${f.line}`)
          .join(',')}`,
      );
    }
  });
}
