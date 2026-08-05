#!/usr/bin/env node
// Deploy harness CLI: `node packages/deploy-harness/cli.mjs [--json]`
//
// Runs the bundled A→B (and A→B-breaking) fixture pair through every stale-code and
// version-skew assertion. Unlike packages/probes, this harness is not pointed at an
// arbitrary project — see the "Scope" note in the README for why (SSR apps have no static
// output to swap; skew assertions need seeded auth/storage state the fixtures supply).
import { runHarnessSuite } from './runner.mjs';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

async function main(argv) {
  const json = argv.includes('--json');
  const suite = await runHarnessSuite();
  if (json) {
    console.log(JSON.stringify({ results: suite.results, failed: suite.failed }, null, 2));
  } else {
    console.log(suite.markdown);
  }
  // process.exit() terminates before Node flushes an async stdout write, so a report
  // larger than the pipe buffer (8 KiB on macOS) is silently truncated mid-token for any
  // caller capturing the output. Set the code and let the runtime exit once stdout drains.
  process.exitCode = suite.failed ? 1 : 0;
}

// `import.meta.url === pathToFileURL(process.argv[1]).href` silently fails whenever any
// component of the path is a symlink: Node resolves import.meta.url to the REAL path while
// process.argv[1] keeps the symlinked one. On macOS os.tmpdir() lives under /var -> /private/var,
// so this entrypoint would load and exit 0 having done nothing. A silent exit 0 is the worst
// possible failure for a verification tool — it reads as "clean". Compare canonical paths.
function invokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exit(2);
  });
}
