// P-552 · Wake lock requested with no `visibilitychange` re-acquire. The OS releases a
// wake lock whenever the page/app is hidden; without a listener that re-requests it on
// return to visible, the screen sleeps after the first app-switch.
import { lineColAt, excerptAt } from '../lib/loc.mjs';

export const ids = ['P-552'];

const CODE_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte']);
const WAKE_LOCK_REQUEST = /wakeLock\s*\.\s*request\s*\(/;
// Call-shaped, not a bare substring check — a comment merely mentioning
// "visibilitychange" (e.g. a TODO) must not count as the re-acquire listener existing.
const VISIBILITY_CHANGE = /addEventListener\(\s*['"]visibilitychange['"]/;

export function appliesTo({ ext }) {
  return CODE_EXT.has(ext);
}

export function check({ file, contents, ext }) {
  if (!CODE_EXT.has(ext)) return [];
  const m = WAKE_LOCK_REQUEST.exec(contents);
  if (!m) return [];
  if (VISIBILITY_CHANGE.test(contents)) return [];
  const { line, column } = lineColAt(contents, m.index);
  return [
    {
      id: 'P-552',
      file,
      line,
      column,
      excerpt: excerptAt(contents, m.index),
      severity: 'P2',
      confidence: 'high',
    },
  ];
}
