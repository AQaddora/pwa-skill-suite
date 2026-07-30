# Phase 2 — Runtime Probes, Deploy Harness, pwa-verify Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans / test-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add the runtime half of pwa-skill-suite: Playwright probes across a device
matrix, the two-build deploy A→B harness, and the `pwa-verify` done-gate skill.

**Architecture:** Three ESM packages, no build step. `packages/probes` drives Playwright
across an engine×viewport×orientation matrix, resolving targets through a discovered
`pwa-probes.config.mjs` contract (routes/auth/baseURL/selectors + `data-pwa-role`
annotations); unresolved target ⇒ `BLOCKED`, device-only entry ⇒ `UNVERIFIED`,
origin-only check on localhost ⇒ `N/A`. `packages/deploy-harness` serves build A through a
single-origin swap proxy, installs the SW, swaps the backing dir to build B (deleting A's
hashed chunks), and asserts convergence. `skills/pwa-verify` runs scanner+probes+harness and
renders the combined report through the existing `packages/report` (no second findings
renderer). Findings are report-compatible (`{id,file,line,excerpt}`); probe/harness
per-entry outcomes are produced by the packages themselves (report `deriveOutcome` is not
probe-aware and is not owned here).

**Tech Stack:** Node 22 ESM, `node:test`, Playwright 1.62 (Chromium always; WebKit when host
libs present), Node `http` for servers.

## Global Constraints

- Path ownership: ONLY `packages/probes`, `packages/deploy-harness`, `skills/pwa-verify`,
  and the `probe` field of `packages/catalog/catalog.json`. Do not touch `README.md`,
  `skills/` (except `pwa-verify`), `packages/report`, `packages/scanner`, `packages/catalog`
  (except the `probe` field).
- Stay on branch `feat/phase2-probes-harness-verify`. Commit working increments; **push
  after every commit** (`git push gh feat/phase2-probes-harness-verify`).
- Device-only entries (P-101,P-104,P-117,P-121,P-903,P-904,P-1201,P-1206) MUST report
  `UNVERIFIED (device-only)`, never PASS. Partial signals report the static half honestly
  without laundering into a full pass.
- Findings must name the culprit (selector + measurement + matrix cell). "The page
  overflows" is rejected.
- Probes deterministic: wait on real conditions, no arbitrary sleeps.
- Reuse `packages/report` for the findings render; reuse catalog IDs and finding shape.
- No secrets, no deploys, no force-push to main.

---

## Contract: finding & outcome shapes

**Finding** (report-compatible, consumed by `packages/report/group.mjs`):
```js
{ id: 'P-301', file: '<route or context>', line: 0, excerpt: '<selector> — <detail> [<cell>]' }
```
`severity`/`title`/`symptom`/`fix` come from the catalog by id (report resolves them).

**Probe / harness result** (per probe, aggregated over the matrix):
```js
{ ids: ['P-301'], outcome: 'PASS'|'FAIL'|'UNVERIFIED'|'BLOCKED'|'N/A',
  findings: [ ...finding ], detail: '<one-line why>', reproduction?: '<real-device steps>' }
```
Aggregation: any finding ⇒ FAIL; target unresolved in every applicable cell ⇒ BLOCKED;
origin-only check on a local target ⇒ N/A; device-only ⇒ UNVERIFIED; else PASS.

---

## Task 1: Probe foundation (config, matrix, engines, outcomes)

**Files:**
- Create `packages/probes/lib/config.mjs` — discover+load `pwa-probes.config.mjs`, validate,
  fill defaults. `loadConfig(projectRoot)` → normalized config or throws with a clear message.
- Create `packages/probes/lib/matrix.mjs` — `DEVICE_MATRIX` (widths 320/360/390/430/768/1024,
  portrait+landscape) and `cells({engines})` generator yielding `{engine,width,height,orientation}`.
- Create `packages/probes/lib/engines.mjs` — `availableEngines()` tries to launch chromium &
  webkit once, caches, returns the launchable list + a `skipped` list with reasons.
- Create `packages/probes/lib/finding.mjs` — `makeFinding(id, {context,selector,detail,cell})`.
- Create `packages/probes/lib/outcome.mjs` — `aggregate({ids, cells, findings, deviceOnly,
  originOnly, targetResolvedInAnyCell, targetIsLocal})` → outcome+detail.
- Create `packages/probes/lib/roles.mjs` — `resolveRole(page, role, config)` returns a
  Playwright locator from `config.selectors[role]` else `[data-pwa-role="role"]`, or null.
- Tests: `packages/probes/test/config.test.mjs`, `matrix.test.mjs`, `outcome.test.mjs`.

**Interfaces produced:** `loadConfig`, `DEVICE_MATRIX`, `cells`, `availableEngines`,
`makeFinding`, `aggregate`, `resolveRole`.

- [ ] TDD each pure module (config/matrix/outcome/roles) with node:test, red→green→commit+push.

## Task 2: Probe harness runner + static fixture server

**Files:**
- Create `packages/probes/lib/server.mjs` — minimal static file server over a dir; returns
  `{ url, close }`. Used to serve fixtures in self-tests and any source-dir target.
- Create `packages/probes/lib/harness.mjs` — `createHarness({config, engines})` exposing
  `openPage({engine,width,height,orientation,displayMode,rtl,route,storageState})` →
  `{page, context, close}` and `config`, `engines`, `cells()`.
