// P-541 · OAuth popup (window.open / signInWithPopup) reachable after an `await` in the
// same async function body. Transient activation from the triggering user gesture is
// gone by the time an awaited promise resolves, so the popup call silently returns null
// on mobile — a structural break, not a heuristic guess, hence `confidence: high`.
import { lineColAt } from '../lib/loc.mjs';

export const ids = ['P-541'];

const ASYNC_FN_START =
  /\basync\s+function\b[^{]*\{|\basync\s*\([^)]*\)\s*=>\s*\{|\basync\s+[A-Za-z_$][\w$]*\s*\([^)]*\)\s*\{|\basync\s+[A-Za-z_$][\w$]*\s*=>\s*\{/g;
const POPUP_CALL = /\b(?:window\.open|signInWithPopup)\s*\(/;
const AWAIT = /\bawait\b/;

// Returns the index just past the '}' that matches the '{' at openIdx.
function matchBraceEnd(contents, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < contents.length; i++) {
    if (contents[i] === '{') depth++;
    else if (contents[i] === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return contents.length;
}

export function check({ file, contents, ext }) {
  if (!['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte'].includes(ext)) return [];
  const out = [];
  const seen = new Set();

  for (const m of contents.matchAll(ASYNC_FN_START)) {
    const openIdx = m.index + m[0].length - 1;
    const endIdx = matchBraceEnd(contents, openIdx);
    const body = contents.slice(openIdx, endIdx);

    const awaitMatch = AWAIT.exec(body);
    if (!awaitMatch) continue;

    const rest = body.slice(awaitMatch.index + awaitMatch[0].length);
    const popupMatch = POPUP_CALL.exec(rest);
    if (!popupMatch) continue;

    const absIdx = openIdx + awaitMatch.index + awaitMatch[0].length + popupMatch.index;
    if (seen.has(absIdx)) continue;
    seen.add(absIdx);
    const { line, column } = lineColAt(contents, absIdx);
    out.push({
      id: 'P-541',
      file,
      line,
      column,
      excerpt: popupMatch[0].trim(),
      severity: 'P0',
      confidence: 'high',
    });
  }
  return out;
}
