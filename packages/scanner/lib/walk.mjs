// File-tree walker. Yields { file, contents, ext } for each file with a matching
// extension. Unambiguous dependency/framework caches are skipped below the requested
// root. Ambiguous names such as build/dist/out are scanned unless the repository opts
// out explicitly, because basename-only pruning can hide authored source.
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, relative, sep } from 'node:path';
import { UNSUPPORTED_WEB_SOURCE_EXTENSIONS } from './applicability.mjs';

// These names have repository-independent semantics: they are dependency metadata or
// framework-owned caches, never an application's authored source directory. Ambiguous
// names such as `build`, `dist`, and `out` deliberately do not belong here. Some
// repositories use those names for authored source, so silently pruning by basename can
// turn a real defect into PASS. Repositories that have generated copies under those names
// opt out explicitly with `.pwa-auditignore`/`--ignore`.
const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.svelte-kit',
  '.nuxt',
  'coverage',
  '.cache',
  '.hosting-snapshot',
]);

const DEFAULT_EXTENSIONS = [
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.svelte',
  '.html',
  '.htm',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.json',
  '.jsonc',
  '.toml',
  '.yaml',
  '.yml',
  '.conf',
  // These formats are intentionally walked even before rules understand them.
  // Their presence is negative evidence: a rule that cannot inspect a relevant
  // template must remain UNVERIFIED rather than claim PASS from another file.
  ...UNSUPPORTED_WEB_SOURCE_EXTENSIONS,
];

const SPECIAL_FILE_NAMES = new Set(['_headers', 'nginx.conf', 'Caddyfile', '.htaccess']);

