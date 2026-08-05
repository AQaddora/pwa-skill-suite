---
name: pwa-convert
description: 'Use to convert an existing web app into an installable, native-feeling mobile PWA end to end — the orchestrator that audits first, presents findings, then sequences the per-area fix skills and gates on a real verification pass. Covers the whole catalog. Trigger phrases: "convert this app to a PWA", "make this installable and native-feeling", "turn our web app into a mobile app", "full PWA conversion", "do the whole PWA pass".'
---

# pwa-convert

The orchestrator. It does not fix things directly — it **diagnoses first, presents the
findings, then sequences the applicable area skills** and refuses to declare done without
runtime evidence. Covers the full catalog through explicit section ownership plus
`pwa-audit` and `pwa-verify`.

**Non-negotiable order: diagnosis before mutation.** The suite's first act on someone
else's codebase must be a read-only audit, not a change.

## Step 1 — Audit (read-only, always first)

```bash
node "<pwa-audit-skill-dir>/scripts/run-audit.mjs" "<path-to-app>"
```

Resolve `<pwa-audit-skill-dir>` from the selected `pwa-audit/SKILL.md`; never assume the
target repository vendors this suite.

`pwa-audit` writes **nothing**. Present the graded report to the user — the P0 groups
first, then P1 — **before proposing any change**. The five outcomes matter here: `FAIL`
findings are actionable now; `UNVERIFIED (device-only)` and `N/A` (no such surface yet) are
not failures; `BLOCKED` means the scan couldn't run. Do not "fix" an `N/A` or claim an
`UNVERIFIED` is green.

## Step 2 — Plan

Group the findings by fix (one root cause → N instances) and map each group to its area
skill:

| Catalog area | Skill |
|---|---|
| §1 iOS/WebKit (P-101..P-126), §9 forms (P-901..P-908) | **`pwa-native-feel`** |
| §2 app shell (P-201..P-210, P-547) | **`pwa-shell`** |
| §3 responsive (P-301..P-310), §6 performance (P-601..P-611) | **`pwa-responsive`** |
| §4 manifest (P-401..P-417), §10 theming (P-548, P-1001..P-1005) | **`pwa-manifest`** |
| §5 service worker (P-501..P-519, P-549, P-560..P-561), §5b version-skew (P-520..P-531), §11 build-deploy (P-562, P-1101..P-1105) | **`pwa-offline`** |
| §7 accessibility (P-701..P-712) | **`pwa-a11y`** |
| §8 RTL & i18n (P-801..P-808) | **`pwa-rtl`** |
| Identity/auth + in-app browsers (P-540..P-546) | **`pwa-auth-state`** |
| Push + gesture-gated permissions (P-118, P-549..P-552) | **`pwa-push-permissions`** |
| Media, lifecycle, offline mutations + observability (P-553..P-559, P-563) | **`pwa-runtime-resilience`** |

Recommended sequence (later stages depend on earlier ones):

1. **`pwa-manifest`** — installability and theming; nothing else matters if it can't install.
2. **`pwa-shell`** — the persistent shell is the structural precondition for native feel.
3. **`pwa-native-feel`** — iOS/WebKit hardening + keyboard.
4. **`pwa-responsive`** — overflow, breakpoints, touch targets, weight.
5. **`pwa-a11y`** — the a11y counterweight, so "app feel" doesn't regress access.
6. **`pwa-rtl`** — only if the app ships an RTL locale.
7. **`pwa-auth-state`** — when the app has identity or user-scoped persisted state.
8. **`pwa-push-permissions`** — only when Push or another permission-gated capability exists.
9. **`pwa-runtime-resilience`** — when the app has media, realtime, queued mutations, or production telemetry.
10. **`pwa-offline`** — the SW and version-skew work **last**, because it's the highest-risk
   area and its real test (deploy A → deploy B) needs the rest of the app stable first.

Invoke only skills whose surfaces exist. An absent capability is `N/A`; an existing but
unconfigured surface is `BLOCKED` or `UNVERIFIED`, never silently treated as passing.
Resolve `references/catalog-ownership.json` relative to this selected `pwa-convert/SKILL.md`.
It is the installed, machine-readable primary routing map; CI checks that every catalog
entry has an owner, an affirmative orchestrator route, and a lesson in that owner skill.

## Step 3 — Propose, then apply

Present the plan (which groups, which skills, in what order) and confirm before mutating.
**Propose-then-confirm on P0s** — do not silently auto-fix ship-blockers on someone else's
codebase. Apply one area at a time; re-audit between areas so progress is visible and
regressions surface early.

## Step 4 — Verify (the done-gate)

Hand off to **`pwa-verify`** for the implemented runtime pack and explicitly configured
project evidence. **No "converted" or "done" claim without a green verification report.**
The meta-failures are exactly the things a green build does **not** prove — treat each as a
required gate:

- **P-1201** real-device pass (iOS Safari + Android Chrome), not emulation.
- **P-1202** the canonical width set (320/360/390/430/768/1024) + landscape, not desktop only.
- **P-1203** the second deploy — the update path (§5), where the P0s live.
- **P-1204** offline. **P-1205** the install flow end-to-end, both platforms.
- **P-1206** with the keyboard open. **P-1207** in RTL (if shipped).
- **P-1208** with a screen reader / keyboard only. **P-1209** on a throttled CPU/network.
- **P-1210** — declaring "done" from a green build is not runtime evidence. Require a report, a recording, or a live pass.

## Standalone vs superpowers

Works standalone — run the four steps above manually. When `superpowers` is available
(detect **by capability** — is the skill invocable right now? — never by sniffing plugin
paths), the mapping is unusually clean and `pwa-convert` uses it:

- **`brainstorming`** — scope the conversion before touching code.
- **`writing-plans` / `executing-plans`** — drive the multi-area conversion task-by-task.
- **`test-driven-development`** — each catalog entry's probe **is** the failing test: write
  the probe, watch it fail, apply the fix, watch it pass.
- **`verification-before-completion`** — the hard gate: no done-claim without a green
  `pwa-verify` report.
- **`requesting-code-review`** — self-review before merge. **`finishing-a-development-branch`** — land it.

Absent superpowers, `pwa-convert` runs its own lighter sequence: audit → present → plan →
per-area fixes → manual verification pass across the §12 checklist.
