#!/usr/bin/env node
// Writes the `probe` field of packages/catalog/catalog.json for every entry a deploy-harness
// check asserts — same convention packages/probes/wire-catalog.mjs uses. Idempotent.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const catalogPath = path.join(repoRoot, 'packages', 'catalog', 'catalog.json');

async function buildMapping() {
  const map = new Map();
  const checksDir = path.join(here, 'checks');
  for (const file of readdirSync(checksDir)) {
    if (!file.endsWith('.mjs') || file === 'index.mjs') continue;
    const mod = (await import(pathToFileURL(path.join(checksDir, file)).href)).default;
    const rel = path.relative(repoRoot, path.join(checksDir, file));
    for (const id of mod.ids) map.set(id, rel);
  }
  return map;
}

async function main() {
  const map = await buildMapping();
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  let changed = 0;
  for (const entry of catalog) {
    if (!map.has(entry.id)) continue;
    const probe = map.get(entry.id);
    if (entry.probe !== probe) {
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
