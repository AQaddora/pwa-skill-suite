// P-113 · Body scroll lock not media-gated (highest-yield rule in the suite).
// Flags source that sets body/document overflow:hidden or calls a scrollLock helper.
// Heuristic, stated honestly: if the file references matchMedia anywhere we assume the
// lock is legitimately gated and stay silent, to avoid false positives.
import { matches } from '../lib/loc.mjs';

export const ids = ['P-113'];

const SOURCE_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte']);

const PATTERNS = [
  /document\.body\.style\.overflow\s*=\s*['"`]hidden['"`]/g,
  /document\.documentElement\.style\.overflow\s*=\s*['"`]hidden['"`]/g,
  /\bscrollLock\s*\(/g,
];

export function appliesTo({ ext }) {
  return SOURCE_EXT.has(ext);
}

export function check({ file, contents, ext }) {
  if (!SOURCE_EXT.has(ext)) return [];
  // If the file gates behaviour on a media query at all, assume the lock is conditional.
  if (/matchMedia/.test(contents)) return [];

  const out = [];
  for (const pattern of PATTERNS) {
    for (const m of matches(contents, pattern)) {
      out.push({
        id: 'P-113',
        file,
        line: m.line,
        column: m.column,
        excerpt: m.excerpt,
        severity: 'P0',
        confidence: 'high',
      });
    }
  }
  return out;
}
