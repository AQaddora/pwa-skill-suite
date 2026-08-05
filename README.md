# pwa-skill-suite

When an AI coding agent turns an existing web app into a mobile PWA, it reliably makes the
same mistakes — and this suite catalogs **177** of them, then scans your source for the ones
a machine can actually prove.

It is a set of portable Agent Skills built on a machine-readable catalog of failure modes an
agent introduces during PWA conversion: iOS/WebKit quirks, the service-worker update path,
manifest and icon traps, RTL, accessibility regressions, and the version-skew bugs that only
bite users who already had the old build installed.

## The findings are the product

The suite's first act on a codebase is a **read-only audit**. Here is abbreviated real output from
`pwa-audit` run against a deliberately broken fixture app — no configuration, no browser:

```
# PWA audit report

**Summary:** 33 P0 · 6 P1 · 6 P2 · 18 advisory

**What this scan could NOT see** (static analysis has hard limits):
- CSS-in-JS (styled-components, Emotion, vanilla-extract)
- Theme objects (MUI sx/theme, Chakra tokens)
- Shadow DOM
- Computed styles & the rendered DOM (a Phase-2 runtime concern)
A clean report is not proof of correctness for an app that relies on the above.

## P0 — critical

### P-113 · `position: sticky` silently dies
**1 root cause → 2 instances**
- Symptom: Locking body overflow kills sticky headers, deadens mobile scroll, and makes
  dropdowns unreachable — three "unrelated" bugs from one line.
- Fix: Gate every scroll lock behind matchMedia('(min-width: 768px)'), or use the
  fixed-body + scroll-restore pattern. Never unconditional.
  - p113-body-scroll-lock/lock.js:3  — document.body.style.overflow = 'hidden';
  - p113-body-scroll-lock/Modal.tsx:4 — document.documentElement.style.overflow = 'hidden';

### P-701 · Pinch-zoom disabled
**1 root cause → 12 instances**
- Symptom: WCAG 1.4.4 failure. iOS 10+ ignores it in Safari anyway, so it fails and
  doesn't work.
- Fix: Fix input zoom with 16px fonts (P-101). Leave pinch zoom enabled. This is a FAIL,
  never a suggestion.
  - p701-user-scalable/index.html:4 — content="... user-scalable=no"
```

Findings are **grouped by root cause** ("1 root cause → N instances"), so one codemod
resolves a whole group, and each carries its catalog ID, symptom, fix, and up to five
`file:line` locations. Reproduce it yourself: `node skills/pwa-audit/scripts/run-audit.mjs
packages/scanner/fixtures/bad`.

## Honest coverage

Every number below comes from `node packages/catalog/stats.mjs` — the authoritative,
generated coverage report. CI runs that command on every push and publishes its output, so
any drift between this summary and the catalog is caught in review rather than shipped:

```
Total entries: 177

By severity:  P0 = 40   P1 = 101   P2 = 36

By section:
  ios-webkit      26     manifest        17     service-worker  22
  app-shell       11     responsive      10     version-skew    12
  performance     11     accessibility   12     rtl              8
  forms            8     theming          6     build-deploy     6
  identity-auth    4     in-app-browser   3     permissions       3
  media            3     lifecycle        4     observability     1
  meta            10     (plus cross-area additions shown by stats.mjs)

Scanner implementation coverage:
  rules   26 / 177  (15%)
  probes  36 / 177  (20%)

Device-only (cannot be verified in CI/emulation): 11 (6% of total)
```

**The device-only entries are the project's central trust claim.** Playwright's WebKit is
not iOS Safari — it does not run the iOS input-zoom heuristic, the URL-bar viewport collapse,
the home-screen icon pipeline, or ITP storage eviction. Those entries can **never** be proven
green in CI, so the suite refuses to mark them `PASS`. Most tools quietly report them as
passing; this one reports them as `UNVERIFIED` and tells you to check on a real device.

## Five outcomes, not three

The report grades every applicable entry as one of five outcomes (see
`packages/report/outcomes.mjs` for the exact derivation):

