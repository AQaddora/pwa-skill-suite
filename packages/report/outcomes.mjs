// Five-outcome model. Device-only entries are never PASS — static absence of a finding
// is not proof on a device-only concern. BLOCKED is a caller-supplied override for when
// the scan itself could not run.
export const OUTCOMES = ['PASS', 'FAIL', 'UNVERIFIED', 'N/A', 'BLOCKED'];

export function deriveOutcome({ catalogEntry, findings = [], surfacePresent, blocked = false }) {
  if (blocked) return 'BLOCKED';
  if (surfacePresent === false) return 'N/A';
  if (catalogEntry.deviceOnly) return 'UNVERIFIED';
  if (findings.length > 0) return 'FAIL';
  if (catalogEntry.rule == null) return 'UNVERIFIED';
  return 'PASS';
}
