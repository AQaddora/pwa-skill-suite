---
name: pwa-audit
description: Use when auditing an existing web app for mobile-PWA readiness — diagnoses input zoom, safe-area, service-worker caching, RTL, and 150+ other known AI-agent PWA mistakes against a machine-readable catalog. Trigger phrases: "audit this PWA", "check mobile readiness", "is this installable", "review our service worker caching", "pwa audit".
---

# pwa-audit

**This skill is read-only. It never writes to the audited project.** It scans source
files and prints a report; it opens no write handle against anything under the project
directory you point it at.

## What it does

Runs a static scanner over a web app and renders a graded, honest report against the
`packages/catalog` catalog of 152 known mobile-PWA failure modes. It implements the
subset of rules that are genuinely decidable from source (viewport-unit misuse, physical
CSS in place of logical, `user-scalable=no`, mobile-keyboard form mistakes,
service-worker caching/update strategy, icon-only buttons, and more). The rest of the
catalog is documented but marked `runtime`/`device` for later phases — the report says
so rather than pretending to have checked them.

## How to run it

```bash
node skills/pwa-audit/scripts/run-audit.mjs <path-to-app>
node skills/pwa-audit/scripts/run-audit.mjs <path-to-app> --json
```

Optional baseline suppression (for brownfield apps that would otherwise open with a wall
of findings) is available through the scanner CLI directly:

```bash
node packages/scanner/cli.mjs <path-to-app> --baseline .pwa-audit-baseline --write-baseline
node packages/scanner/cli.mjs <path-to-app> --baseline .pwa-audit-baseline
```

## What the report contains

- **Five outcomes, not three:** `PASS`, `FAIL`, `UNVERIFIED` (device-only — never PASS),
  `N/A` (the app has no such surface — no forms / no SW yet), and `BLOCKED` (the scan
  could not run). Auditing a pre-conversion app does not "FAIL" every service-worker
  entry — those come back `N/A`.
- **Fix-level aggregation:** findings are grouped by root cause ("1 root cause → N
  instances"), so one codemod resolves a whole group instead of N separate tickets.
- **Grading:** P0 → P1 → P2 → advisory. Heuristic rules ship as `advisory` and rank
  below high-confidence findings.
- **A scanner-visibility disclosure, near the top:** what a static scan cannot see —
  CSS-in-JS (styled-components, Emotion, vanilla-extract), theme objects (MUI/Chakra),
  and shadow DOM. A clean report is **not** proof of correctness for an app built on
  those; the report says so explicitly.

## Fixing what it finds

Read the P0 groups first, then P1. Each group carries the catalog's symptom and correct
fix verbatim, plus up to five `file:line` locations.

When the `superpowers` plugin's `writing-plans` skill is available in the current
session, hand the grouped P0/P1 findings to it to produce a remediation plan. Detect this
**by capability** — is `writing-plans` invocable as a skill right now? — rather than by
looking for a plugin directory or file path, so the integration keeps working if the
plugin layout changes. If it is not available, summarise the top fixes inline instead.
