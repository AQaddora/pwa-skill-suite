// P-502 · Cache-first strategy on HTML/navigation requests.
// Advisory (classifying fetch strategy from source is heuristic): in a service worker,
// if the navigation branch resolves `caches.match` before attempting `fetch`, a stale
// app shell can be served indefinitely. Fires when the nav branch is cache-first.
import { lineColAt } from '../lib/loc.mjs';

export const ids = ['P-502'];

const isServiceWorker = (file, contents) =>
  /(?:^|\/)(?:sw|service-worker)\.[jt]s$/i.test(file) ||
  /(?:^|\/)[^/]*worker[^/]*\.[jt]s$/i.test(file) ||
  /addEventListener\(\s*['"]fetch['"]/.test(contents);

export function check({ file, contents, ext }) {
  if (!['.js', '.ts', '.mjs', '.cjs'].includes(ext)) return [];
  if (!isServiceWorker(file, contents)) return [];
  if (!/addEventListener\(\s*['"]fetch['"]/.test(contents)) return [];

  // Locate a navigation check; only reason about that branch onward.
  const navMatch =
    /request\.mode\s*===?\s*['"]navigate['"]/.exec(contents) ||
    /request\.destination\s*===?\s*['"]document['"]/.exec(contents);
  if (!navMatch) return [];

  const branch = contents.slice(navMatch.index);
  const cacheIdx = branch.search(/caches\.match\s*\(/);
  const fetchIdx = branch.search(/\bfetch\s*\(/);
  if (cacheIdx === -1) return [];
  // Cache-first when caches.match resolves before any fetch in the nav branch.
  if (fetchIdx !== -1 && fetchIdx < cacheIdx) return [];

  const absIdx = navMatch.index + cacheIdx;
  const { line, column } = lineColAt(contents, absIdx);
  return [
    {
      id: 'P-502',
      file,
      line,
      column,
      excerpt: 'navigation request served cache-first (caches.match before fetch)',
      severity: 'P0',
      confidence: 'advisory',
    },
  ];
}
