// P-123 · type="number" on phone/OTP/PIN/code fields.
// type=number strips leading zeros, shows spinners, and gives the wrong keypad; these
// fields should use type="tel". Scoped to inputs whose name/id/placeholder/autocomplete
// hints at a phone/otp/pin/code field to keep it precise.
import { extractTags, getAttr } from '../lib/tags.mjs';

export const ids = ['P-123'];

const MARKUP_EXT = new Set(['.jsx', '.tsx', '.vue', '.svelte', '.html', '.htm']);
const HINT = /phone|otp|pin|code/i;

export function appliesTo({ ext }) {
  return MARKUP_EXT.has(ext);
}

export function check({ file, contents, ext }) {
  if (!MARKUP_EXT.has(ext)) return [];
  const out = [];
  for (const tag of extractTags(contents, 'input')) {
    if ((getAttr(tag.raw, 'type') || '').toLowerCase() !== 'number') continue;
    const hintText = [
      getAttr(tag.raw, 'name'),
      getAttr(tag.raw, 'id'),
      getAttr(tag.raw, 'placeholder'),
      getAttr(tag.raw, 'autocomplete'),
    ]
      .filter(Boolean)
      .join(' ');
    if (!HINT.test(hintText)) continue;
    out.push({
      id: 'P-123',
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
