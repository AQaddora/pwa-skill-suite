// P-563 · No error boundary, no global error/unhandledrejection handlers, no reporting
// sink. Anchored at the app's bootstrap call, scans every source file in the project
// (found via the nearest package.json) since these three concerns are usually spread
// across separate files — a single-file check would false-positive constantly.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { lineColAt } from '../lib/loc.mjs';

export const ids = ['P-563'];

const CODE_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte']);
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.svelte-kit', '.nuxt', 'coverage', '.cache']);

const BOOTSTRAP = /ReactDOM\.(?:createRoot|render)\s*\(|(?<![.\w])createRoot\s*\(|createApp\s*\(|\.mount\s*\(\s*['"#]/;
// Boundary-shaped constructs only — a bare `handleError` matches any ordinary
// API-error-handling function and would false-negative on an app that has one of those
// but no actual boundary (getDerivedStateFromError/componentDidCatch are React's real
// boundary hooks; errorCaptured/onErrorCaptured are Vue 2/3; ErrorBoundary is the
// near-universal naming convention, including the react-error-boundary package).
const ERROR_BOUNDARY = /ErrorBoundary|errorCaptured|onErrorCaptured|getDerivedStateFromError|componentDidCatch/;
const GLOBAL_HANDLERS = /window\.onerror|addEventListener\(\s*['"]error['"]|addEventListener\(\s*['"]unhandledrejection['"]/;
const REPORTING_SINK = /Sentry|Bugsnag|captureException|errorReporting/i;

// The scanner's own scan root, reconstructed from `absFile` and the relative `file`
// path the walker reports for it (one `dirname()` per path segment in `file`). Bounds
// project-root discovery below so a subpackage of a monorepo with no local
// package.json doesn't walk up into (and then scan) unrelated sibling packages.
function computeScanRoot(absFile, file) {
  let dir = absFile;
  const segments = file.split('/').length;
  for (let i = 0; i < segments; i++) dir = path.dirname(dir);
  return dir;
}

function findProjectRoot(startDir, scanRoot) {
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(dir, 'package.json'))) return dir;
    if (dir === scanRoot) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return scanRoot;
}

function collectSourceFiles(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, acc);
    } else if (entry.isFile() && CODE_EXT.has(path.extname(entry.name))) {
      acc.push(full);
    }
  }
  return acc;
}

export function check({ file, contents, ext, absFile }) {
  if (!CODE_EXT.has(ext)) return [];
  const m = BOOTSTRAP.exec(contents);
  if (!m) return [];

  const scanRoot = computeScanRoot(absFile, file);
  const root = findProjectRoot(path.dirname(absFile), scanRoot);
  const files = collectSourceFiles(root);

  let hasBoundary = false;
  let hasGlobalHandlers = false;
  let hasReportingSink = false;

  for (const f of files) {
    if (hasBoundary && hasGlobalHandlers && hasReportingSink) break;
    let src;
    try {
      src = readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    if (!hasBoundary && ERROR_BOUNDARY.test(src)) hasBoundary = true;
    if (!hasGlobalHandlers && GLOBAL_HANDLERS.test(src)) hasGlobalHandlers = true;
    if (!hasReportingSink && REPORTING_SINK.test(src)) hasReportingSink = true;
  }

  if (hasBoundary && hasGlobalHandlers && hasReportingSink) return [];

  const { line, column } = lineColAt(contents, m.index);
  const missing = [
    !hasBoundary && 'error boundary',
    !hasGlobalHandlers && 'global error/unhandledrejection handlers',
    !hasReportingSink && 'a reporting sink',
  ]
    .filter(Boolean)
    .join(', ');

  return [
    {
      id: 'P-563',
      file,
      line,
      column,
      excerpt: `app bootstrap with no ${missing}`,
      severity: 'P0',
      confidence: 'high',
    },
  ];
}
