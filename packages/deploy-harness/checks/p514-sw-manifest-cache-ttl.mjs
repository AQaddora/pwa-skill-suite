// P-514 — sw.js / manifest served with a long cache TTL. If the CDN pins the worker itself,
// users can never receive a fix. Checked directly against the proxy's response headers (the
// harness's single origin stands in for "the deployed origin" — this is a real HTTP response,
// not a source-dir static read, so PASS/FAIL here is meaningful, not laundered).
import { makeFinding } from '../lib/finding.mjs';
import { aggregate } from '../lib/outcome.mjs';

const LONG_CACHE = /immutable|max-age=(\d+)/i;

function isLongCached(cacheControl) {
  const m = LONG_CACHE.exec(cacheControl || '');
  if (!m) return false;
  if (/immutable/i.test(cacheControl)) return true;
  return Number(m[1]) >= 86400; // treat a day+ as "long" for this class of file
}

export default {
  ids: ['P-514'],
  name: 'sw.js / manifest are not served with a long cache TTL',
  async run({ proxy, buildADir }) {
    proxy.swapTo(buildADir);
    const targets = ['/sw.js', '/manifest.webmanifest'];
    const findings = [];
    for (const target of targets) {
      const res = await fetch(proxy.url + target);
      const cacheControl = res.headers.get('cache-control') || '';
      if (isLongCached(cacheControl)) {
        findings.push(
          makeFinding('P-514', {
            context: target,
            selector: target,
            detail: `served with cache-control: "${cacheControl}" — a long/immutable TTL on this file blocks users from ever receiving a fix`,
          }),
        );
      }
    }
    return aggregate({ findings, detail: 'checked cache-control on sw.js and the manifest against the deployed origin' });
  },
};
