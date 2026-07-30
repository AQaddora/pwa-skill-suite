// P-558 · `beforeunload`/`unload` used for save/flush with no `pagehide` fallback.
// Mobile Safari backgrounds-then-evicts without ever firing beforeunload/unload.
import { lineColAt, excerptAt } from '../lib/loc.mjs';

export const ids = ['P-558'];

const CODE_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte']);
const BEFOREUNLOAD = /addEventListener\(\s*['"](?:beforeunload|unload)['"]/;
const PAGEHIDE = /addEventListener\(\s*['"]pagehide['"]/;

export function check({ file, contents, ext }) {
  if (!CODE_EXT.has(ext)) return [];
  const m = BEFOREUNLOAD.exec(contents);
  if (!m) return [];
  if (PAGEHIDE.test(contents)) return [];
  const { line, column } = lineColAt(contents, m.index);
  return [
    {
      id: 'P-558',
      file,
      line,
      column,
      excerpt: excerptAt(contents, m.index),
      severity: 'P1',
      confidence: 'high',
    },
  ];
}