| Outcome | Meaning |
|---|---|
| **PASS** | A rule ran and found nothing — genuine evidence, only ever given when a rule actually exists. |
| **FAIL** | A rule ran and found a violation. Actionable now. |
| **UNVERIFIED** | Cannot be proven here — either **device-only** (Playwright WebKit ≠ iOS Safari), or not yet implemented as a rule. Never counted as passing. |
| **N/A** | The app has no such surface yet (no forms, no service worker). Auditing a pre-conversion app does **not** FAIL every SW entry. |
| **BLOCKED** | The scan itself could not run. |

The distinction that matters: a pre-conversion app is not "failing" — its service-worker
entries come back `N/A`, and its device-only entries `UNVERIFIED`, not a wall of red.
`COMPLETE` is the scanner's execution status, not a readiness verdict; only `pwa-verify`
acts as the automated completion gate, and its listed `UNVERIFIED` scopes still limit claims.

## Quick start

Requires Node.js 20 or newer.

```bash
# 1. Install into Claude (default), Codex, or an explicit skills directory
bash install.sh --dry-run
bash install.sh --target codex  # or: --target claude / --dest /path/to/skills

# Optional once per installed runtime: enable browser-based verification
# (install.sh prints these commands with your exact destination path)
npm ci --prefix /path/to/skills/.pwa-skill-suite
npx --prefix /path/to/skills/.pwa-skill-suite playwright install chromium webkit

# 2. Audit any existing app (read-only — changes nothing).
# Use the exact skills destination printed by install.sh; it need not be in the app repo.
node "/path/to/skills/pwa-audit/scripts/run-audit.mjs" "/path/to/your/app"
node "/path/to/skills/pwa-audit/scripts/run-audit.mjs" "/path/to/your/app" --json

# 3. Read the report. Fix the P0 groups first, then P1.
```

Then invoke the fix skills for the areas the report flags (`pwa-shell`, `pwa-native-feel`,
`pwa-manifest`, `pwa-offline`, `pwa-responsive`, `pwa-rtl`, `pwa-a11y`), or run the
`pwa-convert` orchestrator to sequence the whole conversion — it audits first and presents
findings before proposing any change.

## The skills

| skill | what it does |
|---|---|
| `pwa-audit` | **Read-only** diagnosis. The entry point. Changes nothing. |
| `pwa-convert` | Orchestrator: audit → plan → per-area skills → verify. |
| `pwa-shell` | Persistent shell, tab bar, sidebar→drawer, scroll restoration, back handling, overlay stacking. |
| `pwa-native-feel` | iOS/WebKit hardening + the mobile keyboard: dvh, safe areas, overscroll, tap highlight, hover-gating, input zoom, inputmode. |
| `pwa-manifest` | Manifest, icon generation **and verification**, theming, splash, install flow on both platforms. |
| `pwa-offline` | Service-worker strategy, the update flow, chunk-error recovery, cache versioning, version skew, CDN/deploy headers. |
| `pwa-responsive` | Overflow hunting, the breakpoint sweep, touch targets, CLS, first-load weight. |
| `pwa-rtl` | Logical properties, bidi isolation, mirrored icons, Arabic-capable fonts. |
| `pwa-a11y` | Stops "app feel" from becoming an accessibility regression. |
| `pwa-verify` | The verifier: generates and runs the runtime test pack, including the deploy A→B harness. The gate for done-claims. |
| `pwa-auth-state` | Installed/browser auth boundaries, in-app browsers, cart/state merge, schema migration, logout/account-switch privacy. |
| `pwa-push-permissions` | Web Push, notification delivery/clicks, consent and denied recovery, token/subscription lifecycle, other permission-gated capabilities. |
| `pwa-runtime-resilience` | Background/resume, realtime reconnect, offline mutation outbox, media cleanup, error boundaries and telemetry. |

`pwa-convert/references/catalog-ownership.json` assigns every catalog section one primary
skill. The map is installed with the orchestrator, and CI rejects a new section with no
owner, no affirmative orchestrator route, or no corresponding lesson in the owner skill.

### Three corrections the suite is opinionated about

