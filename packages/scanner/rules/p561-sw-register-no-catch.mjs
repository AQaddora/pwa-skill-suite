// P-561 · `serviceWorker.register()` with no `.catch()` and no enclosing awaited
// `try`/`catch`. A rewrite that serves HTML for `/sw.js` after a route change makes
// registration reject on MIME mismatch — silently, in production only, if nothing
// catches it.
import { lineColAt, excerptAt } from '../lib/loc.mjs';

export const ids = ['P-561'];

// Includes .html/.htm: `register()` is frequently inlined in a <script> tag in
// index.html rather than a separate JS file (confirmed against a real PWA starter app).
const CODE_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte', '.html', '.htm']);
const REGISTER_CALL = /serviceWorker\s*\.\s*register\s*\([^)]*\)/g;

function hasChainedCatch(contents, afterIndex) {
  return /^\s*\.catch\s*\(/.test(contents.slice(afterIndex, afterIndex + 60));
}

function isAwaited(contents, matchIndex) {
  const lineStart = contents.lastIndexOf('\n', matchIndex - 1) + 1;
  const linePrefix = contents.slice(lineStart, matchIndex);
  return /\bawait\s+[\w$.]*$/.test(linePrefix);
}

function isInsideTryCatch(contents, matchIndex) {
  const before = contents.slice(0, matchIndex);
  const lastTry = before.lastIndexOf('try');
  if (lastTry === -1) return false;
  const afterTry = contents.slice(lastTry, matchIndex);
  const opens = (afterTry.match(/\{/g) || []).length;
  const closes = (afterTry.match(/\}/g) || []).length;
  return opens > closes;
}

export function check({ file, contents, ext }) {
  if (!CODE_EXT.has(ext)) return [];
  const out = [];
  for (const m of contents.matchAll(REGISTER_CALL)) {
    const afterIndex = m.index + m[0].length;
    if (hasChainedCatch(contents, afterIndex)) continue;
    if (isAwaited(contents, m.index) && isInsideTryCatch(contents, m.index)) continue;
    const { line, column } = lineColAt(contents, m.index);
    out.push({
      id: 'P-561',
      file,
      line,
      column,
      excerpt: excerptAt(contents, m.index),
      severity: 'P0',
      confidence: 'high',
    });
  }
  return out;
}
