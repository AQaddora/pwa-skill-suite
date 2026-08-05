// P-563 · No error boundary, no global error/unhandledrejection handlers, no reporting
// sink. Anchored at the app's bootstrap call, uses the scanner walker's complete
// ignore-aware file set since these concerns are usually spread across files.
import { lineColAt } from '../lib/loc.mjs';
import { codeMask, firstExecutableMatch } from '../lib/js-lexical.mjs';

export const ids = ['P-563'];

const CODE_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte']);
const NON_APP_DIRECTORY = /^(?:__)?(?:tests?|specs?|fixtures?|examples?|demos?|samples?|mocks?|stories|storybook|docs?|documentation|playgrounds?|benchmarks?|generated|generated-code|vendor)(?:__)?$/i;
const NON_APP_FILE = /(?:^|[._-])(?:test|spec|fixture|example|demo|sample|mock|stories?|generated)(?=\.[^.]+$|[._-])/i;
const WORKSPACE_CONTAINER = new Set(['apps', 'packages', 'projects', 'services', 'sites', 'workspaces']);

const BOOTSTRAP = /ReactDOM\.(?:createRoot|render)\s*\(|(?<![.\w])createRoot\s*\(|createApp\s*\(|\.mount\s*\(\s*['"#]/;
// Boundary-shaped constructs only — a bare `handleError` matches any ordinary
// API-error-handling function and would false-negative on an app that has one of those
// but no actual boundary (getDerivedStateFromError/componentDidCatch are React's real
// boundary hooks; errorCaptured/onErrorCaptured are Vue 2/3; ErrorBoundary is the
// near-universal naming convention, including the react-error-boundary package).
const ERROR_BOUNDARY = /ErrorBoundary|errorCaptured|onErrorCaptured|getDerivedStateFromError|componentDidCatch/;
const IDENTIFIER = String.raw`[A-Za-z_$][\w$]*`;
const CALLBACK_LITERAL = String.raw`(?:(?:async\s+)?function\s*\*?(?:\s+${IDENTIFIER})?\s*\(|(?:async\s*)?(?:\([^)]*\)|${IDENTIFIER})\s*=>)`;
const CALLBACK_REFERENCE = String.raw`(?!(?:null|undefined|true|false)\b)${IDENTIFIER}(?:\s*\.\s*${IDENTIFIER})*`;
const ASSIGNMENT_CALLBACK = String.raw`(?:${CALLBACK_LITERAL}|${CALLBACK_REFERENCE}(?=[ \t]*(?:;|\r?\n|$)))`;
const LISTENER_CALLBACK = String.raw`(?:${CALLBACK_LITERAL}|${CALLBACK_REFERENCE}(?=[ \t]*(?:,|\))))`;
// Match the actual browser globals, not a suffix such as `mywindow` or a nested
// property such as `fixture.window`.
const GLOBAL_OBJECT = String.raw`(?<![\w$.])(?:window|globalThis)`;
const GLOBAL_ERROR_HANDLER = new RegExp(
  String.raw`(?:${GLOBAL_OBJECT}\s*\.\s*onerror\s*=\s*${ASSIGNMENT_CALLBACK}|${GLOBAL_OBJECT}\s*\.\s*addEventListener\s*\(\s*['"]error['"]\s*,\s*${LISTENER_CALLBACK})`,
);
const GLOBAL_REJECTION_HANDLER = new RegExp(
  String.raw`(?:${GLOBAL_OBJECT}\s*\.\s*onunhandledrejection\s*=\s*${ASSIGNMENT_CALLBACK}|${GLOBAL_OBJECT}\s*\.\s*addEventListener\s*\(\s*['"]unhandledrejection['"]\s*,\s*${LISTENER_CALLBACK})`,
);
const REPORTING_SINK = /\b(?:(?:Sentry|Bugsnag|Rollbar|Datadog)\s*\.\s*(?:init|start|notify|error|captureException|captureMessage)|newrelic\s*\.\s*noticeError|captureException|reportError)\s*\(/i;

function isPlausibleAppSource(file) {
  const segments = file.split('/').filter(Boolean);
  if (segments.slice(0, -1).some((segment) => NON_APP_DIRECTORY.test(segment))) return false;
  return !NON_APP_FILE.test(segments.at(-1) || '');
}

function parentPath(file) {
  const index = file.lastIndexOf('/');
  return index === -1 ? '' : file.slice(0, index);
}

function isWithin(root, file) {
  return root === '' || file === root || file.startsWith(`${root}/`);
}

function nearestPackageRoot(file, files) {
  let nearest = null;
  for (const candidate of files) {
    if (candidate.file !== 'package.json' && !candidate.file.endsWith('/package.json')) continue;
    const root = parentPath(candidate.file);
    if (!isWithin(root, file)) continue;
    if (nearest === null || root.length > nearest.length) nearest = root;
  }
  return nearest;
}

function conventionalWorkspaceRoot(file) {
  const segments = file.split('/').filter(Boolean);
  for (let index = 0; index < segments.length - 1; index += 1) {
    if (WORKSPACE_CONTAINER.has(segments[index]) && segments[index + 1]) {
      return segments.slice(0, index + 2).join('/');
    }
  }
  return null;
}

// Aggregate observability evidence only inside the app/workspace that owns this bootstrap.
// A root package remains the boundary for a single app, while a nested package manifest or
// a conventional workspace container isolates siblings in a monorepo. Without this scope,
// Sentry wiring in apps/admin could launder an unprotected apps/storefront bootstrap.
function evidenceBoundary(file, files) {
  const packageRoot = nearestPackageRoot(file, files);
  if (packageRoot) return packageRoot;
  return conventionalWorkspaceRoot(file) ?? packageRoot ?? '';
}

export function appliesTo({ file, contents, ext }) {
  return (
    CODE_EXT.has(ext) &&
    isPlausibleAppSource(file) &&
    firstExecutableMatch(contents, BOOTSTRAP) !== null
  );
}

export function check({ file, contents, ext }, { scannedFiles = [] } = {}) {
  if (!CODE_EXT.has(ext)) return [];
  if (!isPlausibleAppSource(file)) return [];
  const m = firstExecutableMatch(contents, BOOTSTRAP);
  if (!m) return [];

  // Direct rule consumers that do not supply scanner context can still inspect
  // the bootstrap file itself, but only runScan can provide project-wide proof.
  const allFiles = scannedFiles.length > 0 ? scannedFiles : [{ file, contents, ext }];
  const boundary = evidenceBoundary(file, allFiles);
  const files = allFiles.filter((sourceFile) => isWithin(boundary, sourceFile.file));

  let hasBoundary = false;
  let hasGlobalErrorHandler = false;
  let hasGlobalRejectionHandler = false;
  let hasReportingSink = false;

  for (const sourceFile of files) {
    if (
      hasBoundary &&
      hasGlobalErrorHandler &&
      hasGlobalRejectionHandler &&
      hasReportingSink
    ) {
      break;
    }
    if (!CODE_EXT.has(sourceFile.ext)) continue;
    if (!isPlausibleAppSource(sourceFile.file)) continue;
    const src = sourceFile.contents;
    const executable = codeMask(src);
    if (!hasBoundary && ERROR_BOUNDARY.test(executable)) hasBoundary = true;
    if (!hasGlobalErrorHandler && firstExecutableMatch(src, GLOBAL_ERROR_HANDLER)) {
      hasGlobalErrorHandler = true;
    }
    if (!hasGlobalRejectionHandler && firstExecutableMatch(src, GLOBAL_REJECTION_HANDLER)) {
      hasGlobalRejectionHandler = true;
    }
    if (!hasReportingSink && REPORTING_SINK.test(executable)) hasReportingSink = true;
  }

  if (
    hasBoundary &&
    hasGlobalErrorHandler &&
    hasGlobalRejectionHandler &&
    hasReportingSink
  ) {
    return [];
  }

  const { line, column } = lineColAt(contents, m.index);
  const missing = [
    !hasBoundary && 'error boundary',
    !hasGlobalErrorHandler && 'a global error handler',
    !hasGlobalRejectionHandler && 'a global unhandledrejection handler',
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
