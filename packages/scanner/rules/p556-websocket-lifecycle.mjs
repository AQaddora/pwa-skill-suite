// P-556 · WebSocket dies on background with no reconnect, or a hardcoded `ws://`
// literal that mixed-content-blocks in production. Advisory: the `ws://` literal is a
// precise match, but "no reconnect path" is a same-file presence/absence heuristic (a
// shared reconnect wrapper can legitimately live elsewhere), so the combined rule ships
// advisory.
import { lineColAt, excerptAt } from '../lib/loc.mjs';

export const ids = ['P-556'];

const CODE_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte']);
const WS_LITERAL = /['"`]ws:\/\/(?!localhost|127\.0\.0\.1)[^'"`]*['"`]/g;
const NEW_WEBSOCKET = /new\s+WebSocket\s*\(/;
const ONCLOSE = /\bonclose\b|addEventListener\(\s*['"]close['"]/;

export function check({ file, contents, ext }) {
  if (!CODE_EXT.has(ext)) return [];
  const out = [];

  for (const m of contents.matchAll(WS_LITERAL)) {
    const { line, column } = lineColAt(contents, m.index);
    out.push({
      id: 'P-556',
      file,
      line,
      column,
      excerpt: excerptAt(contents, m.index),
      severity: 'P0',
      confidence: 'advisory',
    });
  }

  const wsMatch = NEW_WEBSOCKET.exec(contents);
  if (wsMatch && !ONCLOSE.test(contents)) {
    const { line, column } = lineColAt(contents, wsMatch.index);
    out.push({
      id: 'P-556',
      file,
      line,
      column,
      excerpt: excerptAt(contents, wsMatch.index),
      severity: 'P0',
      confidence: 'advisory',
    });
  }

  return out;
}
