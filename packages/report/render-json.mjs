// Serializes a ReportModel to JSON. Maps (outcomesByEntry) are converted to plain
// objects so the output round-trips through JSON.parse.
export function renderJson(model) {
  const {
    status = model.blocked ? 'BLOCKED' : 'COMPLETE',
    blocked = status === 'BLOCKED',
    diagnostics = [],
    findings,
    baselinedFindings = [],
    coverageById = {},
    incompleteCoverageById = {},
    grouped,
    outcomesByEntry,
    summary,
    blindSpots,
    policy = null,
    policyExemptions = [],
    policyWaivedFindings = [],
  } = model;
  const outcomes = {};
  if (outcomesByEntry) {
    for (const [id, outcome] of outcomesByEntry) outcomes[id] = outcome;
  }
  const coverage =
    coverageById instanceof Map ? Object.fromEntries(coverageById) : { ...coverageById };
  const incompleteCoverage =
    incompleteCoverageById instanceof Map
      ? Object.fromEntries(incompleteCoverageById)
      : { ...incompleteCoverageById };
  return JSON.stringify(
    {
      status,
      blocked,
      policy,
      policyExemptions,
      policyWaivedFindings,
      diagnostics,
      summary,
      findings,
      baselinedFindings,
      coverage,
      incompleteCoverage,
      grouped,
      outcomes,
      blindSpots,
    },
    null,
    2,
  );
}
