// P-705 · the focus indicator is removed and nothing replaces it.
//
// `outline: none` on a focusable element is the single most common way a codebase becomes
// unusable by keyboard: the caret still moves, but the user can no longer see where it is.
// Removing the outline is legitimate ONLY when a visible replacement exists — normally a
// `:focus-visible` ring, but a box-shadow, border or background change also counts.
//
// Advisory by catalog decision: correlating a removal with a replacement elsewhere in the
// stylesheet is a heuristic. The rule is deliberately biased toward silence — it fires only
// when the removal clearly targets something focusable AND no replacement is found anywhere
// in the same file. A missed detection is better than crying wolf about a focus ring.
import { extractDeclarations } from '../lib/css.mjs';

export const ids = ['P-705'];

const CSS_EXT = new Set(['.css', '.scss', '.sass', '.less']);

// Anything that can hold focus, plus the resets that hit everything.
const FOCUSABLE = /(?:^|[\s>+~,(])(?:\*|a|button|input|select|textarea|summary|details|label)(?:$|[\s>+~.#:[\],)])/i;
const FOCUSABLE_ATTR = /\[(?:tabindex|href|contenteditable)|role\s*=\s*["']?(?:button|link|tab|menuitem|option|checkbox|radio|switch|textbox)/i;
const INTERACTIVE_CLASS = /(?:^|[\s>+~.#])(?:btn|button|link|tab|chip|card-action|clickable|focusable|control|input|field|menu-item|nav-item)(?:$|[\s>+~.#:[\]_-])/i;
const FOCUS_PSEUDO = /:focus(?!-visible)/i;
const FOCUS_VISIBLE = /:focus-visible/i;

function removesOutline({ property, value }) {
  const prop = property.toLowerCase();
  const val = value.trim().toLowerCase();
  if (prop === 'outline') return /^(?:none|0(?:px|em|rem)?)\b/.test(val);
  if (prop === 'outline-style') return /^none\b/.test(val);
  if (prop === 'outline-width') return /^0(?:px|em|rem)?\b/.test(val);
  return false;
}

// A replacement must be *visible*. Setting box-shadow: none is not a replacement.
function isVisibleReplacement({ property, value }) {
  const prop = property.toLowerCase();
  const val = value.trim().toLowerCase();
  if (val === 'none' || val === '0' || val === 'transparent') return false;
  if (prop === 'outline' || prop === 'outline-style' || prop === 'outline-width' || prop === 'outline-color') {
    return !/^(?:none|0(?:px|em|rem)?)\b/.test(val);
  }
  return (
    prop === 'box-shadow' ||
    prop.startsWith('border') ||
    prop === 'background' ||
    prop === 'background-color' ||
    prop === 'text-decoration' ||
    prop === 'text-decoration-line'
  );
}

function targetsFocusable(selector) {
  return (
    FOCUS_PSEUDO.test(selector) ||
    FOCUS_VISIBLE.test(selector) ||
    FOCUSABLE.test(selector) ||
    FOCUSABLE_ATTR.test(selector) ||
    INTERACTIVE_CLASS.test(selector)
  );
}

export function appliesTo({ ext }) {
  return CSS_EXT.has(ext);
}

// Embedded Vue/Svelte styles are a relevant surface this rule does not parse. Their
// presence must downgrade a would-be PASS to UNVERIFIED rather than be ignored.
export function relevantTo({ ext }) {
  return CSS_EXT.has(ext) || ext === '.vue' || ext === '.svelte';
}

export function check({ file, contents, ext }) {
  if (!CSS_EXT.has(ext)) return [];
  const declarations = [...extractDeclarations(contents)];

  // A replacement anywhere in the file clears every removal in it. Scoping the search to
  // the exact selector would fire on the extremely common
  //   :focus { outline: none } / :focus-visible { outline: 2px solid }
  // pair, whose selectors never match each other.
  const hasReplacement = declarations.some(
    (d) => FOCUS_VISIBLE.test(d.selector) && isVisibleReplacement(d),
  );
  if (hasReplacement) return [];

  const out = [];
  const seen = new Set();
  for (const declaration of declarations) {
    if (!removesOutline(declaration) || !targetsFocusable(declaration.selector)) continue;

    // A replacement inside the very same rule is fine: `outline: none; box-shadow: 0 0 0 2px`.
    const sameRule = declarations.filter((d) => d.selector === declaration.selector);
    if (sameRule.some(isVisibleReplacement)) continue;

    const key = `${declaration.line}:${declaration.column}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      id: 'P-705',
      file,
      line: declaration.line,
      column: declaration.column,
      excerpt: `${declaration.selector} { ${declaration.property}: ${declaration.value} }`
        .replace(/\s+/g, ' ')
        .slice(0, 200),
      severity: 'P1',
      confidence: 'advisory',
    });
  }
  return out;
}
