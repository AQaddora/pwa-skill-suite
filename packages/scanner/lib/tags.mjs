// Minimal HTML/JSX tag helpers for form rules. Not a real parser — good enough to pull
// `<input ...>` tags and read individual attributes across HTML/JSX/Vue/Svelte syntaxes.
import { lineColAt } from './loc.mjs';

// Yields { raw, index, line, column } for each opening tag of the given name.
export function* extractTags(contents, tagName) {
  const re = new RegExp(`<${tagName}\\b[^>]*/?>`, 'gi');
  for (const m of contents.matchAll(re)) {
    const { line, column } = lineColAt(contents, m.index);
    yield { raw: m[0], index: m.index, line, column };
  }
}

// Reads an attribute value from a single tag string. Handles attr="x", attr='x',
// attr={"x"}, attr={'x'}, attr={`x`}. Returns null if the attribute is absent, or ''
// for a valueless boolean attribute. For dynamic `attr={expr}` where expr is not a
// string literal, returns the raw inner expression text.
// Attributes are separated by whitespace (or follow the tag name / a self-close slash),
// so anchor on that rather than a bare \b — otherwise `data-type` matches `type` and
// `data-name` matches `name`, misreading a neighbouring attribute's value.
const START = "(?:^|[\\s<'\"/])";

export function getAttr(tag, attrName) {
  const re = new RegExp(
    `${START}${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{\\s*["'\`]([^"'\`]*)["'\`]\\s*\\}|\\{([^}]*)\\})`,
    'i',
  );
  const m = re.exec(tag);
  if (!m) {
    // Valueless boolean attribute, e.g. <input disabled>
    const bare = new RegExp(`${START}${attrName}(?=[\\s>/]|$)(?!\\s*=)`, 'i');
    return bare.test(tag) ? '' : null;
  }
  return m[1] ?? m[2] ?? m[3] ?? m[4] ?? '';
}

export function hasAttr(tag, attrName) {
  return getAttr(tag, attrName) !== null;
}