function posixPath(value) {
  return value.split(sep).join('/');
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function globRegex(glob) {
  let source = '';
  for (let i = 0; i < glob.length; i++) {
    if (glob[i] === '*' && glob[i + 1] === '*') {
      source += '.*';
      i += 1;
    } else if (glob[i] === '*') {
      source += '[^/]*';
    } else if (glob[i] === '?') {
      source += '[^/]';
    } else {
      source += escapeRegex(glob[i]);
    }
  }
  return new RegExp(`^${source}$`);
}

// `.pwa-auditignore` deliberately implements a compact, portable subset of
// gitignore syntax: comments/blank lines, root-anchored `/path`, directory
// suffixes, `*`, `**`, and `?`. Negation is intentionally unsupported because
// pruning a parent directory makes later re-inclusion ambiguous.
export function compileIgnorePatterns(patterns = []) {
  const compiled = [];
  for (const raw of patterns) {
    let pattern = String(raw).trim();
    if (!pattern || pattern.startsWith('#')) continue;
    if (pattern.startsWith('!')) {
      throw new Error(`ignore negation is not supported: ${pattern}`);
    }

    const anchored = pattern.startsWith('/');
    if (anchored) pattern = pattern.slice(1);
    if (pattern.startsWith('./')) pattern = pattern.slice(2);
    const directoryOnly = pattern.endsWith('/');
    if (directoryOnly) pattern = pattern.slice(0, -1);
    if (!pattern) continue;

    compiled.push({
      anchored,
      directoryOnly,
      hasSlash: pattern.includes('/'),
      regex: globRegex(pattern),
      raw: String(raw).trim(),
    });
  }
  return compiled;
}

function matchesIgnore(relativePath, isDirectory, compiledPatterns) {
  const normalized = posixPath(relativePath).replace(/^\.\//, '');
  const name = basename(normalized);
  for (const pattern of compiledPatterns) {
    if (pattern.directoryOnly && !isDirectory) continue;
    if (pattern.anchored || pattern.hasSlash) {
      if (pattern.regex.test(normalized)) return true;
    } else if (pattern.regex.test(name)) {
      return true;
    }
  }
  return false;
}

function isContainedPath(rootReal, targetReal) {
  const rel = relative(rootReal, targetReal);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function isIgnoredCanonicalPath(relativePath, isDirectory, compiledPatterns) {
  const normalized = posixPath(relativePath).replace(/^\.\//, '');
  if (matchesIgnore(normalized, isDirectory, compiledPatterns)) return true;

  const segments = normalized.split('/').filter(Boolean);
  const directoryCount = isDirectory ? segments.length : Math.max(0, segments.length - 1);
  for (let index = 0; index < directoryCount; index++) {
    if (IGNORE_DIRS.has(segments[index])) return true;
    const ancestor = segments.slice(0, index + 1).join('/');
    if (matchesIgnore(ancestor, true, compiledPatterns)) return true;
  }
  return false;
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Walk a scan root without silently swallowing filesystem failures.
 *
 * `onError` receives structured diagnostics. The caller decides whether to
 * continue, but the scanner treats every diagnostic as a BLOCKED audit.
 */
export async function* walkFiles(
  rootDir,
  {
    extensions = DEFAULT_EXTENSIONS,
    base = rootDir,
    ignorePatterns = [],
    onError = () => {},
    _state,
    _realDir,
  } = {},
) {
  const alreadyCompiled =
    Array.isArray(ignorePatterns) &&
    ignorePatterns.every((pattern) => pattern && pattern.regex instanceof RegExp);
  const compiledPatterns = alreadyCompiled ? ignorePatterns : compileIgnorePatterns(ignorePatterns);
  let state = _state;
  let currentReal = _realDir;
  if (!state) {
    try {
      currentReal = await realpath(rootDir);
      state = {
        rootReal: currentReal,
        activeDirectories: new Set(),
        visitedDirectories: new Set(),
      };
    } catch (error) {
      onError({
        code: 'ROOT_REALPATH_FAILED',
        path: '.',
        message: `Could not resolve audit root: ${messageOf(error)}`,
      });
      return;
    }
  }

  const displayPath = posixPath(relative(base, rootDir)) || '.';
  if (state.activeDirectories.has(currentReal)) {
    onError({
      code: 'SYMLINK_CYCLE',
      path: displayPath,
      message: 'Directory symlink resolves to an ancestor already being scanned.',
    });
    return;
  }
  if (state.visitedDirectories.has(currentReal)) return;
  state.activeDirectories.add(currentReal);
  state.visitedDirectories.add(currentReal);

  let entries;
  try {
    entries = await readdir(rootDir, { withFileTypes: true });
  } catch (error) {
    onError({
      code: 'DIRECTORY_READ_FAILED',
      path: posixPath(relative(base, rootDir)) || '.',
      message: `Could not read directory: ${messageOf(error)}`,
    });
    state.activeDirectories.delete(currentReal);
    return;
  }

  try {
    for (const entry of entries) {
      const full = join(rootDir, entry.name);
      let readPath = full;
      const relativePath = posixPath(relative(base, full));
      if (IGNORE_DIRS.has(entry.name)) continue;

      if (entry.isSymbolicLink()) {
        if (
          matchesIgnore(relativePath, false, compiledPatterns) ||
          matchesIgnore(relativePath, true, compiledPatterns)
        ) {
          continue;
        }

        let targetReal;
        let targetStat;
        try {
          targetReal = await realpath(full);
          targetStat = await stat(full);
        } catch (error) {
          onError({
            code: 'SYMLINK_RESOLUTION_FAILED',
            path: relativePath,
            message: `Could not resolve symlink: ${messageOf(error)}`,
          });
          continue;
        }
        if (!isContainedPath(state.rootReal, targetReal)) {
          onError({
            code: 'SYMLINK_OUTSIDE_ROOT',
            path: relativePath,
            message: 'Symlink resolves outside the requested audit root.',
          });
          continue;
        }

        const canonicalRelative = posixPath(relative(state.rootReal, targetReal));
        if (
          isIgnoredCanonicalPath(canonicalRelative, targetStat.isDirectory(), compiledPatterns)
        ) {
          continue;
        }
        if (targetStat.isDirectory()) {
          yield* walkFiles(full, {
            extensions,
            base,
            ignorePatterns: compiledPatterns,
            onError,
            _state: state,
            _realDir: targetReal,
          });
          continue;
        }
        if (!targetStat.isFile()) {
          onError({
            code: 'SYMLINK_UNSUPPORTED_TARGET',
            path: relativePath,
            message: 'Symlink target is neither a regular file nor a directory.',
          });
          continue;
        }
        readPath = targetReal;
        // A contained file symlink is read below using the link's repository path
        // and extension, preserving useful finding locations without escaping root.
      } else if (entry.isDirectory()) {
        if (matchesIgnore(relativePath, true, compiledPatterns)) continue;
        yield* walkFiles(full, {
          extensions,
          base,
          ignorePatterns: compiledPatterns,
          onError,
          _state: state,
          _realDir: join(currentReal, entry.name),
        });
        continue;
      } else if (!entry.isFile()) {
        continue;
      }
      if (matchesIgnore(relativePath, false, compiledPatterns)) continue;

      // Config files like `_headers` and `nginx.conf` may lack a recognized extension.
      const ext = extname(entry.name).toLowerCase();
      const named = SPECIAL_FILE_NAMES.has(entry.name);
      if (!named && ext && !extensions.includes(ext)) continue;
      if (!named && !ext) continue;
      let contents;
      try {
        contents = await readFile(readPath, 'utf8');
      } catch (error) {
        onError({
          code: 'FILE_READ_FAILED',
          path: relativePath,
          message: `Could not read file: ${messageOf(error)}`,
        });
        continue;
      }
      yield { file: relativePath, absFile: full, contents, ext: named ? ext || '' : ext };
    }
  } finally {
    state.activeDirectories.delete(currentReal);
  }
}

export { DEFAULT_EXTENSIONS, IGNORE_DIRS };
