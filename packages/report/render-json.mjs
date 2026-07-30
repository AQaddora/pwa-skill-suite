// Serializes a ReportModel to JSON. Maps (outcomesByEntry) are converted to plain
// objects so the output round-trips through JSON.parse.
export function renderJson(model) {
  const { findings, grouped, outcomesByEntry, summary, blindSpots } = model;
  const outcomes = {};
  if (outcomesByEntry) {
    for (const [id, outcome] of outcomesByEntry) outcomes[id] = outcome;
  }
  return JSON.stringify(
    { summary, findings, grouped, outcomes, blindSpots },
    null,
    2,
  );
}
