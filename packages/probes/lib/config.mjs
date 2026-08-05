// The probe-targeting contract. A generic probe cannot, on its own, find "the tab bar",
// know which routes to walk, or reach an authenticated state — so the audited project
// declares those in a `pwa-probes.config.json` at its root. Repositories that genuinely
// need code (for example an auth.login callback) may use `pwa-probes.config.mjs`, but the
// caller must explicitly opt in to executing that trusted file. This is a public API surface:
// the shape here is what early adopters write against, so it is validated and documented
// rather than sniffed.
//
//   {
//     "baseURL": "http://localhost:5173",
//     "staticRoot": null,
//     "target": "dev-server",
//     "routes": ["/", "/inbox", "/settings"],
//     "auth": {
//       "storageState": "./state.json",
//       "success": { "selector": "[data-authenticated-user]" }
//     },
//     "selectors": { "tabbar": "[data-tabs]", "overlayTrigger": "[data-menu]" },
//     "scenarios": {
//       "overlays": [{
//         "name": "utility menu",
//         "route": "/settings",
//         "triggers": ["[data-menu]", "[data-install-help]"],
//         "overlay": "[data-install-dialog]",
//         "close": "[data-install-close]",
//         "direction": "rtl"
//       }]
//     }
//   }
//
// Probes also honour `data-pwa-role="tabbar|header|scroller|shell"` annotations in the DOM,
// so a project can annotate instead of (or in addition to) supplying selectors.

import { existsSync, realpathSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TARGETS = ['source-dir', 'dev-server', 'deployed-origin'];
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);
const DIRECTIONS = new Set(['document', 'ltr', 'rtl']);
const ROOT_KEYS = new Set([
  'baseURL',
  'staticRoot',
  'target',
  'routes',
  'auth',
  'selectors',
  'scenarios',
]);
const SELECTOR_KEYS = new Set([
  'tabbar',
  'header',
  'scroller',
  'shell',
  'overlay',
  'overlayTrigger',
  'overlayCloseVia',
]);
const SCENARIO_KEYS = new Set(['overlays']);
const OVERLAY_KEYS = new Set([
  'name',
  'route',
  'trigger',
  'triggers',
  'overlay',
  'close',
  'direction',
]);
const AUTH_KEYS = new Set(['storageState', 'login', 'success']);
const AUTH_SUCCESS_KEYS = new Set(['selector', 'urlPattern']);

export const CONFIG_FILENAME = 'pwa-probes.config.json';
export const EXECUTABLE_CONFIG_FILENAME = 'pwa-probes.config.mjs';

function assertKnownKeys(raw, allowed, label) {
  const unknown = Object.keys(raw).filter((key) => !allowed.has(key)).sort();
  if (unknown.length > 0) {
    throw new Error(
      `pwa-probes config: ${label} contains unknown ${unknown.length === 1 ? 'key' : 'keys'}: ${unknown.join(', ')}`,
    );
  }
}

function assertObject(raw, label) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`pwa-probes config: ${label} must be an object`);
  }
}

function validateSameOriginRoute(route, label) {
  if (typeof route !== 'string') {
    throw new Error(`pwa-probes config: ${label} must be a string`);
  }
  if (!route.startsWith('/') || route.startsWith('//') || route.includes('\\')) {
    throw new Error(
      `pwa-probes config: ${label} must be a same-origin path beginning with one slash`,
    );
  }
  const sentinel = new URL(route, 'https://pwa-skill-suite.invalid');
  if (sentinel.origin !== 'https://pwa-skill-suite.invalid') {
    throw new Error(`pwa-probes config: ${label} must stay on the configured origin`);
  }
}

