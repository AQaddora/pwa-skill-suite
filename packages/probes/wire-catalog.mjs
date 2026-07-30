#!/usr/bin/env node
// Writes the `probe` field of packages/catalog/catalog.json for every entry a probe asserts,
// same convention Phase 1 used for `rule`. Idempotent: re-run whenever probes are added.
//
//   - each probes/<id>.mjs module → its own file path, for the ids it declares
//   - the non-P-101 device-only entries → lib/device-only.mjs (they are reported
//     UNVERIFIED with reproduction steps, which is the honest "coverage" they have)
//
// Only the `probe` field is touched; all other fields are preserved byte-for-byte in shape.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DEVICE_ONLY_IDS } from './lib/device-only.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const catalogPath = path.join(repoRoot, 'packages', 'catalog', 'catalog.json');

async function buildMapping() {
  const map = new Map();
  const probesDir = path.join(here, 'probes');
  for (const file of readdirSync(probesDir)) {
    if (!file.endsWith('.mjs') || file === 'index.mjs') continue;
    const mod = (await import(pathToFileURL(path.join(probesDir, file)).href)).default;
    const rel = path.relative(repoRoot, path.join(probesDir, file));
    for (const id of mod.ids) map.set(id, rel);
  }
  const deviceOnlyRel = path.relative(repoRoot, path.join(here, 'lib', 'device-only.mjs'));
  for (const id of DEVICE_ONLY_IDS) if (!map.has(id)) map.set(id, deviceOnlyRel);
  return map;
}

async function main() {
  const map = await buildMapping();
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  let changed = 0;
  for (const entry of catalog) {
    const probe = map.get(entry.id) ?? null;
    if (entry.probe !== probe && map.has(entry.id)) {
      entry.probe = probe;
      changed++;
    }
  }
  writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
  console.log(`wired ${map.size} probe id(s); updated ${changed} entr(y/ies).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
