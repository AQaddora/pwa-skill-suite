// The probe-targeting contract. A generic probe cannot, on its own, find "the tab bar",
// know which routes to walk, or reach an authenticated state — so the audited project
// declares those in a `pwa-probes.config.mjs` at its root. This is a public API surface:
// the shape here is what early adopters write against, so it is validated and documented
// rather than sniffed.
//
//   export default {
//     baseURL: 'http://localhost:5173',        // where the running app is served
//     target: 'dev-server',                    // source-dir | dev-server | deployed-origin
//     routes: ['/', '/inbox', '/settings'],    // routes probes should walk
//     auth: { storageState: './state.json' }   // or { async login(page) {…} }, or null
//       | { login: async (page) => {…} } | null,
//     selectors: { tabbar, header, scroller, shell, overlayTrigger, overlayCloseVia },
//   }
//
// Probes also honour `data-pwa-role="tabbar|header|scroller|shell"` annotations in the DOM,
// so a project can annotate instead of (or in addition to) supplying selectors.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TARGETS = ['source-dir', 'dev-server', 'deployed-origin'];
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

export const CONFIG_FILENAME = 'pwa-probes.config.mjs';

function isLocalUrl(baseURL) {
  if (!baseURL) return true;
  try {
    return LOCAL_HOSTS.has(new URL(baseURL).hostname);
  } catch {
    return true;
  }
}

/**
 * Validate and fill defaults on a raw config object.
 * @param {object} raw
 * @param {{ discovered?: boolean }} [meta]
 */
export function normalizeConfig(raw = {}, { discovered = false } = {}) {
  if (raw.target !== undefined && !TARGETS.includes(raw.target)) {
    throw new Error(`pwa-probes config: invalid target "${raw.target}" (allowed: ${TARGETS.join(', ')})`);
  }
  if (raw.routes !== undefined && (!Array.isArray(raw.routes) || raw.routes.some((r) => typeof r !== 'string'))) {
    throw new Error('pwa-probes config: routes must be an array of strings');
  }

  const baseURL = raw.baseURL ?? null;
  const target =
    raw.target ?? (baseURL == null ? 'source-dir' : isLocalUrl(baseURL) ? 'dev-server' : 'deployed-origin');
  const targetIsLocal = target === 'deployed-origin' ? false : isLocalUrl(baseURL);

  return {
    discovered,
    baseURL,
    target,
    targetIsLocal,
    routes: raw.routes && raw.routes.length ? raw.routes : ['/'],
    auth: raw.auth ?? null,
    selectors: raw.selectors ?? {},
  };
}

/**
 * Discover `pwa-probes.config.mjs` under `projectRoot` and normalize it. When absent,
 * returns an undiscovered default so a bare run still works (single route, source-dir).
 * @param {string} projectRoot
 */
export async function loadConfig(projectRoot) {
  const file = path.join(projectRoot, CONFIG_FILENAME);
  if (!existsSync(file)) return normalizeConfig({}, { discovered: false });
  const mod = await import(pathToFileURL(file).href);
  return normalizeConfig(mod.default ?? mod, { discovered: true });
}
