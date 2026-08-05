// Loads all rules/*.mjs modules and validates each declares `ids` (array),
// `appliesTo` (fn), and `check` (fn). Rules that can inspect only part of an
// otherwise applicable container format may also export `coverageComplete`.
// Attaches a filename-derived `slug` used to locate fixtures.
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const RULES_DIR = join(HERE, '..', 'rules');

let cache = null;

export async function loadRules() {
  if (cache) return cache;
  const files = readdirSync(RULES_DIR).filter((f) => f.endsWith('.mjs'));
  if (files.length === 0) {
    throw new Error(`no scanner rule modules found in ${RULES_DIR}`);
  }
  files.sort();
  const rules = [];
  for (const file of files) {
    const mod = await import(join(RULES_DIR, file));
    if (!Array.isArray(mod.ids) || mod.ids.length === 0) {
      throw new Error(`rule ${file} must export a non-empty \`ids\` array`);
    }
    if (typeof mod.check !== 'function') {
      throw new Error(`rule ${file} must export a \`check\` function`);
    }
    if (typeof mod.appliesTo !== 'function') {
      throw new Error(`rule ${file} must export an \`appliesTo\` function`);
    }
    if (mod.relevantTo != null && typeof mod.relevantTo !== 'function') {
      throw new Error(`rule ${file} \`relevantTo\` must be a function when exported`);
    }
    if (mod.coverageComplete != null && typeof mod.coverageComplete !== 'function') {
      throw new Error(`rule ${file} \`coverageComplete\` must be a function when exported`);
    }
    rules.push({
      slug: basename(file, '.mjs'),
      ids: mod.ids,
      appliesTo: mod.appliesTo,
      relevantTo: mod.relevantTo,
      coverageComplete: mod.coverageComplete,
      check: mod.check,
    });
  }
  return (cache = rules);
}
