// P-560 · `cache.addAll([...])` precache list contains a URL not present in the
// discoverable build output. `cache.addAll` is atomic — one 404 fails the whole
// `install` — but confirming a listed URL is actually missing depends on the build
// having run and its output directory being discoverable, hence `advisory`.
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { lineColAt } from '../lib/loc.mjs';

export const ids = ['P-560'];

const BUILD_DIR_NAMES = ['dist', 'build', 'public', 'out'];
const IGNORE_DIRS = new Set(['node_modules', '.git']);

function listFilesRecursive(dir, base = dir, acc = new Set()) {
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
      listFilesRecursive(full, base, acc);
    } else if (entry.isFile()) {
      acc.add('/' + path.relative(base, full).split(path.sep).join('/'));
    }
  }
  return acc;
}

function findBuildOutput(startDir) {
  let dir = startDir;
  for (let i = 0; i < 3; i++) {
    for (const name of BUILD_DIR_NAMES) {
      const candidate = path.join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function isServiceWorker(file, contents) {
  return (
    /(?:^|\/)(?:sw|service-worker)\.[jt]s$/i.test(file) ||
    /addEventListener\(\s*['"]install['"]/.test(contents)
  );
}

export function check({ file, contents, ext, absFile }) {
  if (!['.js', '.ts', '.mjs', '.cjs'].includes(ext)) return [];
  if (!isServiceWorker(file, contents)) return [];

  // `cache.addAll([...])` inline, or `cache.addAll(NAME)` where NAME was assigned an
  // array literal earlier in the file — both are common precache-manifest shapes.
  let addAllMatch = /cache(?:s)?\.addAll\s*\(\s*\[([\s\S]*?)\]\s*\)/.exec(contents);
  let listSource = addAllMatch ? addAllMatch[1] : null;

  if (!addAllMatch) {
    const varCall = /cache(?:s)?\.addAll\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/.exec(contents);
    if (!varCall) return [];
    const varDecl = new RegExp(`(?:const|let|var)\\s+${varCall[1]}\\s*=\\s*\\[([\\s\\S]*?)\\]`).exec(contents);
    if (!varDecl) return [];
    addAllMatch = varCall;
    listSource = varDecl[1];
  }

  const urls = [...listSource.matchAll(/['"`]([^'"`]+)['"`]/g)].map((m) => m[1]);
  if (urls.length === 0) return [];

  const buildDir = findBuildOutput(path.dirname(absFile));
  if (!buildDir) return [];
  const builtFiles = listFilesRecursive(buildDir);

  const out = [];
  for (const url of urls) {
    if (!url.startsWith('/')) continue;
    const normalized = url.split('?')[0];
    if (builtFiles.has(normalized)) continue;
    const { line, column } = lineColAt(contents, addAllMatch.index);
    out.push({
      id: 'P-560',
      file,
      line,
      column,
      excerpt: `precached "${url}" not found in build output`,
      severity: 'P0',
      confidence: 'advisory',
    });
  }
  return out;
}
