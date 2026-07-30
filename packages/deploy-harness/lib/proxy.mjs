// The single-origin swap proxy — the load-bearing realism of the deploy harness.
//
// Service worker registration is origin-scoped, so build A and build B MUST be served through
// ONE origin (one host:port) whose backing directory is swapped underneath a live client. Two
// ports would be two origins and would invalidate the entire test. This proxy serves files
// from a current directory and `swapTo(dirB)` repoints it; A's content-hashed chunks are then
// absent from B and 404 automatically — exactly the real "old chunk deleted on deploy" case.
//
// Cache-Control defaults model a correct origin: content-hashed assets are immutable/long,
// while sw.js / manifest / HTML are revalidated. A build can override headers via a
// `.headers.json` map to simulate a misconfigured origin (P-514).
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

// A content hash looks like `.deadbeef.` / `.a1b2c3.` in the filename.
const HASHED = /\.[0-9a-f]{6,}\.[a-z]+$/i;
const NEVER_LONG_CACHE = new Set(['sw.js', 'manifest.webmanifest', 'manifest.json', 'index.html']);

function contentType(file) {
  return TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

function defaultCacheControl(rel) {
  const base = rel.split('/').pop();
  if (NEVER_LONG_CACHE.has(base) || rel.endsWith('.html')) return 'no-cache';
  if (HASHED.test(base)) return 'public, max-age=31536000, immutable';
  return 'no-cache';
}

function loadHeaders(dir) {
  const file = path.join(dir, '.headers.json');
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * @param {string} initialDir
 * @returns {Promise<{ url:string, port:number, swapTo:(dir:string)=>void, currentDir:()=>string, close:()=>Promise<void> }>}
 */
export function createSwapProxy(initialDir) {
  let dir = initialDir;
  let headerOverrides = loadHeaders(dir);

  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
    const target = path.join(dir, rel);
    if (!target.startsWith(path.resolve(dir)) || rel === '.headers.json') {
      res.writeHead(403).end('forbidden');
      return;
    }
    if (!existsSync(target)) {
      res.writeHead(404, { 'content-type': 'text/plain', 'cache-control': 'no-cache' }).end('not found');
      return;
    }
    const override = headerOverrides['/' + rel] || headerOverrides[urlPath] || {};
    const cacheControl = override['cache-control'] || defaultCacheControl(rel);
    const headers = { 'content-type': contentType(target), 'cache-control': cacheControl, ...override };
    res.writeHead(200, headers).end(readFileSync(target));
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        port,
        swapTo(newDir) {
          dir = newDir;
          headerOverrides = loadHeaders(newDir);
        },
        currentDir: () => dir,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}
