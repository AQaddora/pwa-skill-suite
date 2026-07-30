// Shared helpers for turning a string index into a 1-based {line, column} and for
// scanning contents with a regex, yielding a location + excerpt per match.

export function lineColAt(contents, index) {
  const before = contents.slice(0, index);
  const line = before.split('\n').length;
  const column = index - before.lastIndexOf('\n');
  return { line, column };
}

export function excerptAt(contents, index) {
  const start = contents.lastIndexOf('\n', index) + 1;
  let end = contents.indexOf('\n', index);
  if (end === -1) end = contents.length;
  return contents.slice(start, end).trim().slice(0, 200);
}

// Yields { index, line, column, excerpt, match } for every regex match.
export function* matches(contents, regex) {
  for (const m of contents.matchAll(regex)) {
    const { line, column } = lineColAt(contents, m.index);
    yield { index: m.index, line, column, excerpt: excerptAt(contents, m.index), match: m };
  }
}
