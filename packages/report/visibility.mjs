// What a static file scan cannot see. Reporting a clean bill of health on an app whose
// styles are invisible to the scanner is the most dangerous output this tool can produce,
// so this disclosure is always rendered near the top of the report.
export const SCANNER_BLIND_SPOTS = [
  '**What this scan could NOT see** (static analysis has hard limits):',
  '',
  '- **CSS-in-JS** — styled-components, Emotion, vanilla-extract: styles built at runtime',
  '  from JS produce no matchable source shape.',
  '- **Theme objects** — MUI `sx`/`theme`, Chakra tokens, design-system config: values are',
  '  resolved in JS, not written as CSS this scanner reads.',
  '- **Shadow DOM** — styles scoped inside web components are not reachable by a file scan.',
  '- **Computed styles & the rendered DOM** — the resolved cascade, media-query outcomes,',
  '  and flex/transform ancestor chains are a Phase 2 runtime concern, not decided here.',
  '',
  'A clean report is not proof of correctness for an app that relies on the above.',
].join('\n');
