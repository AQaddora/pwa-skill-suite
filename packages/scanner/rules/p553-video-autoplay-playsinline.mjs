// P-553 · <video autoplay> missing muted/playsinline, or an un-awaited/uncaught .play().
import { extractTags, hasAttr } from '../lib/tags.mjs';
import { lineColAt, excerptAt } from '../lib/loc.mjs';

export const ids = ['P-553'];

const MARKUP_EXT = new Set(['.jsx', '.tsx', '.vue', '.svelte', '.html', '.htm']);
const CODE_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte']);
const PLAY_CALL = /\.play\s*\(\s*\)/g;

export function appliesTo({ ext }) {
  return MARKUP_EXT.has(ext) || CODE_EXT.has(ext);
}

export function check({ file, contents, ext }) {
  const out = [];

  if (MARKUP_EXT.has(ext)) {
    for (const tag of extractTags(contents, 'video')) {
      if (!hasAttr(tag.raw, 'autoplay')) continue;
      if (hasAttr(tag.raw, 'muted') && hasAttr(tag.raw, 'playsinline')) continue;
      out.push({
        id: 'P-553',
        file,
        line: tag.line,
        column: tag.column,
        excerpt: tag.raw.slice(0, 200),
        severity: 'P1',
        confidence: 'high',
      });
    }
  }

  if (CODE_EXT.has(ext)) {
    for (const m of contents.matchAll(PLAY_CALL)) {
      const lineStart = contents.lastIndexOf('\n', m.index - 1) + 1;
      const linePrefix = contents.slice(lineStart, m.index);
      const after = contents.slice(m.index + m[0].length, m.index + m[0].length + 40);
      // `.play()` is also a common method on animation/timeline/carousel libraries
      // (GSAP, Swiper, ...) with nothing to do with <video> autoplay policy — only
      // flag call sites whose receiver plausibly refers to a video/media element.
      if (!/video|media/i.test(linePrefix)) continue;
      if (/\bawait\s+[\w$.]*$/.test(linePrefix)) continue;
      if (/^\s*\.(then|catch)\s*\(/.test(after)) continue;
      const { line, column } = lineColAt(contents, m.index);
      out.push({
        id: 'P-553',
        file,
        line,
        column,
        excerpt: excerptAt(contents, m.index),
        severity: 'P1',
        confidence: 'high',
      });
    }
  }

  return out;
}
