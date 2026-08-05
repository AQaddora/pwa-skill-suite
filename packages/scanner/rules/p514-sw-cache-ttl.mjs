// P-514 · Long cache TTL on sw.js / manifest via server config.
// Advisory: static source can't see deployed headers, so this scopes to recognizable
// config files (_headers, netlify.toml, vercel.json, nginx.conf) and flags a
// Cache-Control max-age > 3600 applied to a path matching sw.js / manifest.json — which
// pins the very files that must update to ship a new version.
export const ids = ['P-514'];

const CONFIG_NAMES = /(?:^|\/)(?:_headers|netlify\.toml|vercel\.json|nginx\.conf)$/i;
const POSSIBLE_HEADER_CONFIG_NAMES =
  /(?:^|\/)(?:firebase\.json|staticwebapp\.config\.json|wrangler\.(?:toml|json|jsonc)|app\.ya?ml|amplify\.ya?ml|render\.ya?ml|serverless\.ya?ml|cloudbuild\.ya?ml|fly\.toml|Caddyfile|\.htaccess|httpd\.conf|(?:next|nuxt|vite|astro|svelte|remix)\.config\.[cm]?[jt]s)$/i;
const CRITICAL_PATH = /sw\.js|service-worker\.js|manifest\.(?:json|webmanifest)/i;
const MAX_AGE = /max-age\s*[=:]\s*(\d+)/i;

export function appliesTo({ file }) {
  return CONFIG_NAMES.test(file);
}

// Unsupported application templates are not another location for response headers,
// but an unrecognized deployment/server config means a clean supported config cannot
// prove which header policy reaches production.
export function relevantTo({ file }) {
  return CONFIG_NAMES.test(file) || POSSIBLE_HEADER_CONFIG_NAMES.test(file);
}

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
