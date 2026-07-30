// Per-assertion outcome. Only three outcomes apply to this harness (unlike packages/probes,
// there is no device-only or origin-only concept here — the proxy is always a real HTTP
// origin): a finding always wins, and a check whose seed state could not be established
// reports BLOCKED rather than laundering into a PASS.
//
// @param {object} o
// @param {Array}   [o.findings]  report-shaped findings this check produced
// @param {boolean} [o.resolved]  the check could seed/observe what it needed (default true)
// @param {string}  [o.detail]    one-line explanation carried into the report
export function aggregate({ findings = [], resolved = true, detail = '' } = {}) {
  let outcome;
  if (findings.length > 0) outcome = 'FAIL';
  else if (!resolved) outcome = 'BLOCKED';
  else outcome = 'PASS';
  return { outcome, findings, detail };
}
