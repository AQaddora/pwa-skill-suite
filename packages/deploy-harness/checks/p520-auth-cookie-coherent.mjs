// P-520 — Auth cookie shape changed; existing clients wedge. Authenticate on A, deploy B
// (whose cookie shape differs), then load B and assert the client reaches a *coherent* state:
// still authed, or cleanly signed out. Never wedged (authState() must return one of exactly
// those two answers, not throw / hang / return something in between).
import { makeFinding } from '../lib/finding.mjs';
import { aggregate } from '../lib/outcome.mjs';

export default {
  ids: ['P-520'],
  name: 'A cookie-shape change resolves to a coherent auth state, never wedged',
  async run({ proxy, browser, buildADir, buildBDir }) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      proxy.swapTo(buildADir);
      await page.goto(proxy.url + '/', { waitUntil: 'load' });
      await page.evaluate(() => window.app.signIn('alice'));
      const authedOnA = await page.evaluate(() => window.app.authState());

      proxy.swapTo(buildBDir);
      await page.reload({ waitUntil: 'load' });

      const findings = [];
      if (authedOnA !== 'authed') {
        return aggregate({ resolved: false, detail: 'could not seed an authenticated session on build A — cannot exercise the cookie-shape migration' });
      }

      let state;
      let threw = null;
      try {
        state = await page.evaluate(() => window.app.authState());
      } catch (e) {
        threw = e?.message || String(e);
      }

      if (threw || (state !== 'authed' && state !== 'signed-out')) {
        findings.push(
          makeFinding('P-520', {
            context: '/',
            selector: '(auth state)',
            detail: threw
              ? `reading auth state after the cookie-shape change threw: ${threw}`
              : `auth state after the cookie-shape change was "${state}" — neither authed nor cleanly signed out (wedged)`,
          }),
        );
      }
      return aggregate({ findings, detail: `authenticated on A, deployed B with a changed cookie shape; resolved auth state: ${threw ? 'threw' : state}` });
    } finally {
      await context.close();
    }
  },
};