- Create `packages/probes/runner.mjs` — `runProbes({projectRoot|config, probes})` loads
  engines, runs each probe with the harness, collects results, closes browsers.
- Tests: `server.test.mjs` (serves a file), `harness.test.mjs` (opens a chromium page at a viewport).

## Task 3: Probes (bad-fires / good-silent, per probe)

Each probe file in `packages/probes/probes/<id>.mjs` exports
`{ ids, name, deviceOnly?, originOnly?, async run(harness) }`. For each: a `fixtures/bad/<id>/`
and `fixtures/good/<id>/` static app, and a `test/probes/<id>.test.mjs` proving it FAILs on bad
and PASSes (or is silent) on good, via Chromium.

- [ ] P-301 overflow — walk DOM for boxes wider than viewport; report selector + overflow px per cell.
- [ ] P-308 touch targets — every actionable element <44px in either axis is a finding.
- [ ] P-201 tab bar fixed — resolved tabbar must be `position: fixed/sticky` and pinned to bottom.
- [ ] P-202 content behind bar — last content element not occluded by the tab bar rect.
- [ ] P-203 shell identity — navigate routes; the shell node keeps element identity (not re-created).
- [ ] P-204 scroll restoration — scroll tab A, visit B, return to A; scrollTop restored.
- [ ] P-207 overlay above bar — open overlay; its z-order/rect is above the tab bar, not clipped.
- [ ] P-208 history back closes overlay — `history.back()` closes the overlay, no dead route.
- [ ] P-115 standalone back — in `display-mode: standalone` on a deep route, a back affordance exists.
- [ ] P-509 offline fallback — go offline, navigate; a fallback renders (not the browser error).
- [ ] P-703 icon button name — actionable icon-only controls have an accessible name (computed).
- [ ] P-704 div-onClick — clickable non-button/-link/-role elements are findings.
- [ ] P-705 focus-visible — `:focus-visible` produces a visible outline/ring change.
- [ ] P-706 focus trap/restore — overlay traps Tab focus and restores it to the trigger on close.
- [ ] P-711 inert background — background is `inert`/`aria-hidden` while the overlay is open.
- [ ] P-101 (device-only) — computed font-size <16px on a control ⇒ FAIL finding; zoom behaviour
      reported UNVERIFIED. Clean font-size ⇒ UNVERIFIED (never PASS).
- [ ] `packages/probes/lib/device-only.mjs` — the 8 device-only entries with reproduction steps;
      runner emits UNVERIFIED for all 8 (P-101 additionally runs the font-size probe).

## Task 4: Probe report + CLI

**Files:**
- Create `packages/probes/report.mjs` — `renderProbeReport(results, catalog)`: the per-entry
  outcome table + the "Verify on a real device" block (device-only reproduction). NOT a findings
  renderer.
- Create `packages/probes/cli.mjs` — `npm run probes -- <projectRoot>`; loads config, runs,
  prints findings (via report/render-md) + probe outcome table; exit 1 on any FAIL.
- Wire `probe` field for every covered id in `catalog.json` to its probe file path.
- Tests: `report.test.mjs`.

## Task 5: Deploy harness

**Files:**
- Create `packages/deploy-harness/lib/proxy.mjs` — single-origin server with a swappable backing
  dir; `serve(dirA)`, `swapTo(dirB, {deleteChunks:[...]})`, chunk 404 after swap.
- Create `packages/deploy-harness/fixtures/build-a/` and `build-b/` — tiny SPA: `index.html`,
  hashed `app.<hash>.js`, a lazy `chunk.<hash>.js`, `sw.js`, `manifest.webmanifest`, `_headers`.
  A and B differ in content hash, cookie shape, storage schema version, and build ID.
- Create `packages/deploy-harness/assertions/<id>.mjs` for P-502,505,503,504,514 (stale code) and
  P-520,522,523,525,528,531 (version-skew). Each returns a probe-shaped result.
- Create `packages/deploy-harness/runner.mjs` + `cli.mjs` — `npm run harness`; exit 1 on FAIL.
  P-523 failure ranked most severe (privacy).
- Tests: `packages/deploy-harness/test/*.test.mjs` (proxy swap+404; each assertion converges).

## Task 6: pwa-verify skill

**Files:**
- Create `skills/pwa-verify/SKILL.md` — house-style frontmatter (name+description+triggers);
  documents the done-gate: no completion claim without a green report; UNVERIFIED listed
  explicitly. Capability-detect superpowers (`verification-before-completion`).
- Create `skills/pwa-verify/scripts/run-verify.mjs` — runs scanner (`runScan`), probes
  (`runProbes`), harness (`runHarness`); merges findings; renders via `report.buildReport`
  + `renderMarkdown` + probe/harness outcome tables + device-only block; exit code reflects gate.
- Add `packages/*` scripts to root `package.json`: `probes`, `harness`, `verify`.

## Task 7: Verify, self-review, finish

- [ ] Run every command in SPRINT.md "Verification" with fresh output; paste in PR.
- [ ] Dogfood against a real app under `~/work`; paste report incl. UNVERIFIED block.
- [ ] requesting-code-review on the diff; address findings; re-verify.
- [ ] finishing-a-development-branch: push, open/refresh PR, mark READY, squash-merge to main.
- [ ] Write `PROGRESS-phase2.md` (shipped + merge SHA); push.