function normalizeOverlayScenario(raw, index) {
  const label = `scenarios.overlays[${index}]`;
  assertObject(raw, label);
  assertKnownKeys(raw, OVERLAY_KEYS, label);
  if (raw.trigger !== undefined && raw.triggers !== undefined) {
    throw new Error(
      `pwa-probes config: ${label} must use either trigger or triggers, not both`,
    );
  }
  const name = raw.name ?? `overlay-${index + 1}`;
  const route = raw.route ?? null;
  const direction = raw.direction ?? 'document';
  const triggers = raw.triggers ?? (raw.trigger == null ? [] : [raw.trigger]);

  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error(`pwa-probes config: scenarios.overlays[${index}].name must be a non-empty string`);
  }
  if (route !== null && typeof route !== 'string') {
    throw new Error(`pwa-probes config: scenarios.overlays[${index}].route must be a string`);
  }
  if (route !== null) validateSameOriginRoute(route, `scenarios.overlays[${index}].route`);
  if (!Array.isArray(triggers) || triggers.some((selector) => typeof selector !== 'string' || selector.trim() === '')) {
    throw new Error(`pwa-probes config: scenarios.overlays[${index}].triggers must be CSS-selector strings`);
  }
  if (
    raw.overlay !== undefined &&
    (typeof raw.overlay !== 'string' || raw.overlay.trim() === '')
  ) {
    throw new Error(`pwa-probes config: scenarios.overlays[${index}].overlay must be a non-empty CSS selector`);
  }
  if (
    raw.close !== undefined &&
    (typeof raw.close !== 'string' || raw.close.trim() === '')
  ) {
    throw new Error(`pwa-probes config: scenarios.overlays[${index}].close must be a non-empty CSS selector`);
  }
  if (!DIRECTIONS.has(direction)) {
    throw new Error(`pwa-probes config: scenarios.overlays[${index}].direction must be document, ltr, or rtl`);
  }

  return {
    name: name.trim(),
    route,
    triggers,
    overlay: raw.overlay ?? null,
    close: raw.close ?? null,
    direction,
  };
}

function normalizeScenarios(raw = {}) {
  assertObject(raw, 'scenarios');
  assertKnownKeys(raw, SCENARIO_KEYS, 'scenarios');
  const overlays = raw.overlays ?? [];
  if (!Array.isArray(overlays)) {
    throw new Error('pwa-probes config: scenarios.overlays must be an array');
  }
  return { overlays: overlays.map(normalizeOverlayScenario) };
}

function validateAuthUrlPattern(pattern) {
  if (
    typeof pattern !== 'string' ||
    pattern.trim() === '' ||
    !pattern.startsWith('/') ||
    pattern.startsWith('//') ||
    pattern.includes('\\')
  ) {
    throw new Error(
      'pwa-probes config: auth.success.urlPattern must be a same-origin path pattern beginning with one slash',
    );
  }
  const sentinel = new URL(pattern.replaceAll('*', 'wildcard'), 'https://pwa-skill-suite.invalid');
  if (sentinel.origin !== 'https://pwa-skill-suite.invalid') {
    throw new Error('pwa-probes config: auth.success.urlPattern must stay on the configured origin');
  }
}

function normalizeAuth(raw, { projectRoot, allowExternal }) {
  if (raw == null) return null;
  assertObject(raw, 'auth');
  assertKnownKeys(raw, AUTH_KEYS, 'auth');

  const seeds = ['storageState', 'login'].filter((key) => raw[key] !== undefined);
  if (seeds.length !== 1) {
    throw new Error(
      'pwa-probes config: auth must configure exactly one seed: storageState or login',
    );
  }
  if (raw.storageState !== undefined) {
    if (typeof raw.storageState !== 'string' || raw.storageState.trim() === '') {
      throw new Error('pwa-probes config: auth.storageState must be a non-empty path string');
    }
  }
  if (raw.login !== undefined && typeof raw.login !== 'function') {
    throw new Error('pwa-probes config: auth.login must be a function');
  }

  assertObject(raw.success, 'auth.success');
  assertKnownKeys(raw.success, AUTH_SUCCESS_KEYS, 'auth.success');
  const postconditions = ['selector', 'urlPattern'].filter(
    (key) => raw.success[key] !== undefined,
  );
  if (postconditions.length !== 1) {
    throw new Error(
      'pwa-probes config: auth.success must configure exactly one postcondition: selector or urlPattern',
    );
  }
  if (
    raw.success.selector !== undefined &&
    (typeof raw.success.selector !== 'string' || raw.success.selector.trim() === '')
  ) {
    throw new Error('pwa-probes config: auth.success.selector must be a non-empty CSS selector');
  }
  if (raw.success.urlPattern !== undefined) validateAuthUrlPattern(raw.success.urlPattern);

  return {
    ...raw,
    ...(raw.storageState
      ? {
          storageState: resolveProjectPath(
            projectRoot,
            raw.storageState,
            'auth.storageState',
            allowExternal,
          ),
        }
      : {}),
    success: { ...raw.success },
  };
}

function isLocalUrl(baseURL) {
  if (!baseURL) return true;
  try {
    return LOCAL_HOSTS.has(new URL(baseURL).hostname);
  } catch {
    return true;
  }
}

