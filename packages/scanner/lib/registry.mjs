// Loads all rules/*.mjs modules and validates each declares `ids` (array) + `check` (fn).
// Attaches a filename-derived `slug` used to locate fixtures.
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const RULES_DIR = join(HERE, '..', 'rules');

let cache = null;

export async function loadRules() {
  if (cache) return cache;
  let files;
  try {
    files = readdirSync(RULES_DIR).filter((f) => f.endsWith('.mjs'));
  } catch {
    files = [];
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
    rules.push({ slug: basename(file, '.mjs'), ids: mod.ids, check: mod.check });
  }
  return (cache = rules);
}
