// File-tree walker. Yields { file, contents, ext } for each file with a matching
// extension, skipping dependency/build directories.
import { readdir, readFile } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.svelte-kit',
  '.nuxt',
  'coverage',
  '.cache',
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
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.json',
  '.toml',
  '.conf',
];

export async function* walkFiles(rootDir, { extensions = DEFAULT_EXTENSIONS, base = rootDir } = {}) {
  let entries;
  try {
    entries = await readdir(rootDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      yield* walkFiles(full, { extensions, base });
      continue;
    }
    if (!entry.isFile()) continue;
    // Config files like `_headers` and `nginx.conf` may lack a recognized extension.
    const ext = extname(entry.name).toLowerCase();
    const named = entry.name === '_headers' || entry.name === 'nginx.conf';
    if (!named && ext && !extensions.includes(ext)) continue;
    if (!named && !ext) continue;
    let contents;
    try {
      contents = await readFile(full, 'utf8');
    } catch {
      continue;
    }
    yield { file: relative(base, full), absFile: full, contents, ext: named ? ext || '' : ext };
  }
}

export { DEFAULT_EXTENSIONS, IGNORE_DIRS };
