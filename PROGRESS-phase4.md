# Phase 4 — Progress

**Status:** shipped.
**Merged to `main`:** squash commit `a9fe23c9b80a1bb1ac0ab71fd94fbb0819dc8078` (PR #3).
**Branch:** `feat/phase4-catalog-gaps`.

## What shipped

Closes the catalog's real-world gap an adversarial review found: nothing in the prior
152 entries covered what happens after the app is installed and a real user does real
things in it — auth/OAuth, in-app browsers, permissions, media, realtime, error
observability, or Android as a first-class platform. Path ownership was new entries in
`packages/catalog/catalog.json`, new files under `packages/scanner/rules/` and
`packages/scanner/fixtures/`, and their tests. No pre-existing catalog entry was edited
or reordered; no `probe` field was touched; nothing under `packages/probes`,
`packages/deploy-harness`, `skills/`, `README.md`, `LICENSE`, `install.sh`, or
`.github/` was touched.

### 24 new catalog entries (`P-540`..`P-563`)

Six new sections, inserted before `meta` (renumbered §12 → §18 in both `schema.json`
and `generate-md.mjs`):

- **`identity-auth`** (§12, 4 entries) — P-540 Safari session doesn't transfer to the
  installed app (device-only); P-541 popup OAuth broken on mobile/standalone; P-542
  manifest `scope` can't span origins; P-543 no multi-client session coordination.
- **`in-app-browser`** (§13, 3) — P-544 no in-app-browser detection; P-545 install
  instructions assume Safari's UI; P-546 link capturing assumed to exist.
- **`permissions`** (§14, 3) — P-550 permission requested on load with no denied-state
  handling; P-551 iOS permissions are per-session (device-only); P-552 wake lock never
  re-acquired.
- **`media`** (§15, 3) — P-553 autoplay/`playsinline`; P-554 audio session ignored;
  P-555 `getUserMedia` stream lifecycle unmanaged.
- **`lifecycle`** (§16, 4) — P-556 WebSocket dies on background / `ws://` hardcoded;
  P-557 no refetch on resume; P-558 `beforeunload` never fires on iOS; P-559 offline
  mutation loss.
- **`observability`** (§17, 1) — P-563 no error boundary, no global handlers, no
  reporting sink.

Plus P-547 (Android edge-to-edge safe-area) in `app-shell`, P-548 (forced dark mode) in
`theming`, P-549 (`new Notification()` on Android) and P-560/P-561 (precache/registration
failure modes) in `service-worker`, and P-562 (deep-route refresh 404s) in
`build-deploy`.

Deferred, noted as follow-ups rather than implemented (per SPRINT.md's "if time
allows"): SSR hydration mismatch from UA/viewport branching, CSP breaking the SW
(`worker-src`/`manifest-src`), manifest `dir`/`lang` for RTL apps.

### 10 new static scanner rules (`packages/scanner/rules/`)

Each with `bad/`+`good/` fixtures, auto-tested by the existing generic
`rules.test.mjs` harness (no new test files needed): P-541 (popup OAuth reachable
after `await`), P-544 (no in-app-browser UA branch, advisory), P-549 (`new
Notification()`), P-552 (wake lock never re-acquired), P-553 (autoplay video missing
`muted`/`playsinline`), P-556 (`ws://` literal / `WebSocket` with no reconnect,
advisory), P-558 (`beforeunload` with no `pagehide` fallback), P-560 (precache
`addAll` vs build output, advisory), P-561 (`serviceWorker.register()` with no
`.catch()`), P-563 (no error boundary + global handlers + reporting sink, project-wide
scan anchored at the app's bootstrap call).

Validated against two real repos cloned fresh for this sprint
(`pwa-builder/pwa-starter`, `mdn/pwa-examples`): the new rules produced 6 findings
combined (P-561 x4, P-544 x1, P-549 x1), all manually confirmed true positives, no rule
firing more than 4 times on either app.

## Verification (fresh, exit 0)

```
node packages/catalog/validate.mjs            -> 176 entries, all valid
node packages/catalog/generate-md.mjs --check -> up to date with catalog.json
npm test                                      -> 100 pass / 0 fail
```

Coverage (from `stats.mjs`): total **176**; P0 **40** / P1 **101** / P2 **35**; rules
**25/176 (14%)**, probes **0/176 (0%)**; device-only **10 (6%)**.

## Self-review

Dispatched an independent code-reviewer subagent against the branch diff before
opening the PR. It found one Critical and several Important issues — all fixed and
re-verified on the branch before merge:

- **Critical:** P-561 misdetected `register().then().catch()` chains as unhandled
  (only checked 60 characters past the call site). Fixed by walking the full
  chained-call sequence; added a `.then().catch()` good fixture and a
  `.then()`-with-no-`.catch()` bad fixture that would have caught it.
- **Important:** P-563's boundary check had a bare `handleError` alternative generic
  enough to mask a real missing boundary behind an ordinary error-handling function of
  that name — narrowed to boundary-shaped APIs
  (`getDerivedStateFromError`/`componentDidCatch`/`ErrorBoundary`/`errorCaptured`/`onErrorCaptured`).
  P-552's re-acquire check matched a bare comment mention of "visibilitychange" —
  now requires the real `addEventListener` call. P-553's `.play()` heuristic fired on
  any receiver (e.g. GSAP timelines), not just video/media elements — scoped
  accordingly. P-560/P-563's independent filesystem walks could climb past the
  scanner's own scan root into unrelated sibling packages in a monorepo — both now
  derive and clamp to the actual scan root.

Every fix has a regression fixture and was re-verified against the same two real repos
(same true positives, no regressions, no new false positives) plus a full
`validate.mjs`/`generate-md.mjs --check`/`npm test` pass before merge.
