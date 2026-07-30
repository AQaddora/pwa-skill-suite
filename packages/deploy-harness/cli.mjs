#!/usr/bin/env node
// Deploy harness CLI: `node packages/deploy-harness/cli.mjs [--json]`
//
// Runs the bundled A→B (and A→B-breaking) fixture pair through every stale-code and
// version-skew assertion. Unlike packages/probes, this harness is not pointed at an
// arbitrary project — see the "Scope" note in the README for why (SSR apps have no static
// output to swap; skew assertions need seeded auth/storage state the fixtures supply).
import { runHarnessSuite } from './runner.mjs';

async function main(argv) {
  const json = argv.includes('--json');
  const suite = await runHarnessSuite();
  if (json) {
    console.log(JSON.stringify({ results: suite.results, failed: suite.failed }, null, 2));
  } else {
    console.log(suite.markdown);
  }
  process.exit(suite.failed ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exit(2);
  });
}
