// P-701 · viewport meta disables zoom (user-scalable=no / maximum-scale=1).
// A hard accessibility FAIL, never a suggestion — the report layer surfaces it as FAIL.
import { matches } from '../lib/loc.mjs';

export const ids = ['P-701'];

const HTML_EXT = new Set(['.html', '.htm', '.vue', '.svelte', '.jsx', '.tsx']);
// A viewport meta tag whose content locks scaling.
const VIEWPORT_META = /<meta[^>]*name=["']viewport["'][^>]*>/gi;
const LOCKS_ZOOM = /user-scalable\s*=\s*(?:no|0)|maximum-scale\s*=\s*1(?:\.0+)?\b/i;

export function check({ file, contents, ext }) {
  if (!HTML_EXT.has(ext)) return [];
  const out = [];
  for (const m of matches(contents, VIEWPORT_META)) {
    if (LOCKS_ZOOM.test(m.match[0])) {
      out.push({
        id: 'P-701',
        file,
        line: m.line,
        column: m.column,
        excerpt: m.match[0].slice(0, 200),
        severity: 'P0',
        confidence: 'high',
      });
    }
  }
  return out;
}
