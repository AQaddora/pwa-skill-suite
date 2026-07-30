// Drives the bundled A / B / B-breaking fixtures through the single-origin swap proxy
// (lib/proxy.mjs). One proxy + one browser per run; each check opens its own context so
// checks never bleed state into each other, while the origin (and therefore SW scope)
// stays constant across a swap, which is the entire point of the harness.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSwapProxy } from './proxy.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, '..', 'fixtures');

export const BUILD_A_DIR = path.join(fixturesDir, 'build-a');
export const BUILD_B_DIR = path.join(fixturesDir, 'build-b');
export const BUILD_B_BREAKING_DIR = path.join(fixturesDir, 'build-b-breaking');

/**
 * @param {(ctx: { proxy: object, browser: import('playwright').Browser, buildADir: string, buildBDir: string, buildBBreakingDir: string }) => Promise<any>} fn
 */
export async function withDeployHarness(fn) {
  const proxy = await createSwapProxy(BUILD_A_DIR);
  const browser = await chromium.launch();
  try {
    return await fn({ proxy, browser, buildADir: BUILD_A_DIR, buildBDir: BUILD_B_DIR, buildBBreakingDir: BUILD_B_BREAKING_DIR });
  } finally {
    await browser.close();
    await proxy.close();
  }
}
