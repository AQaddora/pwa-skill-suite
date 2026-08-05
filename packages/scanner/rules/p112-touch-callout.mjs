// P-112 · iOS touch-callout suppression must stay scoped to application chrome.
// Broad rules on roots, content containers, all anchors, or all images prevent users
// from previewing/copying/saving real content and trade one web-feel problem for another.
import { extractDeclarations } from '../lib/css.mjs';

export const ids = ['P-112'];

const CSS_EXT = new Set(['.css', '.scss', '.sass', '.less']);
const CONTENT_SCOPE = /(?:^|[\s>+~,(])(?:main|article|figure|\.content\b|\.prose\b|\.copy\b|\.message\b|\.post\b|\.description\b)/i;
const GLOBAL_LINK = /^(?:a(?::[-\w()]+|\[[^\]]+\])*|\[href\]|\[role\s*=\s*["']?link["']?\])$/i;
const GLOBAL_IMAGE = /^(?:img(?::[-\w()]+|\[[^\]]+\])*)$/i;
const CHROME_SCOPE = /(?:^|[\s>+~.#:[_-])(?:nav|navigation|navbar|tabbar|tab-bar|toolbar|app-header|header|app-footer|footer|menu|drawer|sidebar|chrome|controls?|actions?)(?:$|[\s>+~.#:[_\]-])/i;

export function appliesTo({ ext }) {
  return CSS_EXT.has(ext);
}

// Embedded Vue/Svelte styles are a relevant surface, but this rule intentionally
// parses only standalone stylesheet formats. Their presence must downgrade a
// would-be PASS to UNVERIFIED instead of being ignored.
export function relevantTo({ ext }) {
  return CSS_EXT.has(ext) || ext === '.vue' || ext === '.svelte';
}

function splitSelectorList(selector) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = 0; index < selector.length; index++) {
    const char = selector[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '(' || char === '[') depth++;
    else if (char === ')' || char === ']') depth--;
    else if (char === ',' && depth === 0) {
      parts.push(selector.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(selector.slice(start).trim());
  return parts.filter(Boolean);
}

function matchingParen(source, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index++) {
    if (source[index] === '(') depth++;
    else if (source[index] === ')' && --depth === 0) return index;
  }
  return -1;
}

// Expand :where() and :is() alternatives so a broad `a` cannot hide beside a safe
// `button` or `.app-header a` in the same functional selector.
function expandFunctionalSelectors(selector) {
  const functional = /:(?:where|is)\(/i.exec(selector);
  if (!functional) return [selector.trim()];
  const open = functional.index + functional[0].length - 1;
  const close = matchingParen(selector, open);
  if (close === -1) return [selector.trim()];
  const prefix = selector.slice(0, functional.index);
  const suffix = selector.slice(close + 1);
  const alternatives = splitSelectorList(selector.slice(open + 1, close));
  return alternatives.flatMap((alternative) =>
    expandFunctionalSelectors(`${prefix}${alternative}${suffix}`),
  );
}

function targetsAnchorOrImage(selector) {
  return /(?:^|[\s>+~])(?:a|img)(?:$|[\s>+~.#:[\]])/i.test(selector) ||
    /\[(?:href|role\s*=\s*["']?link)/i.test(selector);
}

function directlyTargetsRoot(selector) {
  if (selector === '*') return true;
  const compounds = selector.split(/\s+|>/).filter(Boolean);
  const target = compounds.at(-1) || '';
  return /^(?:html|body|:root)(?:$|[.#:[\]])/.test(target);
}

function isBroadSelector(selector) {
  const normalized = selector.trim().replace(/\s+/g, ' ');
  if (!normalized) return false;
  if (directlyTargetsRoot(normalized)) return true;
  if (GLOBAL_LINK.test(normalized) || GLOBAL_IMAGE.test(normalized)) return true;
  if (CHROME_SCOPE.test(normalized)) return false;

  if (/^(?:\*|html|body|:root)(?:$|[\s>+~.#:[\]])/i.test(normalized)) {
    return targetsAnchorOrImage(normalized) || CONTENT_SCOPE.test(normalized);
  }

  // Content containers inherit this WebKit property. Rules on the container itself,
  // or on its links/images, remove native content actions and are therefore too broad.
  if (CONTENT_SCOPE.test(normalized)) {
    if (/^(?:main|article|figure|\.content\b|\.prose\b|\.copy\b|\.message\b|\.post\b|\.description\b)/i.test(normalized)) {
      const chromeTarget = /(?:button|\[role\s*=\s*["']?button|\.btn\b|\.icon-button\b)\s*$/i.test(normalized);
      return !chromeTarget;
    }
    return targetsAnchorOrImage(normalized);
  }
  return false;
}

function selectorSuppressesContent(selector) {
  return splitSelectorList(selector)
    .flatMap(expandFunctionalSelectors)
    .some(isBroadSelector);
}

export function check({ file, contents, ext }) {
  if (!CSS_EXT.has(ext)) return [];
  const out = [];
  for (const declaration of extractDeclarations(contents)) {
    if (
      declaration.property !== '-webkit-touch-callout' ||
      !/^none\b/i.test(declaration.value) ||
      !selectorSuppressesContent(declaration.selector)
    ) {
      continue;
    }
    out.push({
      id: 'P-112',
      file,
      line: declaration.line,
      column: declaration.column,
      excerpt: `${declaration.selector} { -webkit-touch-callout: ${declaration.value} }`
        .replace(/\s+/g, ' ')
        .slice(0, 200),
      severity: 'P2',
      confidence: 'high',
    });
  }
  return out;
}
