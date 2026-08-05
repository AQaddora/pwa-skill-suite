// Server-rendered templates and component formats that can contain HTML, CSS, or
// browser JavaScript but are not understood by the current static rules. The walker
// still reads them so their presence can downgrade a would-be PASS to UNVERIFIED.
//
// Keep this list conservative: failing to recognize a web source format is more
// dangerous than explicitly leaving a rule unverified.
export const UNSUPPORTED_WEB_SOURCE_EXTENSIONS = new Set([
  '.astro',
  '.mdx',
  '.php',
  '.erb',
  '.ejs',
  '.liquid',
  '.hbs',
  '.handlebars',
  '.pug',
  '.jade',
  '.razor',
  '.cshtml',
  '.twig',
  '.njk',
  '.mustache',
]);

export function isUnsupportedWebSource({ ext }) {
  return UNSUPPORTED_WEB_SOURCE_EXTENSIONS.has(ext);
}

// Kept as a data list so support for generated-code integrations can be extended
// without rewriting surface-detection control flow. Package names cover common
// framework adapters; call/import shapes cover configuration without package.json.
export const SERVICE_WORKER_PLUGIN_PATTERNS = [
  /vite-plugin-pwa/i,
  /@vite-pwa\/(?:nuxt|sveltekit|astro)/i,
  /gatsby-plugin-offline/i,
  /(?:@ducanh2912\/)?next-pwa/i,
  /next-offline/i,
  /@serwist\/next|\bserwist\b/i,
  /workbox-(?:webpack-plugin|build|window|cli)/i,
  /@angular\/service-worker/i,
  /@nuxtjs\/pwa/i,
  /@vue\/cli-plugin-pwa|vue-cli-plugin-pwa/i,
  /@remix-pwa\/(?:dev|sw)/i,
  /cra-template-pwa/i,
  /virtual:pwa-register/i,
  /\bVitePWA\s*\(/i,
  /\b(?:GenerateSW|InjectManifest)\s*\(/i,
];

// These integrations can generate or inject worker/registration code that is
// absent from the repository source tree. Their presence proves the SW surface
// exists while making source-only worker-rule coverage incomplete.
export function isServiceWorkerPluginSurface({ contents = '' }) {
  return SERVICE_WORKER_PLUGIN_PATTERNS.some((pattern) => pattern.test(contents));
}
