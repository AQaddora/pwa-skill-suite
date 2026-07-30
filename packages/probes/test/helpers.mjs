// Shared test harness: serve a fixture dir through a real origin, build a probe harness,
// run one probe against it, tear everything down. Not a *.test.mjs file, so it isn't
// executed as a suite itself.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveDir } from '../lib/server.mjs';
import { createHarness } from '../lib/harness.mjs';
import { normalizeConfig } from '../lib/config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

export function fixturePath(kind, name) {
  return path.join(here, '..', 'fixtures', kind, name);
}

/**
 * @param {object} probe                a probe module { ids, name, run }
 * @param {string} fixtureDir           dir to serve
 * @param {object} [opts]
 * @param {string[]} [opts.engines]     defaults to chromium only (fast, always present)
 * @param {string[]} [opts.routes]
 * @param {object} [opts.selectors]
 * @param {object} [opts.auth]
 */
export async function runProbeAgainst(probe, fixtureDir, { engines = ['chromium'], routes = ['/'], selectors = {}, auth = null } = {}) {
  const server = await serveDir(fixtureDir);
  const config = normalizeConfig({ baseURL: server.url, routes, selectors, auth });
  const harness = createHarness({ config, engines });
  try {
    return await probe.run(harness);
  } finally {
    await harness.closeAll();
    await server.close();
  }
}
