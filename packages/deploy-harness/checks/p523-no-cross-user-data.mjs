// P-523 — Cached data survives logout / account switch. This is a privacy assertion: sign in
// as alice on A, deploy B, sign out, sign in as bob — and assert no alice-scoped data is
// reachable anywhere (cookies, localStorage, IndexedDB, Cache Storage). A failure here is
// treated as the most severe finding this harness can produce.
import { makeFinding } from '../lib/finding.mjs';
import { aggregate } from '../lib/outcome.mjs';

export default {
  ids: ['P-523'],
  name: 'No cross-user data survives a logout / account switch across a deploy',
  async run({ proxy, browser, buildADir, buildBDir }) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      proxy.swapTo(buildADir);
      await page.goto(proxy.url + '/', { waitUntil: 'load' });
      await page.evaluate(() => window.app.signIn('alice'));

      proxy.swapTo(buildBDir);
      await page.reload({ waitUntil: 'load' });
      await page.evaluate(() => window.app.signOut());
      await page.evaluate(() => window.app.signIn('bob'));

      const snapshot = await page.evaluate(async () => ({
        cookie: document.cookie,
        ls: window.app.lsKeys(),
        idb: await window.app.idbKeys(),
        cache: await window.app.cacheKeys(),
      }));

      const leaks = [];
      if (/alice/i.test(snapshot.cookie)) leaks.push(`cookie: ${snapshot.cookie}`);
      const lsLeak = snapshot.ls.filter((k) => /alice/i.test(k));
      if (lsLeak.length) leaks.push(`localStorage keys: ${lsLeak.join(', ')}`);
      const idbLeak = snapshot.idb.filter((v) => JSON.stringify(v).toLowerCase().includes('alice'));
      if (idbLeak.length) leaks.push(`IndexedDB entries: ${JSON.stringify(idbLeak)}`);
      const cacheLeak = snapshot.cache.filter((u) => /alice/i.test(u));
      if (cacheLeak.length) leaks.push(`Cache Storage entries: ${cacheLeak.join(', ')}`);

      const findings = leaks.length
        ? [
            makeFinding('P-523', {
              context: '/',
              selector: '(cross-user storage audit)',
              detail: `alice-scoped data survived after switching to bob: ${leaks.join('; ')} — privacy incident`,
            }),
          ]
        : [];
      return aggregate({ findings, detail: 'signed in as alice on A, deployed B, signed out, signed in as bob; audited every user-scoped store' });
    } finally {
      await context.close();
    }
  },
};
