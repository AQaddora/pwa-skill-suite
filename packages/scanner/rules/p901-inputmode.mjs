// P-901 · Text input that would benefit from an inputmode, without one.
// Advisory: a type="text" (or type-less) input whose name/id/placeholder points at
// email/phone/numeric/etc. content but declares no inputmode gets the generic keyboard.
import { extractTags, getAttr, hasAttr } from '../lib/tags.mjs';

export const ids = ['P-901'];

const MARKUP_EXT = new Set(['.jsx', '.tsx', '.vue', '.svelte', '.html', '.htm']);
const HINT = /email|phone|tel|otp|code|search|url|numeric|amount/i;

export function check({ file, contents, ext }) {
  if (!MARKUP_EXT.has(ext)) return [];
  const out = [];
  for (const tag of extractTags(contents, 'input')) {
    const type = (getAttr(tag.raw, 'type') || 'text').toLowerCase();
    if (type !== 'text') continue;
    if (hasAttr(tag.raw, 'inputmode')) continue; // case-insensitive: matches inputMode too
    const hintText = [
      getAttr(tag.raw, 'name'),
      getAttr(tag.raw, 'id'),
      getAttr(tag.raw, 'placeholder'),
    ]
      .filter(Boolean)
      .join(' ');
    if (!HINT.test(hintText)) continue;
    out.push({
      id: 'P-901',
      file,
      line: tag.line,
      column: tag.column,
      excerpt: tag.raw.slice(0, 200),
      severity: 'P1',
      confidence: 'advisory',
    });
  }
  return out;
}
