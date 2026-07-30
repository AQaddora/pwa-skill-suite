// P-514 · Long cache TTL on sw.js / manifest via server config.
// Advisory: static source can't see deployed headers, so this scopes to recognizable
// config files (_headers, netlify.toml, vercel.json, nginx.conf) and flags a
// Cache-Control max-age > 3600 applied to a path matching sw.js / manifest.json — which
// pins the very files that must update to ship a new version.
export const ids = ['P-514'];

const CONFIG_NAMES = /(?:^|\/)(?:_headers|netlify\.toml|vercel\.json|nginx\.conf)$/i;
const CRITICAL_PATH = /sw\.js|service-worker\.js|manifest\.(?:json|webmanifest)/i;
const MAX_AGE = /max-age\s*[=:]\s*(\d+)/i;

export function check({ file, contents }) {
  if (!CONFIG_NAMES.test(file)) return [];

  const lines = contents.split('\n');
  const out = [];
  let pathContext = '';
  let contextIsCritical = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // A path/location line sets context (e.g. "/sw.js" in _headers, "location /sw.js" in nginx).
    const pathMatch = line.match(/^\s*(?:location\s+)?(\/\S+)/);
    if (pathMatch && !/cache-control/i.test(line)) {
      pathContext = pathMatch[1];
      contextIsCritical = CRITICAL_PATH.test(pathContext);
    }
    const isCritical = CRITICAL_PATH.test(line) || contextIsCritical;
    if (!isCritical) continue;
    const m = MAX_AGE.exec(line);
    if (m && Number(m[1]) > 3600) {
      out.push({
        id: 'P-514',
        file,
        line: i + 1,
        column: 1,
        excerpt: `${pathContext || 'path'} → ${line.trim()}`,
        severity: 'P0',
        confidence: 'advisory',
      });
    }
  }
  return out;
}
