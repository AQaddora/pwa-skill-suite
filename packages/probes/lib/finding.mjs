// Report-compatible finding construction for probes.
//
// packages/report/group.mjs consumes { id, file, line, excerpt }. Probe targets are runtime
// DOM, not source lines, so `file` carries the route/context and `line` is 0; the excerpt
// names the culprit selector, the measured defect, and the exact matrix cell it reproduced
// in — because "the page overflows" is not an actionable finding.

export function cellLabel(cell) {
  if (!cell) return '';
  const { engine, width, height, orientation } = cell;
  return `${width}×${height} ${engine} ${orientation}`;
}

export function makeFinding(id, { context = '', selector = '', detail = '', cell } = {}) {
  const label = cellLabel(cell);
  const excerpt = `${selector} — ${detail}${label ? ` [${label}]` : ''}`;
  return { id, file: context, line: 0, excerpt };
}
