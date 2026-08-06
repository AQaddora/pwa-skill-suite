// Audit policy: which catalog entries are a deliberate product decision rather than a
// defect, given the surface being audited.
//
// THE RULE THIS FILE MUST NOT BREAK: an exempt entry becomes N/A **with a stated reason
// that is rendered in the report**, and its findings are still counted and listed under
// "policy-exempt". Suppression is never silence. A reader must always be able to see what
// was waived, why, and how to un-waive it — otherwise this file would be manufacturing
// exactly the false PASS that packages/report/outcomes.mjs exists to prevent.

/**
 * `app`      — the target is an installed, standalone PWA whose shell is meant to behave
 *              like a native application. Zoom-gesture entries are waived here.
 * `document` — the target is a website/document surface. Nothing is waived; WCAG applies
 *              in full. This is the correct policy for anything reachable in a browser tab.
 */
export const POLICIES = ['app', 'document'];
// Strict by default. A library caller that says nothing waives nothing — a tool must not
// silently set aside a WCAG P0 because of an implicit default. The audit CLI opts into
// `app` explicitly and always prints the waiver it applied.
export const DEFAULT_POLICY = 'document';

// Keyed by catalog id so the waiver set is data, not scattered conditionals.
const APP_EXEMPTIONS = {
  'P-701': {
    reason:
      'Pinch-zoom suppression is treated as an intentional product decision for a standalone app shell under the `app` policy.',
    caveat:
      'iOS Safari has ignored `user-scalable=no` since iOS 10, so this suppresses zoom on Android Chrome only. It remains a WCAG 1.4.4 failure on any surface reachable in a browser tab.',
  },
  'P-101': {
    reason:
      'iOS input-focus auto-zoom is waived under the `app` policy at the operator’s request.',
    caveat:
      'This one has a zero-cost fix: computed `font-size: 16px` on inputs stops the auto-zoom without touching accessibility, and it is unrelated to pinch-zoom. Waiving it keeps the zoom-in-on-focus lurch that makes an installed app read as a website.',
  },
};

const EXEMPTIONS_BY_POLICY = {
  app: APP_EXEMPTIONS,
  document: {},
};

export function normalizePolicy(value) {
  if (value == null || value === '') return DEFAULT_POLICY;
  const normalized = String(value).trim().toLowerCase();
  if (!POLICIES.includes(normalized)) {
    throw new Error(
      `unknown audit policy "${value}" — expected one of: ${POLICIES.join(', ')}`,
    );
  }
  return normalized;
}

/**
 * @returns {{reason: string, caveat: string}|null} the waiver for this id, or null.
 */
export function exemptionFor(id, policy = DEFAULT_POLICY) {
  const table = EXEMPTIONS_BY_POLICY[normalizePolicy(policy)] || {};
  return table[id] || null;
}

export function exemptIds(policy = DEFAULT_POLICY) {
  return Object.keys(EXEMPTIONS_BY_POLICY[normalizePolicy(policy)] || {}).sort();
}
