// Lightweight CSS/SCSS declaration scanner. Not a full CSS AST — a line/brace scanner
// good enough for property/value matching. Tracks the current selector via brace depth,
// splits declarations on `;`, splits `property: value` on the first `:`.
// Returns [{ property, value, line, column, selector }].

export function extractDeclarations(contents) {
  // Blank out block comments (a comment may contain `:`/`;`/`{` that would otherwise
  // corrupt the selector/property/value split). Replace non-newline chars with spaces so
  // every remaining character keeps its original index for line/column reporting.
  contents = contents.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

  const out = [];
  const selectorStack = [];
  let buf = '';
  let bufStart = 0; // index in contents where buf began
  let line = 1;
  let col = 0;

  const flushDeclaration = (endIndex) => {
    const text = buf.trim();
    buf = '';
    if (!text || text.startsWith('//') || text.startsWith('@') || text.startsWith('*')) return;
    const colon = text.indexOf(':');
    if (colon === -1) return;
    const property = text.slice(0, colon).trim().toLowerCase();
    const value = text.slice(colon + 1).trim();
    if (!property || !value) return;
    // Compute line/col of the declaration start (skip leading whitespace in buf).
    const startIdx = bufStart;
    const before = contents.slice(0, startIdx);
    const dLine = before.split('\n').length;
    const dCol = startIdx - before.lastIndexOf('\n');
    out.push({
      property,
      value,
      line: dLine,
      column: dCol,
      selector: selectorStack[selectorStack.length - 1] || '',
    });
  };

  for (let i = 0; i < contents.length; i++) {
    const ch = contents[i];
    if (ch === '\n') {
      line++;
      col = 0;
    } else {
      col++;
    }

    if (ch === '{') {
      selectorStack.push(buf.trim().replace(/\s+/g, ' '));
      buf = '';
      bufStart = i + 1;
    } else if (ch === '}') {
      flushDeclaration(i);
      selectorStack.pop();
      bufStart = i + 1;
    } else if (ch === ';') {
      flushDeclaration(i);
      bufStart = i + 1;
    } else {
      if (buf === '') bufStart = i;
      buf += ch;
    }
  }
  return out;
}
