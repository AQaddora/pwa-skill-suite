// P-107 · 100vw / w-screen causing horizontal overflow (100vw includes the scrollbar).
import { extractDeclarations } from '../lib/css.mjs';
import { extractClassTokens } from '../lib/parseClasses.mjs';
import { lineColAt, excerptAt } from '../lib/loc.mjs';

export const ids = ['P-107'];

const CSS_EXT = new Set(['.css', '.scss', '.sass', '.less']);
const CLASS_EXT = new Set(['.jsx', '.tsx', '.vue', '.svelte', '.html', '.htm', '.js', '.ts']);
const VW_TOKEN = /(^|:)w-screen$/;
const VW_ARBITRARY = /(^|:)w-\[100vw\]$/;

export function appliesTo({ ext }) {
  return CSS_EXT.has(ext) || CLASS_EXT.has(ext);
}

function finding(file, line, column, excerpt) {
  return { id: 'P-107', file, line, column, excerpt, severity: 'P1', confidence: 'high' };
}

export function check({ file, contents, ext }) {
  const out = [];
  if (CSS_EXT.has(ext)) {
    for (const d of extractDeclarations(contents)) {
      if (!d.value.includes('100vw')) continue;
      // `max-width: calc(100vw - 32px)` and similar calc clamps are safe, not overflow:
      // the subtraction/clamp avoids the scrollbar-gutter overflow this rule targets.
      if (d.property === 'max-width' || d.value.includes('calc(')) continue;
      out.push(finding(file, d.line, d.column, `${d.property}: ${d.value}`));
    }
  }
  if (CLASS_EXT.has(ext)) {
    for (const t of extractClassTokens(contents)) {
      if (VW_TOKEN.test(t.token) || VW_ARBITRARY.test(t.token)) {
        out.push(finding(file, t.line, t.column, t.token));
      }
    }
    for (const m of contents.matchAll(/\b100vw\b/g)) {
      const { line, column } = lineColAt(contents, m.index);
      out.push(finding(file, line, column, excerptAt(contents, m.index)));
    }
  }
  return out;
}
