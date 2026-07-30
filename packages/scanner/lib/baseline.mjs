// Baseline / suppression file support (eslint-style).
// Format: one finding per line, `<file>:<line>:<id>`. Blank lines and `#` comments ignored.
// Line-anchored on purpose: suppressing one instance must not hide a new instance of the
// same rule at a different line.
import { readFileSync, writeFileSync } from 'node:fs';

const keyOf = (f) => `${f.file}:${f.line}:${f.id}`;

export function readBaseline(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return new Set();
    throw err;
  }
  const set = new Set();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    set.add(line);
  }
  return set;
}

export function writeBaseline(path, findings) {
  const lines = [...new Set(findings.map(keyOf))].sort();
  writeFileSync(path, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');
}

export function filterAgainstBaseline(findings, baselineSet) {
  return findings.filter((f) => !baselineSet.has(keyOf(f)));
}
