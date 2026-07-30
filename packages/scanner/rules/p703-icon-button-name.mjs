// P-703 · Icon-only button with no accessible name.
// Advisory (icon-only detection is heuristic): a <button> whose only child is an icon
// (an <svg>, or a component named like TrashIcon / IconTrash) and which carries no
// aria-label / aria-labelledby / title and no visually-hidden text is unlabelled to a
// screen reader.
import { lineColAt } from '../lib/loc.mjs';

export const ids = ['P-703'];

const MARKUP_EXT = new Set(['.jsx', '.tsx', '.vue', '.svelte', '.html', '.htm']);
const BUTTON = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;

function hasAccessibleName(attrs, inner) {
  if (/\baria-label\b|\baria-labelledby\b|\btitle\s*=/i.test(attrs)) return true;
  if (/sr-only|visually-hidden|visuallyhidden/i.test(inner)) return true;
  // Any non-whitespace text content (outside tags) counts as an accessible name.
  const text = inner.replace(/<[^>]+>/g, '').replace(/\{[^}]*\}/g, '').trim();
  return text.length > 0;
}

function isIconOnly(inner) {
  const trimmed = inner.trim();
  if (/<svg[\s/>]/i.test(trimmed)) return true;
  const comp = /<([A-Za-z][A-Za-z0-9]*)/.exec(trimmed);
  if (comp && (/Icon$/.test(comp[1]) || /^Icon[A-Z]/.test(comp[1]))) return true;
  return false;
}

export function check({ file, contents, ext }) {
  if (!MARKUP_EXT.has(ext)) return [];
  const out = [];
  for (const m of contents.matchAll(BUTTON)) {
    const [, attrs, inner] = m;
    if (hasAccessibleName(attrs, inner)) continue;
    if (!isIconOnly(inner)) continue;
    const { line, column } = lineColAt(contents, m.index);
    out.push({
      id: 'P-703',
      file,
      line,
      column,
      excerpt: m[0].replace(/\s+/g, ' ').slice(0, 200),
      severity: 'P1',
      confidence: 'advisory',
    });
  }
  return out;
}
