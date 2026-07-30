// A minimal static file server for serving probe fixtures (and any `source-dir` target)
// through a single real origin. SPA fallback: a route with no file extension that doesn't
// map to a file is served index.html, so client-side routing fixtures work.

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function contentType(file) {
  return TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

async function tryRead(file) {
  try {
    const s = await stat(file);
    if (s.isFile()) return await readFile(file);
  } catch {
    /* not found */
  }
  return null;
}

/**
 * Serve `dir` over http on an ephemeral port.
 * @param {string} dir
 * @returns {Promise<{ url: string, port: number, close: () => Promise<void> }>}
 */
export function serveDir(dir) {
  const server = http.createServer(async (req, res) => {
    const rawPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const rel = rawPath === '/' ? 'index.html' : rawPath.replace(/^\/+/, '');
    const target = path.join(dir, rel);
    // Contain traversal to the served dir.
    if (!target.startsWith(path.resolve(dir))) {
      res.writeHead(403).end('forbidden');
      return;
    }

    let body = await tryRead(target);
    if (body == null && !path.extname(rel)) {
      body = await tryRead(path.join(dir, 'index.html')); // SPA fallback
      if (body != null) {
        res.writeHead(200, { 'content-type': TYPES['.html'] }).end(body);
        return;
      }
    }
    if (body == null) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': contentType(target) }).end(body);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        port,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}