function isContained(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

function isStrictlyContained(root, candidate) {
  return candidate !== root && isContained(root, candidate);
}

function resolveProjectPath(projectRoot, value, label, allowExternal) {
  if (!projectRoot) return value;
  const lexicalRoot = path.resolve(projectRoot);
  const absolute = path.isAbsolute(value) ? path.resolve(value) : path.resolve(lexicalRoot, value);
  if (allowExternal) return absolute;

  const realRoot = realpathSync(projectRoot);
  const exists = existsSync(absolute);
  const resolved = exists ? realpathSync(absolute) : null;
  if (
    !isContained(lexicalRoot, absolute) ||
    (resolved !== null && !isContained(realRoot, resolved))
  ) {
    throw new Error(
      `pwa-probes config: ${label} must stay inside the project root unless --allow-external-targets is explicitly trusted`,
    );
  }
  return absolute;
}

/**
 * Resolve the directory the suite-owned HTTP server may expose.
 *
 * `staticRoot` is intentionally stricter than other repository paths. A JSON config is
 * inert, but allowing it to name `.` (or an external directory after a broad trust flag)
 * would turn that config into a source/secret disclosure primitive. Static serving is
 * therefore limited to one existing, dedicated artifact directory strictly below the
 * project root. The canonical path is returned so a contained symlink cannot later be
 * reinterpreted relative to a different working directory.
 */
function resolveStaticRoot(projectRoot, value) {
  if (!projectRoot) {
    throw new Error(
      'pwa-probes config: staticRoot requires a project root so its artifact boundary can be validated',
    );
  }
  if (value.trim() === '') {
    throw new Error('pwa-probes config: staticRoot must be a non-empty path string');
  }

  const lexicalRoot = path.resolve(projectRoot);
  const lexicalCandidate = path.isAbsolute(value)
    ? path.resolve(value)
    : path.resolve(lexicalRoot, value);
  if (!isStrictlyContained(lexicalRoot, lexicalCandidate)) {
    throw new Error(
      'pwa-probes config: staticRoot must be a dedicated artifact directory strictly inside the project root; the project root and external paths are never served',
    );
  }

  let realRoot;
  let realCandidate;
  try {
    realRoot = realpathSync(projectRoot);
    realCandidate = realpathSync(lexicalCandidate);
  } catch {
    throw new Error(
      'pwa-probes config: staticRoot must be an existing dedicated artifact directory',
    );
  }
  if (!isStrictlyContained(realRoot, realCandidate)) {
    throw new Error(
      'pwa-probes config: staticRoot must resolve to a dedicated artifact directory strictly inside the project root; symlink escapes and aliases of the project root are never served',
    );
  }
  let candidateIsDirectory = false;
  try {
    candidateIsDirectory = statSync(realCandidate).isDirectory();
  } catch {
    throw new Error(
      'pwa-probes config: staticRoot must remain an existing dedicated artifact directory',
    );
  }
  if (!candidateIsDirectory) {
    throw new Error('pwa-probes config: staticRoot must resolve to a directory');
  }

  let realEntryDocument;
  try {
    realEntryDocument = realpathSync(path.join(realCandidate, 'index.html'));
  } catch {
    throw new Error(
      'pwa-probes config: staticRoot must contain an existing index.html entry document',
    );
  }
  if (!isContained(realCandidate, realEntryDocument)) {
    throw new Error(
      'pwa-probes config: staticRoot index.html must resolve inside the artifact directory',
    );
  }
  try {
    if (!statSync(realEntryDocument).isFile()) {
      throw new Error('not a file');
    }
  } catch {
    throw new Error('pwa-probes config: staticRoot index.html must be a regular file');
  }
  return realCandidate;
}

/**
 * Validate and fill defaults on a raw config object.
 * @param {object} raw
 * @param {{ discovered?: boolean }} [meta]
 */
export function normalizeConfig(
  raw = {},
  { discovered = false, projectRoot = null, allowExternal = false } = {},
) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('pwa-probes config: root value must be an object');
  }
  assertKnownKeys(raw, ROOT_KEYS, 'root');
  if (raw.target !== undefined && !TARGETS.includes(raw.target)) {
    throw new Error(`pwa-probes config: invalid target "${raw.target}" (allowed: ${TARGETS.join(', ')})`);
  }
  if (
    raw.routes !== undefined &&
    (!Array.isArray(raw.routes) ||
      raw.routes.length === 0 ||
      raw.routes.some((r) => typeof r !== 'string'))
  ) {
    throw new Error('pwa-probes config: routes must be a non-empty array of strings');
  }
  for (const [index, route] of (raw.routes ?? []).entries()) {
    validateSameOriginRoute(route, `routes[${index}]`);
  }
  if (raw.baseURL !== undefined && raw.baseURL !== null && typeof raw.baseURL !== 'string') {
    throw new Error('pwa-probes config: baseURL must be a string or null');
  }
  if (
    raw.staticRoot !== undefined &&
    (typeof raw.staticRoot !== 'string' || raw.staticRoot.trim() === '')
  ) {
    throw new Error('pwa-probes config: staticRoot must be a non-empty path string');
  }
  if (raw.selectors !== undefined) {
    assertObject(raw.selectors, 'selectors');
    assertKnownKeys(raw.selectors, SELECTOR_KEYS, 'selectors');
    if (
      Object.values(raw.selectors).some(
        (selector) => typeof selector !== 'string' || selector.trim() === '',
      )
    ) {
      throw new Error(
        'pwa-probes config: selectors must be an object of non-empty CSS-selector strings',
      );
    }
  }

  const baseURL = raw.baseURL ?? null;
  if (baseURL !== null) {
    let parsedBaseURL;
    try {
      parsedBaseURL = new URL(baseURL);
    } catch {
      throw new Error('pwa-probes config: baseURL must be an absolute http(s) URL');
    }
    if (!['http:', 'https:'].includes(parsedBaseURL.protocol)) {
      throw new Error('pwa-probes config: baseURL must be an absolute http(s) URL');
    }
    if (parsedBaseURL.username || parsedBaseURL.password) {
      throw new Error('pwa-probes config: baseURL must not embed credentials');
    }
    if (!isLocalUrl(baseURL) && !allowExternal) {
      throw new Error(
        'pwa-probes config: refusing a non-local baseURL without explicit trust; pass --allow-external-targets',
      );
    }
  }
  const target =
    raw.target ?? (baseURL == null ? 'source-dir' : isLocalUrl(baseURL) ? 'dev-server' : 'deployed-origin');
  // Origin-only checks require an actual non-local origin. A caller cannot turn localhost
  // into deployment evidence merely by labelling the target `deployed-origin`.
  const targetIsLocal = isLocalUrl(baseURL);

  const auth = normalizeAuth(raw.auth, { projectRoot, allowExternal });
  // Unlike a remote baseURL or auth state, filesystem serving is never widened by
  // --allow-external-targets. That flag must not accidentally authorize serving source,
  // the repository root, or an arbitrary host directory over HTTP.
  const staticRoot = raw.staticRoot ? resolveStaticRoot(projectRoot, raw.staticRoot) : null;

  return {
    discovered,
    baseURL,
    staticRoot,
    target,
    targetIsLocal,
    routes: raw.routes && raw.routes.length ? raw.routes : ['/'],
    auth,
    selectors: raw.selectors ?? {},
    scenarios: normalizeScenarios(raw.scenarios),
  };
}

