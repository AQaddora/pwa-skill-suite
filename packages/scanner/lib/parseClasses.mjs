// Extract class-string tokens from JSX/TSX/Vue/Svelte/HTML.
// Best-effort, not a full parser: pulls tokens out of class="..."/className="..."/:class="..."
// attributes and out of quoted string arguments to cn()/clsx()/classNames()/cva() calls.
// Returns [{ token, line, column }].

const CLASS_ATTR = /(?:class|className|:class)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{"([^"]*)"\}|\{'([^']*)'\})/g;
const HELPER_CALL = /\b(?:cn|clsx|classNames|cva|twMerge|classList)\s*\(([^)]*)\)/g;
const QUOTED = /"([^"]*)"|'([^']*)'|`([^`]*)`/g;

function lineColOf(contents, index) {
  const before = contents.slice(0, index);
  const line = before.split('\n').length;
  const lastNl = before.lastIndexOf('\n');
  const column = index - lastNl; // 1-based within the line
  return { line, column };
}

function pushTokens(str, baseIndex, contents, out, seen) {
  for (const token of str.split(/\s+/)) {
    if (!token) continue;
    const key = `${baseIndex}:${token}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { line, column } = lineColOf(contents, baseIndex);
    out.push({ token, line, column });
  }
}

export function extractClassTokens(contents) {
  const out = [];
  const seen = new Set();

  for (const m of contents.matchAll(CLASS_ATTR)) {
    const value = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? '';
    pushTokens(value, m.index, contents, out, seen);
  }

  for (const call of contents.matchAll(HELPER_CALL)) {
    const args = call[1];
    const argOffset = call.index + call[0].indexOf(args);
    for (const q of args.matchAll(QUOTED)) {
      const value = q[1] ?? q[2] ?? q[3] ?? '';
      pushTokens(value, argOffset + q.index, contents, out, seen);
    }
  }

  return out;
}

export { lineColOf };
