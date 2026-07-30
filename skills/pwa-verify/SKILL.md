---
name: pwa-verify
description: Use before claiming any PWA/mobile-web work is done — runs the static scanner, the Playwright runtime probes, and the deploy harness together and renders one combined, honest report. This is the completion gate; do not claim "done" on PWA work without a green run from this skill. Trigger phrases: "verify this PWA", "is this ready to ship", "run the full pwa check", "gate this before merging", "pwa verify".
---

# pwa-verify

**This is the done-gate for PWA work in this suite.** No completion claim about mobile-web
readiness, service-worker correctness, or deploy safety without a fresh, green run from
this skill in the current session. A report from an earlier session, or a partial run of
just the scanner or just the probes, does not satisfy this gate.

## What it does

Runs three layers against the audited project and combines them into one report through
the shared `packages/report` renderer, so there is exactly one findings format:

1. **Static scan** (`packages/scanner`) — read-only, source-level.
2. **Runtime probes** (`packages/probes`) — Playwright across the device matrix, driven by
   the project's `pwa-probes.config.mjs` (routes, auth, selector/role overrides). Missing
   config still runs (single route, source-dir target) but most structural probes (tab
   bar, overlays, shell persistence) will report `BLOCKED` without it — that's the
   contract, not a bug; see `packages/probes/lib/config.mjs`.
3. **Deploy harness** (`packages/deploy-harness`) — runs its bundled A→B fixture pair.
   This is a self-conformance check on the harness's 11 stale-code/version-skew
   assertions, **not** a check of the audited project's own deploy — the harness is not
   yet wired to swap an arbitrary project's real build output (documented gap, see
   `packages/deploy-harness/README.md`). The report says this plainly in a
   "Deploy harness scope" section rather than implying more coverage than exists.

## How to run it

```bash
node skills/pwa-verify/scripts/run-verify.mjs <path-to-app>
node skills/pwa-verify/scripts/run-verify.mjs <path-to-app> --json
```

Needs a browser engine installed (`npx playwright install chromium webkit` if this is a
fresh environment) — without one, probes report `BLOCKED: no browser engine could
launch`, and that counts as a gate failure, not a skip.

## Reading the report — and what gates completion

Five outcomes total, three of which block the gate:

| outcome | blocks completion? | meaning |
|---|---|---|
| `FAIL` | **yes** | a real defect, with the culprit named (selector, file:line, or exact reproduction) |
| `BLOCKED` | **yes** | a check could not resolve its target or seed the state it needed — this is *not* a pass; fix the config/seed and re-run |
| `PASS` | no | verified clean |
| `N/A` | no | the surface doesn't exist in this app (no forms, no SW yet, origin-only check on a local target) |
| `UNVERIFIED` (device-only) | no, but **must be listed** | WebKit-in-CI is not iOS Safari — a handful of catalog entries (`packages/probes/lib/device-only.mjs`) cannot be proven here. The report always renders a "Verify on a real device" block with reproduction steps for these. Never claim these are done without a real-device check; never let a clean CI run imply otherwise. |

The script exits non-zero on any `FAIL` or `BLOCKED`. A "done" claim requires exit 0 —
and even then, read the `UNVERIFIED` block out loud before saying so, since exit 0 does
not cover those.

## Superpowers integration

When the `superpowers` plugin's `verification-before-completion` skill is invocable in
the current session, route this skill's report through it as the evidence before making
any completion claim. Detect this **by capability** — is `verification-before-completion`
invocable as a skill right now? — never by checking for a specific plugin directory or
file path, so the integration keeps working if the plugin layout changes. Standalone
(no `superpowers`), this skill's exit code and rendered report are themselves the gate.
