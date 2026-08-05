// P-110 · Interactive elements without touch-action (suppresses double-tap zoom on iOS).
// Advisory, presence-only heuristic: flag a component/markup file that contains a
// <button>/role="button" but no touch-action anywhere in the file. Fires once per file
// to avoid noise. The 300ms tap delay is long gone; the remaining value is double-tap
// zoom suppression, so this is advisory not a hard failure.
import { lineColAt, excerptAt } from '../lib/loc.mjs';

export const ids = ['P-110'];

const MARKUP_EXT = new Set(['.jsx', '.tsx', '.vue', '.svelte', '.html', '.htm']);
const INTERACTIVE = /<button[\s>]|role=["']button["']/i;
const HAS_TOUCH_ACTION = /touch-?action/i; // matches touch-action (CSS) and touchAction (JSX)

export function appliesTo({ ext }) {
  return MARKUP_EXT.has(ext);
}

export function check({ file, contents, ext }) {
  if (!MARKUP_EXT.has(ext)) return [];
  const m = INTERACTIVE.exec(contents);
  if (!m) return [];
  if (HAS_TOUCH_ACTION.test(contents)) return [];
  const { line, column } = lineColAt(contents, m.index);
  return [
    {
      id: 'P-110',
      file,
      line,
      column,
      excerpt: excerptAt(contents, m.index),
      severity: 'P1',
      confidence: 'advisory',
    },
  ];
}
