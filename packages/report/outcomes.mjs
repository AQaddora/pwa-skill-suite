// Five-outcome model. Device-only entries are never PASS — static absence of a finding
// is not proof on a device-only concern. BLOCKED is a caller-supplied override for when
// the scan itself could not run.
export const OUTCOMES = ['PASS', 'FAIL', 'UNVERIFIED', 'N/A', 'BLOCKED'];

export function deriveOutcome({
  catalogEntry,
  findings = [],
  baselinedFindings = [],
  surfacePresent,
  applicableFiles = 0,
  incompleteFiles = 0,
  blocked = false,
  policyExempt = null,
}) {
  if (blocked) return 'BLOCKED';
  // A policy waiver is a decision about whether this entry is a defect *on this surface*,
  // so it outranks evidence — but only ever downward, to N/A. It can never produce a PASS,
  // and the waived findings are still reported. See packages/report/policy.mjs.
  if (policyExempt) return 'N/A';
  // Positive evidence outranks applicability heuristics. Surface detection can miss an
  // RTL/form/SW surface, but a rule finding is direct evidence and must never become N/A.
  if (findings.length > 0) return 'FAIL';
  // Baselines match current emitted findings. They can reduce migration noise in
  // the grouped list, but the positively observed defect still has a FAIL outcome.
  if (baselinedFindings.length > 0) return 'FAIL';
  if (surfacePresent === false) return 'N/A';
  if (catalogEntry.deviceOnly) return 'UNVERIFIED';
  if (catalogEntry.rule == null) return 'UNVERIFIED';
  // Some repositories mix analyzable sources with template/component formats the
  // rule cannot parse. A clean supported file does not prove the unsupported source
  // is clean, so incomplete coverage always prevents PASS.
  if (Number.isFinite(incompleteFiles) && incompleteFiles > 0) return 'UNVERIFIED';
  // A rule can only prove absence after it inspected at least one input format it
  // understands. Empty repositories and repositories made entirely of unsupported
  // file types therefore remain UNVERIFIED rather than receiving synthetic PASSes.
  if (!Number.isFinite(applicableFiles) || applicableFiles <= 0) return 'UNVERIFIED';
  return 'PASS';
}
