// Engine availability detection.
//
// Playwright ships Chromium and WebKit, but a given host may lack the system libraries one
// of them needs. Rather than crash — or worse, silently drop an engine and quietly narrow
// the matrix — we probe each engine once by launching it, and report which engines are
// usable and which were skipped and why. The runner surfaces the skipped list and blocks
// an incomplete required matrix so a report never implies WebKit coverage it did not have.

import { chromium, webkit } from 'playwright';
import { DEFAULT_REQUIRED_ENGINES } from './engine-policy.mjs';

const ENGINES = { chromium, webkit };
const cache = new Map();

async function tryLaunch(engine) {
  const browser = await ENGINES[engine].launch();
  await browser.close();
}

/**
 * @param {{ engines?: string[] }} [opts] restrict to these engine names
 * @returns {Promise<{ expected: string[], available: string[], skipped: Array<{engine:string,reason:string}> }>}
 */
export async function availableEngines({ engines = DEFAULT_REQUIRED_ENGINES } = {}) {
  const requested = [...engines];
  const cacheKey = requested.join('\0');
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const available = [];
  const skipped = [];
  for (const engine of requested) {
    try {
      await tryLaunch(engine);
      available.push(engine);
    } catch (err) {
      skipped.push({ engine, reason: (err?.message || String(err)).split('\n')[0] });
    }
  }
  const result = { expected: requested, available, skipped };
  cache.set(cacheKey, result);
  return result;
}

// Test seam: reset the memoized detection.
export function _resetEngineCache() {
  cache.clear();
}
