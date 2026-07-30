// Per-probe outcome aggregation over a matrix run.
//
// The five outcomes match packages/report's model, but probe outcomes are derived here
// rather than by report/outcomes.mjs (which is static-scanner-aware only, and is not owned
// by this package). Ordering encodes the project's central honesty rules:
//
//   findings win           — positive evidence of a defect is always meaningful, so it
//                            outranks device-only/origin caveats (this is what lets the
//                            P-101 font-size half FAIL while its zoom half stays UNVERIFIED).
//   origin-only on local   — a check that only means anything against a deployed origin is
//                            N/A on localhost, never a laundered PASS.
//   device-only            — never PASS from emulation; a clean run is UNVERIFIED.
//   unresolved target      — a probe that could not find its target is BLOCKED, never PASS.
//
// @param {object} o
// @param {Array}  [o.findings]   report-shaped findings this probe produced
// @param {boolean}[o.deviceOnly] entry is device-only (WebKit != iOS Safari)
// @param {boolean}[o.originOnly] check is only meaningful against a deployed origin
// @param {boolean}[o.targetIsLocal] the audited target is a local dir / dev server
// @param {boolean}[o.resolved]   the probe resolved its target (default true)
// @param {string} [o.detail]     one-line explanation carried into the report
// @param {string} [o.reproduction] real-device reproduction steps (device-only)
// @returns {{ outcome: string, findings: Array, detail: string, reproduction?: string }}
export function aggregate({
  findings = [],
  deviceOnly = false,
  originOnly = false,
  targetIsLocal = false,
  resolved = true,
  detail = '',
  reproduction,
} = {}) {
  let outcome;
  if (findings.length > 0) outcome = 'FAIL';
  else if (originOnly && targetIsLocal) outcome = 'N/A';
  else if (deviceOnly) outcome = 'UNVERIFIED';
  else if (!resolved) outcome = 'BLOCKED';
  else outcome = 'PASS';

  const result = { outcome, findings, detail };
  if (reproduction) result.reproduction = reproduction;
  return result;
}
