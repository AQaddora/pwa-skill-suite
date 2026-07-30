// Report-compatible finding construction for the deploy harness — same shape as
// packages/probes/lib/finding.mjs ({ id, file, line, excerpt }), so findings from both
// packages render through the one shared packages/report renderer.

export function makeFinding(id, { context = '', selector = '', detail = '' } = {}) {
  const excerpt = `${selector} — ${detail}`;
  return { id, file: context, line: 0, excerpt };
}
