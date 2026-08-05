// P-801 · Physical (left/right) CSS instead of logical (start/end) properties.
// Highest mechanical yield in the suite. In RTL locales physical properties don't flip,
// so `margin-left` should be `margin-inline-start`, `ml-4` should be `ms-4`, etc.
// `left`/`right` are only flagged inside a positioned rule (they are legitimate elsewhere,
// e.g. background-position). text-align:left/right is always flagged.
import { extractDeclarations } from '../lib/css.mjs';
import { extractClassTokens } from '../lib/parseClasses.mjs';

export const ids = ['P-801'];

const CSS_EXT = new Set(['.css', '.scss', '.sass', '.less']);
const CLASS_EXT = new Set(['.jsx', '.tsx', '.vue', '.svelte', '.html', '.htm', '.js', '.ts']);

const PHYSICAL_PROPS = new Set([
  'margin-left',
  'margin-right',
  'padding-left',
  'padding-right',
  'border-left',
  'border-right',
]);

// Tailwind physical tokens (after stripping any responsive/state prefix).
const TW_PHYSICAL = /^(?:(?:ml|mr|pl|pr)-|border-[lr](?:-|$)|text-(?:left|right)$)/;

export function appliesTo({ ext }) {
  return CSS_EXT.has(ext) || CLASS_EXT.has(ext);
}

// Class attributes are inspected in SFCs, embedded/preprocessed `<style>` blocks are not.
export function coverageComplete({ ext }) {
  return ext !== '.vue' && ext !== '.svelte';
}

function finding(file, line, column, excerpt, confidence = 'high') {
  return { id: 'P-801', file, line, column, excerpt, severity: 'P0', confidence };
}

export function check({ file, contents, ext }) {
  const out = [];

  if (CSS_EXT.has(ext)) {
    // Group by selector so `left`/`right` can require a sibling `position`.
    const blocks = new Map();
    for (const d of extractDeclarations(contents)) {
      if (!blocks.has(d.selector)) blocks.set(d.selector, []);
      blocks.get(d.selector).push(d);
    }
    for (const decls of blocks.values()) {
      const positioned = decls.some((d) => d.property === 'position');
      for (const d of decls) {
        if (PHYSICAL_PROPS.has(d.property)) {
          out.push(finding(file, d.line, d.column, `${d.property}: ${d.value}`));
        } else if ((d.property === 'left' || d.property === 'right') && positioned) {
          out.push(finding(file, d.line, d.column, `${d.property}: ${d.value}`));
        } else if (d.property === 'text-align' && /^(left|right)\b/.test(d.value)) {
          out.push(finding(file, d.line, d.column, `${d.property}: ${d.value}`));
        }
      }
    }
  }

  if (CLASS_EXT.has(ext)) {
    for (const t of extractClassTokens(contents)) {
      const bare = t.token.replace(/^.*:/, ''); // strip md:/hover:/rtl: prefixes
      if (TW_PHYSICAL.test(bare)) {
        out.push(finding(file, t.line, t.column, t.token));
      }
    }
  }

  return out;
}