1. **"Disable zoom."** Correct for double-tap zoom (`touch-action: manipulation`, P-110) and
   input-focus zoom (16px fonts, P-101) — both enforced. **Wrong for pinch zoom:**
   viewport caps, root `touch-action`, and JavaScript gesture/multi-touch cancellation are
   WCAG 1.4.4 failures. The suite refuses to emit them and **fails** on sight (P-701).
2. **"Disable text selection."** Correct for chrome (tab bars, buttons, headers). Applied
   globally it breaks copy and degrades assistive tooling. The suite enforces the
   chrome/content split (P-111, P-702).
3. **"Make every link stop showing a native preview."** Suppress touch callouts only on
   intentional app chrome. Applying `-webkit-touch-callout: none` to every anchor removes
   useful preview/copy/save behavior from content and is flagged (P-112). Missing
   suppression on intentional chrome remains a real-device check (P-126), never a guessed
   static PASS.

## Repository-agnostic by design

The catalog and skills never assume one framework, router, locale, authentication provider,
or host. Static rules inspect common web source shapes; runtime probes use semantic
`data-pwa-role` annotations or declarative `pwa-probes.config.json` selectors/scenarios.
Unsupported or unconfigured checks are `UNVERIFIED` or `BLOCKED`, never guessed green.

Unambiguous dependency/framework caches are excluded from a source scan. Ambiguous directory
names such as `build`, `dist`, and `out` are **not** silently pruned: real repositories use
those names for authored source, and hiding them could create a false PASS. Add confirmed
generated copies to `.pwa-auditignore` (for example `dist/`) to avoid duplicate findings, or
audit a built artifact by passing that output directory as the target root. Do not encode
project names in the suite.

## Standalone vs superpowers

Every skill **works standalone** — its guidance is self-contained and it never hard-fails on
a missing plugin. When the [`superpowers`](https://github.com/obra/superpowers) plugin is
available in the session, the skills use it — detected **by capability** (is the skill
invocable right now?), never by sniffing plugin paths, so the integration survives
plugin-layout changes:

- `test-driven-development` — each catalog entry's probe **is** the failing test: write the
  probe, watch it fail, apply the fix, watch it pass.
- `verification-before-completion` — the hard done-gate: no completion claim without a green
  `pwa-verify` report.
- `writing-plans` / `executing-plans`, `requesting-code-review`, `finishing-a-development-branch`
  for multi-area conversions.

## Contributing — one failure mode at a time

The whole contribution model is: **a new failure mode = a catalog entry + a rule and/or
probe.** A stranger can add one in a single sitting:

1. **Add the entry.** Append an object to `packages/catalog/catalog.json` with a new `P-###`
   id, `section`, `severity` (P0/P1/P2), `symptom`, `correct`, and the `detect` channels.
   Run `node packages/catalog/validate.mjs` to check it against the schema.
2. **Regenerate the docs.** `node packages/catalog/generate-md.mjs` rewrites
   `docs/catalog.md` from the JSON — never hand-edit that file; CI fails if it drifts.
3. **Implement detection (optional but encouraged).** Add a static rule under
   `packages/scanner/rules/` with a `bad`/`good` fixture pair (a rule without both is not
   merged), point the entry's `rule` field at it, and add a runtime `probe` where the
   concern needs a browser.
4. **Cite it in the relevant skill.** Every rule a skill enforces must reference its catalog
   id; `node skills/lint-skills.mjs` fails if a skill cites an id the catalog doesn't define.
5. `npm test` and the coverage CI must stay green.

## Scope — what this is not

- **Not a component library.** It changes no components; it tells you what's wrong and how to fix it.
- **Not a framework.** Framework-agnostic — it parses CSS/SCSS, Tailwind class strings,
  JSX/TSX/Vue/Svelte templates, and the manifest. When a single-file component surface
  is only partially understood (for example embedded/preprocessed styles), affected rules
  report `UNVERIFIED` instead of claiming a clean pass.
- **Not a deployment mutator.** It may verify a configured built/deployed artifact, but it
  never promotes, rolls back, or changes infrastructure.
- **Not a substitute for a real device.** Static analysis and CI WebKit have hard limits the
  report states plainly (see the device-only entries). It makes those limits legible; it
  does not pretend they don't exist.

## License

[MIT](./LICENSE).
