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

// Walks forward through a chained-call sequence (`.then(...).catch(...)`, any number of
// hops) looking for a `.catch(` link. Parenthesis-depth matched per hop so an arrow
// function's own `(...)` inside `.then((reg) => {...})` doesn't break the walk early —
// a plain "60 chars after the call" check misses `.catch()` chained after a `.then()`.
function chainHasCatch(contents, afterIndex, maxHops = 8) {
  let idx = afterIndex;
  for (let hop = 0; hop < maxHops; hop++) {
    let i = idx;
    while (i < contents.length && /\s/.test(contents[i])) i++;
    if (contents[i] !== '.') return false;
    i++;
    const nameMatch = /^[A-Za-z_$][\w$]*/.exec(contents.slice(i));
    if (!nameMatch) return false;
    const name = nameMatch[0];
    i += name.length;
    while (i < contents.length && /\s/.test(contents[i])) i++;
    if (contents[i] !== '(') return false;
    let depth = 0;
    let j = i;
    for (; j < contents.length; j++) {
      if (contents[j] === '(') depth++;
      else if (contents[j] === ')') {
        depth--;
        if (depth === 0) {
          j++;
          break;
        }
      }
    }
    if (name === 'catch') return true;
    idx = j;
  }
  return false;
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
    if (chainHasCatch(contents, afterIndex)) continue;
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
