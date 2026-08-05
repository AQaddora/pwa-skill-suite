---
name: pwa-verify
description: 'Use before claiming any PWA/mobile-web work is done — runs the static scanner, the Playwright runtime probes, and the deploy harness together and renders one combined, honest report. This is the completion gate; do not claim "done" on PWA work without a green run from this skill. Trigger phrases: "verify this PWA", "is this ready to ship", "run the full pwa check", "gate this before merging", "pwa verify".'
---

# pwa-verify

**This is the done-gate for the automated PWA coverage in this suite.** No completion
claim about mobile-web readiness or service-worker correctness without a fresh, green run
from this skill in the current session. A report from an earlier session, or a partial run
of just the scanner or just the probes, does not satisfy this gate. Target-repository
deploy safety needs separate A→B evidence until a project adapter exists; the default
report marks that scope `UNVERIFIED` even when every implemented check is green.

## What it does

Runs these layers and combines their results into one report through
the shared `packages/report` renderer, so there is exactly one findings format:

1. **Static scan** (`packages/scanner`) — read-only, source-level.
2. **Runtime probes** (`packages/probes`) — Playwright across the device matrix, driven by
   the project's `pwa-probes.config.json` (target, routes, auth state, selector/role
   overrides). A missing runtime target is `BLOCKED`: the verifier does not expose an
   arbitrary repository root through a static server. Configure a local `baseURL` or an
   existing, dedicated build-artifact `staticRoot` strictly below the repository root; see
   `packages/probes/lib/config.mjs`. The repository root (`"."`) is always rejected.
3. **Target deploy evidence** — explicitly reports `UNVERIFIED`; the suite does not infer
   build commands, output directories, hosting providers, auth seeds, or promotion steps
   from a repository.
4. **Bundled deploy-harness self-test** (`packages/deploy-harness`) — runs the suite-owned
   A→B fixture pair to prove its stale-code/version-skew assertions still execute. Its
   findings and PASS rows are kept outside the target report and serialized as
   `harnessSelfTest`, never as app evidence. See `packages/deploy-harness/README.md`.

## How to run it

Resolve `<pwa-verify-skill-dir>` to the directory containing this selected
`pwa-verify/SKILL.md`. The target repository does not need to contain or vendor the suite.

```bash
node "<pwa-verify-skill-dir>/scripts/run-verify.mjs" "<path-to-app>"
node "<pwa-verify-skill-dir>/scripts/run-verify.mjs" "<path-to-app>" --json
node "<pwa-verify-skill-dir>/scripts/run-verify.mjs" "<path-to-app>" --allow-config-code
node "<pwa-verify-skill-dir>/scripts/run-verify.mjs" "<path-to-app>" --allow-external-targets
```

The suite runtime needs Playwright and browser engines. In a suite checkout, run
`npm ci` and `npx playwright install chromium webkit`. For an installed suite, run those
commands inside the installed `.pwa-skill-suite` runtime directory. A missing package is
reported as `BLOCKED / PLAYWRIGHT_NOT_INSTALLED`; missing browser binaries are also
`BLOCKED`. The default gate requires both Chromium and WebKit: a Chromium-only run can
still reveal defects, but it cannot return top-level `PASS`. Markdown names every skipped
engine and its reason; JSON records `engineCoverage.expected`, `engineCoverage.run`, and
`engineCoverage.skipped`. Neither a missing package nor an incomplete engine matrix crashes
at import time or becomes a silent skip. Playwright WebKit still does not replace the
separate real-iPhone checks listed as `UNVERIFIED`.

Prefer non-executable `pwa-probes.config.json`. By default, auth state must stay inside the
repository and `baseURL` must be local. Review the config and use
`--allow-external-targets` before allowing a remote origin or an external auth-state file.
Configured auth is applied to the probe routes by default. It must declare exactly one seed
(`storageState` or executable `login`) and exactly one provider-neutral success postcondition
(`auth.success.selector` or a same-origin `auth.success.urlPattern`). The harness verifies
that postcondition after authenticated navigation; an unreadable seed or a public/login-page
fallback is typed `BLOCKED` rather than silently retried anonymously. Unknown config keys are
rejected, so a misspelled route, selector, scenario, or auth field cannot reduce coverage.
That flag never widens `staticRoot`: local static serving remains strictly inside a
dedicated artifact directory with a contained `index.html`, and refuses hidden files,
source maps, source-language files, lock/config metadata, and key material. For a root-hosted plain static site, use its local
preview server or copy the reviewed public artifact into a dedicated child directory; do
not set `staticRoot` to the repository or a source tree.
A repository may instead provide executable
`pwa-probes.config.mjs` when it needs a login callback, but the verifier refuses to import
that file by default. Use `--allow-config-code` only after reviewing and trusting the
target repository/config. The contract is framework-, package-manager-, and
hosting-provider-neutral: provide `baseURL`, routes, selectors, scenarios, and optional
auth state rather than editing suite code.

For the full repository-neutral contract and evidence boundaries, read
[`references/repository-contract.md`](references/repository-contract.md).

## Reading the report — and what gates completion

Five outcomes total, three of which block the gate:

| outcome | blocks completion? | meaning |
|---|---|---|
| `FAIL` | **yes** | a real defect, with the culprit named (selector, file:line, or exact reproduction) |
| `BLOCKED` | **yes** | a check could not resolve its target or seed the state it needed — this is *not* a pass; fix the config/seed and re-run |
| `PASS` | no | verified clean |
| `N/A` | no | the surface doesn't exist in this app (no forms, no SW yet, origin-only check on a local target) |
| `UNVERIFIED` | no, but **limits the claim and must be listed** | Device-only behavior and target-repository A→B deployment are not proven by the default run. Never present them as covered by a green automated gate. |

The script exits `1` on `FAIL` and `2` on `BLOCKED`. Every static finding blocks,
including an advisory-confidence finding; confidence controls ranking, not the gate.
A "done" claim requires exit 0 — and even then, read each `UNVERIFIED` scope before
saying what is complete, since exit 0 does not cover those scopes.

## Claim-boundary checklist (P-1201..P-1210)

The automated result is only one evidence layer. Before expanding the claim to “the PWA is
done,” record the remaining catalog gates explicitly:

- **P-1201** real iOS and Android devices; **P-1202** canonical widths plus landscape.
- **P-1203** a target build A → B update; **P-1204** offline navigation and recovery.
- **P-1205** both install flows; **P-1206** critical forms with the mobile keyboard open.
- **P-1207** an RTL pass when shipped; **P-1208** screen-reader and keyboard-only use.
- **P-1209** throttled CPU/network behavior; **P-1210** runtime evidence beyond a green
  build. Keep any unavailable item `UNVERIFIED` or `BLOCKED`; never silently inherit PASS.

## Superpowers integration

When the `superpowers` plugin's `verification-before-completion` skill is invocable in
the current session, route this skill's report through it as the evidence before making
any completion claim. Detect this **by capability** — is `verification-before-completion`
invocable as a skill right now? — never by checking for a specific plugin directory or
file path, so the integration keeps working if the plugin layout changes. Standalone
(no `superpowers`), this skill's exit code and rendered report are themselves the gate.
