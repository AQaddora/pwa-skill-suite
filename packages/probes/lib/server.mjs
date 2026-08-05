// A minimal static file server for serving probe fixtures (and any `source-dir` target)
// through a single real origin. SPA fallback: a route with no file extension that doesn't
// map to a file is served index.html, so client-side routing fixtures work.

import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
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

const PRIVATE_BASENAMES = new Set([
  'bun.lock',
  'bun.lockb',
  'composer.lock',
  'package-lock.json',
  'package.json',
  'pnpm-lock.yaml',
  'pwa-probes.config.json',
  'pwa-probes.config.mjs',
  'yarn.lock',
]);
const SOURCE_OR_SECRET_EXTENSIONS = new Set([
  '.astro',
  '.env',
  '.erb',
  '.hbs',
  '.jsx',
  '.key',
  '.liquid',
  '.map',
  '.mdx',
  '.pem',
  '.php',
  '.pug',
  '.svelte',
  '.toml',
  '.ts',
  '.tsx',
  '.vue',
]);

function contentType(file) {
  return TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

function isContained(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
}

function isPrivateArtifactPath(relativePath) {
  const segments = relativePath.split(/[\\/]+/).filter(Boolean);
  if (segments.some((segment) => segment.startsWith('.') && segment !== '.well-known')) {
    return true;
  }
  const basename = (segments.at(-1) || '').toLowerCase();
  if (basename === '.env' || basename.startsWith('.env.')) return true;
  if (PRIVATE_BASENAMES.has(basename)) return true;
  if (
    /^(?:credentials?|secrets?|service-account|serviceaccountkey)(?:[._-].*)?\.json$/i.test(
      basename,
    ) ||
    /^firebase-adminsdk.*\.json$/i.test(basename) ||
    /(?:^|[-_.])private[-_.]?key(?:[-_.]|$)/i.test(basename)
  ) {
    return true;
  }
  if (/^(?:tsconfig|jsconfig)(?:\.[^.]+)?\.json$/i.test(basename)) return true;
  return SOURCE_OR_SECRET_EXTENSIONS.has(path.extname(basename));
}

async function tryRead(root, file, { allowExtensionless = false } = {}) {
  try {
    // realpath closes the symlink escape that lexical path checks cannot see.
    const resolved = await realpath(file);
    if (!isContained(root, resolved)) return { forbidden: true, body: null };
    // Apply the public-artifact policy to the canonical target too. Otherwise an
    // innocuous-looking alias such as `cred.js -> credentials.json` can bypass the
    // request-path checks while remaining lexically contained inside the artifact.
    if (isPrivateArtifactPath(path.relative(root, resolved))) {
      return { forbidden: true, body: null };
    }
    const s = await stat(resolved);
    if (s.isFile()) {
      if (!allowExtensionless && path.extname(resolved) === '') {
        return { forbidden: true, body: null };
      }
      return { forbidden: false, body: await readFile(resolved) };
    }
  } catch {
    /* not found */
  }
  return { forbidden: false, body: null };
}

/**
 * Serve `dir` over http on an ephemeral port.
 * @param {string} dir
 * @returns {Promise<{ url: string, port: number, close: () => Promise<void> }>}
 */
export async function serveDir(dir) {
  const root = await realpath(dir);
  const rootStat = await stat(root);
  if (!rootStat.isDirectory()) {
    throw new Error('probe server root must be a directory');
  }
  let entryDocument;
  try {
    entryDocument = await realpath(path.join(root, 'index.html'));
  } catch {
    throw new Error('probe server root must contain an index.html entry document');
  }
  if (
    !isContained(root, entryDocument) ||
    isPrivateArtifactPath(path.relative(root, entryDocument)) ||
    !(await stat(entryDocument)).isFile()
  ) {
    throw new Error('probe server index.html must be a regular file inside the artifact root');
  }
  const handleRequest = async (req, res) => {
    let rawPath;
    try {
      rawPath = decodeURIComponent((req.url || '/').split('?')[0]);
    } catch {
      res.writeHead(400, { 'content-type': 'text/plain' }).end('bad request');
      return;
    }
    if (rawPath.includes('\\') || rawPath.includes('\0')) {
      res.writeHead(400, { 'content-type': 'text/plain' }).end('bad request');
      return;
    }
    const rel = rawPath === '/' ? 'index.html' : rawPath.replace(/^\/+/, '');
    if (isPrivateArtifactPath(rel)) {
      res.writeHead(403, { 'content-type': 'text/plain' }).end('forbidden');
      return;
    }
    const target = path.resolve(root, rel);
    // Contain traversal to the served dir.
    if (!isContained(root, target)) {
      res.writeHead(403).end('forbidden');
      return;
    }

    let result = await tryRead(root, target, {
      allowExtensionless: rel === '.well-known/apple-app-site-association',
    });
    if (result.forbidden) {
      res.writeHead(403).end('forbidden');
      return;
    }
    let body = result.body;
    if (body == null && !path.extname(rel)) {
      result = await tryRead(root, entryDocument); // SPA fallback
      body = result.body;
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
  };

  const server = http.createServer((req, res) => {
    void handleRequest(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' });
      // Filesystem paths and read errors may themselves contain sensitive information.
      res.end('probe server error');
    });
  });

  return new Promise((resolve, reject) => {
    const onListenError = (error) => reject(error);
    server.once('error', onListenError);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onListenError);
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        port,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => (error ? closeReject(error) : closeResolve()));
          }),
      });
    });
  });
}
