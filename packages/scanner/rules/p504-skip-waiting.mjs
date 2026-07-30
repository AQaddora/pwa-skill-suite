// P-504 · skipWaiting() in install without reload coordination.
// Calling skipWaiting() unconditionally in the install handler swaps the active worker
// mid-session; without a controllerchange listener to coordinate a reload, the page can
// end up talking to a new worker with stale in-memory state. Flags skipWaiting() reached
// from the install handler when the file has no controllerchange listener anywhere.
import { lineColAt } from '../lib/loc.mjs';

export const ids = ['P-504'];

export function check({ file, contents, ext }) {
  if (!['.js', '.ts', '.mjs', '.cjs'].includes(ext)) return [];

  const install = /addEventListener\(\s*['"]install['"]/.exec(contents);
  if (!install) return [];

  // Take the install handler body: from the listener to the next addEventListener or EOF.
  const rest = contents.slice(install.index + install[0].length);
  const nextListener = rest.search(/addEventListener\s*\(/);
  const body = nextListener === -1 ? rest : rest.slice(0, nextListener);

  const skip = /skipWaiting\s*\(/.exec(body);
  if (!skip) return [];
  if (/controllerchange/.test(contents)) return [];

  const absIdx = install.index + install[0].length + skip.index;
  const { line, column } = lineColAt(contents, absIdx);
  return [
    {
      id: 'P-504',
      file,
      line,
      column,
      excerpt: 'skipWaiting() in install with no controllerchange reload coordination',
      severity: 'P0',
      confidence: 'high',
    },
  ];
}