/**
 * Discover inert `pwa-probes.config.json` under `projectRoot` and normalize it. Executable
 * MJS is default-deny and loaded only with `{ allowExecutable: true }`. When both exist,
 * JSON wins. When absent, return an undiscovered single-route/source-dir default.
 * @param {string} projectRoot
 * @param {{ allowExecutable?: boolean, allowExternal?: boolean }} [options]
 */
export async function loadConfig(
  projectRoot,
  { allowExecutable = false, allowExternal = false } = {},
) {
  const jsonFile = path.join(projectRoot, CONFIG_FILENAME);
  if (existsSync(jsonFile)) {
    let raw;
    try {
      raw = JSON.parse(await readFile(jsonFile, 'utf8'));
    } catch (error) {
      throw new Error(`pwa-probes config: could not parse ${CONFIG_FILENAME}: ${error.message}`);
    }
    return normalizeConfig(raw, { discovered: true, projectRoot, allowExternal });
  }

  const executableFile = path.join(projectRoot, EXECUTABLE_CONFIG_FILENAME);
  if (!existsSync(executableFile)) {
    return normalizeConfig({}, { discovered: false, projectRoot, allowExternal });
  }
  if (!allowExecutable) {
    throw new Error(
      `pwa-probes config: refusing to execute ${EXECUTABLE_CONFIG_FILENAME} without explicit trust; use ${CONFIG_FILENAME} or pass --allow-config-code`,
    );
  }
  const mod = await import(pathToFileURL(executableFile).href);
  return normalizeConfig(mod.default ?? mod, {
    discovered: true,
    projectRoot,
    // Trusting repository code and trusting a browser/storage-state target are
    // separate decisions. Executable config may describe a remote target, but it
    // still needs the explicit external-target opt-in before we navigate there.
    allowExternal,
  });
}
