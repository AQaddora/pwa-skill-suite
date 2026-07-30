# Phase 2 — Progress

**Status:** shipped.
**Merged to `main`:** squash commit `0c1cf74ed3c3c6096fb2b14a5f511ff5591b29c7` (PR #4).
**Branch:** `feat/phase2-probes-harness-verify`.

## What shipped

The runtime half of the suite, on top of Phase 1's catalog/scanner/report. Path
ownership: `packages/probes`, `packages/deploy-harness`, `skills/pwa-verify`, and the
`probe` field of `catalog.json`. No sibling `rule` fields, no `README.md`/`.github/`
/`install.sh`/scanner rules or fixtures, no `skills/` other than `pwa-verify`.

### `packages/probes` — runtime probes

Playwright, ESM, no build step. Device matrix (320/360/390/430/768/1024 ×
portrait/landscape × webkit/chromium, plus a standalone `display-mode` context and an
RTL pass). Implements P-301 (overflow, names the culprit selector), P-308 (touch
targets < 44px), P-201/P-202 (tab bar fixed / content not buried), P-203 (shell node
identity across navigation), P-204 (per-tab scroll restoration), P-207 (overlay above
the tab bar), P-208 (history-back closes overlay), P-115 (back affordance in
standalone), P-509 (offline fallback), P-703/P-704/P-705/P-706/P-711 (a11y set), P-101
(input font-size; iOS zoom itself is device-only). 23 probe fields wired into
`catalog.json`.

Ships the `pwa-probes.config.mjs` targeting contract (routes, auth, baseURL/target,
selector overrides, `data-pwa-role` DOM annotations) so probes can resolve "the tab
bar", "the routes to walk", an authenticated state — a probe that can't resolve its
target reports `BLOCKED`, never `PASS`. Ships the device-only honesty module: 10
catalog entries flagged `deviceOnly: true` always report `UNVERIFIED (device-only)`
with real-device reproduction steps; P-101 is the partial case (font-size checked =
PASS/FAIL, zoom itself stays UNVERIFIED even on a clean run).

### `packages/deploy-harness` — the A→B deploy-swap harness

A single HTTP proxy (`lib/proxy.mjs`) serves one origin whose backing directory swaps
underneath a live client — not two ports, since SW registration is origin-scoped and
two ports would silently invalidate the whole test. Bundled `build-a`/`build-b`/
`build-b-breaking` fixtures differ in content hash, cookie shape, storage schema, and
build id. 11 checks: stale-code cluster (P-502 no stale HTML, P-505 chunk-deleted
recovery without a reload loop, P-503 update surfaced within a bounded wait, P-504
`skipWaiting` never swaps assets under a live tab uncontrolled, P-514 sw.js/manifest
not long-TTL-cached) and version-skew cluster (P-520 auth-cookie-shape change resolves
coherently, P-522 old shell + new API handled gracefully, **P-523** no cross-user data
survives a logout/switch — the most severe finding class this harness can produce,
P-525 storage-schema migrates on boot, P-528 SW/shell build-id convergence, P-531 a
breaking change forces an update). Every check reports `BLOCKED`, not `PASS`, when it
can't seed the state it needs.

**Documented scope limit** (`packages/deploy-harness/README.md`): runs its own bundled
fixture pair only — not yet wired to swap an arbitrary project's real build output (SSR
apps have no static output to swap; the skew checks need a seeding contract not built
this sprint). The narrower, honest version, not a harness that appears to pass.

### `skills/pwa-verify` — the done-gate

Runs the static scanner + probes + harness together through the shared
`packages/report` renderer. Exits non-zero on any `FAIL`/`BLOCKED`; `UNVERIFIED`
(device-only) never gates but always renders an explicit "verify on a real device"
block.

## Verification (fresh, this session, exit 0)

```
npm test                                          -> 176/176 pass
node packages/catalog/validate.mjs                -> 176 entries, all valid
node packages/catalog/stats.mjs                    -> probes 36/176 (20%), rules 25/176 (14%), device-only 10 (6%)
node packages/catalog/generate-md.mjs --check      -> docs/catalog.md up to date
node skills/lint-skills.mjs                        -> 10/10 skills OK
bash install.sh --dry-run                          -> 10 skills would install
npm run harness                                    -> 11/11 assertions PASS
```

Real-app proof: `skills/pwa-verify` run fresh against `~/work/interact-land42/apps/
dashboard` (a real Next.js 14 app-router codebase, dev server, a dummy local-only
`AUTH_SECRET`, no real secrets read or used) — exit code 1, correctly gates, 25 P0 / 3
P1 findings plus the full `UNVERIFIED (device-only)` block. Temp config/env files
removed afterward; `git status` confirmed clean in that repo.

## Self-review

Two independent code-reviewer subagent rounds (`superpowers:requesting-code-review`),
one per session this branch was worked in:

- **Round 1:** found a **Critical** bug — `run-verify.mjs`'s gate partly relied on
  `buildReport`'s P0/P1/P2 summary, which excludes any finding whose catalog
  `confidence` is `'advisory'` (true for 9 of the 11 harness ids, including P-523). A
  real cross-user data leak would have exited 0. Fixed by gating directly on the
  harness's own outcome-derived `anyFailures()`, verified by deliberately breaking
  `build-b`'s `signOut()` to leak data and confirming the gate then exits 1. Also
  fixed: P-514's ambient proxy-state dependency, and five checks' unbounded
  `serviceWorker.ready` waits (now bounded, reporting `BLOCKED` on timeout).
- **Round 2** (this session, commit `6e68f4e`): found an **Important** issue —
  `elementSweep` (the driver behind P-101/P-301/P-308/P-703/P-704) never checked
  whether `page.goto()` actually succeeded, so a misconfigured or 404ing route would
  evaluate an error page's empty DOM and report a false `PASS` — the same honesty
  failure this project exists to prevent, just left open for route resolution where it
  was already closed for role resolution. Fixed: `harness.openPage` now surfaces
  navigation success; `elementSweep` downgrades to `BLOCKED` (never `PASS`) when a
  swept route failed to load. Proved with a red→green regression test.

## Known gap, not fixed here (out of path ownership)

`.github/workflows/ci.yml`'s `coverage` job fails on this branch:
`Cannot find package 'playwright'`. The workflow (owned by Phase 3) never runs
`npm ci`/`npm install` before `npm test` — invisible through Phase 1/3/4 since none of
that code imports an npm package, but `packages/probes`/`packages/deploy-harness` now
do. No branch protection requires this check, so it did not block merging, and fixing
it would mean editing a file explicitly outside this PR's path ownership. Flagged for
whoever owns `.github/` next: the fix is a one-line `npm ci` step before "Run the test
suite".

## Rebase note

`gh/main` (Phase 1 + Phase 3 + Phase 4) was already an ancestor of this branch's `HEAD`
by the time this session resumed — a prior session's rebase had already landed
cleanly, including a real fix for a coverage gap Phase 4's two new `deviceOnly: true`
catalog entries (P-540, P-551) exposed in the hardcoded device-only list (commit
`87d3a41`). No further rebase was needed this session.
