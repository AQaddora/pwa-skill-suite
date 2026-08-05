// P-302 · Hardcoded px width wide enough to overflow a phone viewport.
// Advisory: small px widths (icons, avatars) are legitimate, so this is scoped to
// layout-shaped values — `width` >= 200px (not max-width) and Tailwind `w-[NNNpx]`
// arbitrary values >= 200. A 375px card doesn't fit a 360px-wide phone.
import { extractDeclarations } from '../lib/css.mjs';
import { extractClassTokens } from '../lib/parseClasses.mjs';

export const ids = ['P-302'];

const CSS_EXT = new Set(['.css', '.scss', '.sass', '.less']);
const CLASS_EXT = new Set(['.jsx', '.tsx', '.vue', '.svelte', '.html', '.htm', '.js', '.ts']);
const THRESHOLD = 200;
const TW_WIDTH = /^w-\[(\d+)px\]$/;

export function appliesTo({ ext }) {
  return CSS_EXT.has(ext) || CLASS_EXT.has(ext);
}

// Class attributes are inspected in SFCs, embedded/preprocessed `<style>` blocks are not.
export function coverageComplete({ ext }) {
  return ext !== '.vue' && ext !== '.svelte';
}

function finding(file, line, column, excerpt) {
  return { id: 'P-302', file, line, column, excerpt, severity: 'P1', confidence: 'advisory' };
}

export function check({ file, contents, ext }) {
  const out = [];
  if (CSS_EXT.has(ext)) {
    for (const d of extractDeclarations(contents)) {
      if (d.property !== 'width') continue; // excludes max-width / min-width
      const m = /^(\d+)px$/.exec(d.value.trim());
      if (m && Number(m[1]) >= THRESHOLD) {
        out.push(finding(file, d.line, d.column, `width: ${d.value}`));
      }
    }
  }
  if (CLASS_EXT.has(ext)) {
    for (const t of extractClassTokens(contents)) {
      const bare = t.token.replace(/^.*:/, '');
      const m = TW_WIDTH.exec(bare);
      if (m && Number(m[1]) >= THRESHOLD) {
        out.push(finding(file, t.line, t.column, t.token));
      }
    }
  }
  return out;
}
