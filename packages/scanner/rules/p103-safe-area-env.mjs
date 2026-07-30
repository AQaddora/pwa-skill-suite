// P-103 · Fixed edge-anchored element without safe-area-inset padding.
// Advisory: a fixed element pinned to a screen edge (bottom:0 / top:0) that sets edge
// padding but never references env(safe-area-inset-*) will collide with the iOS home
// indicator / notch. Scoped to CSS rules that combine position:fixed + an edge anchor.
import { extractDeclarations } from '../lib/css.mjs';

export const ids = ['P-103'];

const CSS_EXT = new Set(['.css', '.scss', '.sass', '.less']);

export function check({ file, contents, ext }) {
  if (!CSS_EXT.has(ext)) return [];

  // Group declarations by their selector block.
  const blocks = new Map();
  for (const d of extractDeclarations(contents)) {
    if (!blocks.has(d.selector)) blocks.set(d.selector, []);
    blocks.get(d.selector).push(d);
  }

  const out = [];
  for (const decls of blocks.values()) {
    const isFixed = decls.some((d) => d.property === 'position' && /fixed/.test(d.value));
    if (!isFixed) continue;
    const edgeAnchored = decls.some(
      (d) => (d.property === 'bottom' || d.property === 'top') && /^0(\D|$)/.test(d.value),
    );
    if (!edgeAnchored) continue;
    const setsEdgePadding = decls.some(
      (d) => d.property === 'padding' || d.property === 'padding-bottom' || d.property === 'padding-top',
    );
    if (!setsEdgePadding) continue;
    const usesSafeArea = decls.some((d) => /env\(\s*safe-area-inset-/.test(d.value));
    if (usesSafeArea) continue;

    const anchor = decls.find((d) => d.property === 'position');
    out.push({
      id: 'P-103',
      file,
      line: anchor.line,
      column: anchor.column,
      excerpt: `${anchor.selector} { position: ${anchor.value} … no safe-area-inset }`,
      severity: 'P0',
      confidence: 'advisory',
    });
  }
  return out;
}
