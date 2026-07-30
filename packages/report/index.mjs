// Builds the report model: findings grouped by fix, an outcome per catalog entry, the
// blind-spots disclosure, and a severity/confidence summary.
import { groupByFix } from './group.mjs';
import { deriveOutcome } from './outcomes.mjs';
import { SCANNER_BLIND_SPOTS } from './visibility.mjs';

// Sections that map to a detectable "surface". If the caller reports the surface absent,
// entries in that section are N/A rather than failures. Sections not listed here are
// always considered present (we can't cheaply prove their absence).
const SURFACE_SECTIONS = new Set(['forms', 'service-worker', 'rtl', 'manifest']);

function bucketOf(entry) {
  if (!entry) return 'P2';
  if (entry.confidence === 'advisory') return 'advisory';
  return entry.severity || 'P2';
}

export function buildReport({ findings = [], catalog = [], surfaces = {}, blocked = false }) {
  const findingsById = new Map();
  for (const f of findings) {
    if (!findingsById.has(f.id)) findingsById.set(f.id, []);
    findingsById.get(f.id).push(f);
  }

  const outcomesByEntry = new Map();
  for (const entry of catalog) {
    const entryFindings = findingsById.get(entry.id) || [];
    const surfacePresent = SURFACE_SECTIONS.has(entry.section) ? surfaces[entry.section] : undefined;
    outcomesByEntry.set(
      entry.id,
      deriveOutcome({ catalogEntry: entry, findings: entryFindings, surfacePresent, blocked }),
    );
  }

  const grouped = groupByFix(findings, catalog);
  const summary = { p0: 0, p1: 0, p2: 0, advisory: 0 };
  for (const g of grouped) {
    const bucket = bucketOf(g.catalogEntry);
    if (bucket === 'advisory') summary.advisory += g.count;
    else if (bucket === 'P0') summary.p0 += g.count;
    else if (bucket === 'P1') summary.p1 += g.count;
    else summary.p2 += g.count;
  }

  return { findings, grouped, outcomesByEntry, blindSpots: SCANNER_BLIND_SPOTS, summary };
}
