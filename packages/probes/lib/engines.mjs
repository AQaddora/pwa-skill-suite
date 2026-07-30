// Engine availability detection.
//
// Playwright ships Chromium and WebKit, but a given host may lack the system libraries one
// of them needs. Rather than crash — or worse, silently drop an engine and quietly narrow
// the matrix — we probe each engine once by launching it, and report which engines are
// usable and which were skipped and why. The runner surfaces the skipped list so a report
// never implies WebKit coverage it did not have.

import { chromium, webkit } from 'playwright';

const ENGINES = { chromium, webkit };
let cache = null;

async function tryLaunch(engine) {
  const browser = await ENGINES[engine].launch();
  await browser.close();
}

/**
 * @param {{ engines?: string[] }} [opts] restrict to these engine names
 * @returns {Promise<{ available: string[], skipped: Array<{engine:string,reason:string}> }>}
 */
export async function availableEngines({ engines = ['chromium', 'webkit'] } = {}) {
  if (cache) return cache;
  const available = [];
  const skipped = [];
  for (const engine of engines) {
    try {
      await tryLaunch(engine);
      available.push(engine);
    } catch (err) {
      skipped.push({ engine, reason: (err?.message || String(err)).split('\n')[0] });
    }
  }
  cache = { available, skipped };
  return cache;
}

// Test seam: reset the memoized detection.
export function _resetEngineCache() {
  cache = null;
}
