// The probe harness: browsers, contexts, navigation, and the display-mode / RTL / auth
// emulation probes rely on. Each probe receives one harness and drives it however it needs
// (some walk every matrix cell, some navigate a sequence of routes), rather than being
// called once per cell — probe driving needs are too heterogeneous for a fixed loop.

import { chromium, webkit } from 'playwright';
import { cells } from './matrix.mjs';

const ENGINES = { chromium, webkit };

// Emulate an installed PWA: report `(display-mode: standalone)` and iOS `navigator.standalone`.
// This is emulation — real standalone chrome (status bar, no URL bar) is device-only — but it
// lets probes exercise the standalone code path (e.g. an in-app back affordance).
function standaloneShim() {
  const orig = window.matchMedia.bind(window);
  window.matchMedia = (q) => {
    if (/display-mode:\s*standalone/i.test(q)) {
      return {
        matches: true,
        media: q,
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent() {
          return false;
        },
      };
    }
    return orig(q);
  };
  try {
    Object.defineProperty(window.navigator, 'standalone', { get: () => true, configurable: true });
  } catch {
    /* some engines disallow redefining */
  }
}

export function createHarness({ config, engines }) {
  const browsers = new Map();
  let authState; // undefined = unresolved, null = no auth

  async function getBrowser(engine) {
    if (!browsers.has(engine)) browsers.set(engine, await ENGINES[engine].launch());
    return browsers.get(engine);
  }

  // Resolve auth once: a storageState path is used directly; a login(page) function is run in a
  // throwaway context and its resulting storageState captured.
  async function authStorageState() {
    if (authState !== undefined) return authState;
    const auth = config.auth;
    if (!auth) return (authState = null);
    if (auth.storageState) return (authState = auth.storageState);
    if (typeof auth.login === 'function') {
      const browser = await getBrowser(engines[0]);
      const context = await browser.newContext();
      const page = await context.newPage();
      await auth.login(page, { baseURL: config.baseURL });
      authState = await context.storageState();
      await context.close();
      return authState;
    }
    return (authState = null);
  }

  /**
   * Open a page at a route under a matrix cell. Waits on `load`, never a fixed sleep.
   */
  async function openPage({
    engine = engines[0],
    width = 390,
    height = 844,
    displayMode = null,
    rtl = false,
    route = '/',
    authenticated = false,
  } = {}) {
    const browser = await getBrowser(engine);
    const contextOpts = { viewport: { width, height } };
    if (authenticated) {
      const state = await authStorageState();
      if (state) contextOpts.storageState = state;
    }
    const context = await browser.newContext(contextOpts);
    if (displayMode === 'standalone') await context.addInitScript(standaloneShim);
    const page = await context.newPage();
    const url = new URL(route, config.baseURL).href;
    await page.goto(url, { waitUntil: 'load' });
    if (rtl) await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
    return { page, context, close: () => context.close() };
  }

  async function closeAll() {
    for (const b of browsers.values()) await b.close();
    browsers.clear();
  }

  return {
    config,
    engines,
    cells: () => cells({ engines }),
    openPage,
    authStorageState,
    closeAll,
  };
}
