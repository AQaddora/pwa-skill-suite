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
  return partitionAgainstBaseline(findings, baselineSet).findings;
}

// Baselines reduce migration noise; they do not turn known defects into proof
// that a rule passed. Keep the suppressed findings as first-class evidence so
// the report can disclose them and preserve FAIL for the affected entries.
export function partitionAgainstBaseline(findings, baselineSet) {
  const active = [];
  const baselinedFindings = [];
  for (const finding of findings) {
    if (baselineSet.has(keyOf(finding))) baselinedFindings.push(finding);
    else active.push(finding);
  }
  return { findings: active, baselinedFindings };
}
