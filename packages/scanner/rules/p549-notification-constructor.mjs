// P-549 · `new Notification()` used directly. Throws on Chrome Android; must go through
// `registration.showNotification()` instead. Deterministic — the two APIs have
// different names, so there is no ambiguity to average out.
import { lineColAt, excerptAt } from '../lib/loc.mjs';

export const ids = ['P-549'];

const CODE_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte']);
const NEW_NOTIFICATION = /\bnew\s+Notification\s*\(/g;

export function check({ file, contents, ext }) {
  if (!CODE_EXT.has(ext)) return [];
  const out = [];
  for (const m of contents.matchAll(NEW_NOTIFICATION)) {
    const { line, column } = lineColAt(contents, m.index);
    out.push({
      id: 'P-549',
      file,
      line,
      column,
      excerpt: excerptAt(contents, m.index),
      severity: 'P1',
      confidence: 'high',
    });
  }
  return out;
}
