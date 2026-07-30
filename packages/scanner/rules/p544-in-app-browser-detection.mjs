// P-544 · No in-app-browser (Instagram/Facebook/TikTok/LINE) UA branch near an
// install-prompt or OAuth sign-in entry point. Advisory, presence-only heuristic:
// fires once per file, matching the existing p110-style per-file scoping.
import { lineColAt, excerptAt } from '../lib/loc.mjs';

export const ids = ['P-544'];

const CODE_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte']);
const TRIGGER = /beforeinstallprompt|signInWithPopup|signInWithRedirect|signInWithGoogle|\boauth\b/i;
const IN_APP_UA = /FBAN|FBAV|Instagram|\bLine\b|TikTok/;

export function check({ file, contents, ext }) {
  if (!CODE_EXT.has(ext)) return [];
  const m = TRIGGER.exec(contents);
  if (!m) return [];
  if (IN_APP_UA.test(contents)) return [];
  const { line, column } = lineColAt(contents, m.index);
  return [
    {
      id: 'P-544',
      file,
      line,
      column,
      excerpt: excerptAt(contents, m.index),
      severity: 'P0',
      confidence: 'advisory',
    },
  ];
}
