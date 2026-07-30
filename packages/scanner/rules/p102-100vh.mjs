// P-102 · 100vh / h-screen used for full-height layout.
// Advisory: h-screen is legitimate inside a fixed shell, so if the file uses a fixed
// position (CSS `position: fixed` or a Tailwind `fixed` token) we stay silent entirely
// rather than emit a noisy false positive.
import { extractDeclarations } from '../lib/css.mjs';
import { extractClassTokens } from '../lib/parseClasses.mjs';
import { lineColAt, excerptAt } from '../lib/loc.mjs';

export const ids = ['P-102'];

const CSS_EXT = new Set(['.css', '.scss', '.sass', '.less']);
const CLASS_EXT = new Set(['.jsx', '.tsx', '.vue', '.svelte', '.html', '.js', '.ts']);
const VH_TOKEN = /(^|:)(min-)?h-screen$/; // optional responsive/state prefix like md:h-screen
const VH_ARBITRARY = /(^|:)h-\[100vh\]$/;

function finding(file, line, column, excerpt) {
  return { id: 'P-102', file, line, column, excerpt, severity: 'P1', confidence: 'advisory' };
}

export function check({ file, contents, ext }) {
  const tokens = CLASS_EXT.has(ext) ? extractClassTokens(contents) : [];
  const hasFixed =
    /position\s*:\s*fixed/i.test(contents) || tokens.some((t) => t.token === 'fixed');
  if (hasFixed) return [];

  const out = [];
  if (CSS_EXT.has(ext)) {
    for (const d of extractDeclarations(contents)) {
      if (d.value.includes('100vh')) {
        out.push(finding(file, d.line, d.column, `${d.property}: ${d.value}`));
      }
    }
  }
  for (const t of tokens) {
    if (VH_TOKEN.test(t.token) || VH_ARBITRARY.test(t.token)) {
      out.push(finding(file, t.line, t.column, t.token));
    }
  }
  // Catch raw 100vh in inline styles / non-CSS files not covered above.
  if (!CSS_EXT.has(ext)) {
    for (const m of contents.matchAll(/\b100vh\b/g)) {
      const { line, column } = lineColAt(contents, m.index);
      out.push(finding(file, line, column, excerptAt(contents, m.index)));
    }
  }
  return out;
}
