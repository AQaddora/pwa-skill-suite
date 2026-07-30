// P-902 · Credential/contact input without autocomplete.
// Advisory: email/password/tel inputs and OTP/code fields without an autocomplete
// attribute lose browser autofill and (for OTP) iOS one-time-code suggestions.
import { extractTags, getAttr, hasAttr } from '../lib/tags.mjs';

export const ids = ['P-902'];

const MARKUP_EXT = new Set(['.jsx', '.tsx', '.vue', '.svelte', '.html', '.htm']);
const AUTOCOMPLETE_TYPES = new Set(['email', 'password', 'tel']);
const OTP_HINT = /otp|code/i;

export function check({ file, contents, ext }) {
  if (!MARKUP_EXT.has(ext)) return [];
  const out = [];
  for (const tag of extractTags(contents, 'input')) {
    const type = (getAttr(tag.raw, 'type') || '').toLowerCase();
    const nameId = [getAttr(tag.raw, 'name'), getAttr(tag.raw, 'id')].filter(Boolean).join(' ');
    const relevant = AUTOCOMPLETE_TYPES.has(type) || OTP_HINT.test(nameId);
    if (!relevant) continue;
    if (hasAttr(tag.raw, 'autocomplete')) continue; // matches autoComplete too
    out.push({
      id: 'P-902',
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
