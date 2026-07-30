# pwa-skill-suite — Design

**Date:** 2026-07-30
**Status:** awaiting review
**Repo:** `AQaddora/pwa-skill-suite` (public, open source)

---

## 1. Problem

A web developer points an AI coding agent at their existing web app and says
"make this a mobile PWA." The agent produces something that *looks* right, builds
green, and is wrong in about twenty specific, predictable ways: the input zooms on
focus, the tab bar sits under the home indicator, `100vh` cuts off the bottom, the
service worker serves cache-first HTML and pins every user to a dead build.

These failures are **not random**. They are a finite, enumerable set. We catalogued
140 of them (`docs/catalog.md`), 27 rated P0.

They share three properties that make them worth systematising:

1. **They survive code review** — the code reads correctly; the defect is in runtime
   behaviour on a device nobody opened.
2. **They survive CI** — a green build says nothing about whether the app is
   installable, or whether the *second* deploy reaches existing users.
3. **Agents reintroduce them** — fixing one instance doesn't stop the next agent, or
   the next session, from writing it again.

The gap is not knowledge. It is **enforcement**.

## 2. What we're building

A suite of ten Claude Code skills plus a verification toolchain, in a public repo.
Skills work standalone; they use the `superpowers` plugin when it's installed.

**Non-goals** (explicit, to keep scope honest):

- Not a UI component library. We fix and verify; we don't ship a design system.
- Not a framework. Must work on Next.js, Vite/React, Nuxt, SvelteKit, Astro, and
  plain static output.
- Not a hosting/deploy tool.
- Not a replacement for `qa-pass` (general E2E). This suite is PWA-specific and
  composes with it.

## 3. Core architecture decision

> **The catalog is machine-readable data, not prose.**

`packages/catalog/catalog.json` is the single source of truth. Every entry:

```json
{
  "id": "P-502",
  "title": "Cache-first on HTML/navigation",
  "section": "service-worker",
  "severity": "P0",
  "detect": ["static", "runtime"],
  "deviceOnly": false,
  "symptom": "...",
  "correct": "...",
  "rule": "packages/scanner/rules/p502-navigation-strategy.mjs",
  "probe": "packages/probes/sw/p502.spec.mjs",
  "docs": "docs/catalog.md#p-502"
}
```

Everything downstream keys off the ID:

- **Scanner rules** declare which IDs they implement.
- **Runtime probes** declare which IDs they assert.
- **The report** renders from the catalog, so a finding always carries its full
  explanation and fix.
- **Skills** reference IDs, so guidance and enforcement can never drift.
- **`docs/catalog.md` is generated from the JSON**, not hand-maintained alongside it.

This buys the property that makes the project credible: **coverage is auditable**.
The README states "140 known failure modes · N static rules · M runtime probes ·
13 device-only" and a CI job proves the numbers. A catalog entry with no rule and
no probe shows up as a documented gap, not as a silent lie.

## 4. Repository layout

```
pwa-skill-suite/
├── README.md                    public face — see §9
├── LICENSE                      MIT
├── install.sh                   mirrors pure-skill-suite installer
├── docs/
│   ├── catalog.md               GENERATED from catalog.json
│   └── superpowers/specs/       design docs (this file)
├── skills/                      9 skills, each SKILL.md + references/ + scripts/
└── packages/
    ├── catalog/                 catalog.json + JSON schema + generator
    ├── scanner/                 static rule engine
    ├── probes/                  Playwright runtime probes
    ├── deploy-harness/          two-build A→B server
    └── report/                  report renderer + fix-handoff blocks
```

## 5. The ten skills

Each is independently invocable. `pwa-convert` sequences them.

| skill | responsibility | catalog sections |
|---|---|---|
| `pwa-audit` | **Read-only** diagnosis of an existing app. Entry point. Changes nothing. | all |
| `pwa-convert` | Orchestrator: audit → plan → per-area skills → verify. | all |
| `pwa-shell` | Tab bar, header compaction, sidebar→drawer, persistent shell, scroll restoration, back handling, overlay stacking. | §2 |
| `pwa-native-feel` | iOS/WebKit hardening + keyboard/forms: dvh, safe areas, overscroll, tap highlight, hover-gating, select split, touch-action, input zoom, inputmode. | §1, §9 |
| `pwa-manifest` | Manifest, icon generation + verification, theming, splash, install flow (both platforms). | §4, §10 |
| `pwa-offline` | SW strategy, update flow, chunk-error recovery, cache versioning, storage, CDN/deploy headers. | §5, §11 |
| `pwa-responsive` | Overflow hunting, breakpoint sweep, touch targets, CLS. | §3, §6 |
| `pwa-rtl` | Logical properties, bidi isolation, mirrored icons, Arabic-capable fonts. | §8 |
| `pwa-a11y` | Stops "app feel" from becoming an a11y regression. | §7 |
| `pwa-verify` | The verifier. Generates + runs the test pack incl. the A→B harness. Gate for done-claims. | §12 + all |

**Read-only entry point.** `pwa-audit` never writes. `pwa-convert` runs it first and
presents findings before proposing changes. Rationale: the suite's first act on
someone else's codebase must be diagnosis, not mutation.

## 6. Verification design

### 6.1 Three outcomes, not two

```
PASS · FAIL · UNVERIFIED (device-only)
```

Playwright's WebKit **is not iOS Safari**. It does not implement the input-zoom
heuristic, URL-bar viewport collapse, the home-screen icon pipeline, virtual-keyboard
geometry, or ITP storage eviction. Thirteen catalog entries are therefore
**unverifiable in CI**.

Most tools quietly report these as passing. This suite reports them as `UNVERIFIED`
and lists them in a "must check on a real device" block with reproduction steps.
Refusing to mark them green is the project's central trust claim; it also means the
report is useful *because* it admits its own limits.

### 6.2 Static scanner

Runs without a browser, in ~seconds, on every save. Roughly 55% of the catalog.
Highest-yield rules: P-113 (body overflow lock), P-801 (physical CSS properties),
P-107 (`100vw`), P-101 (input font-size), P-303 (flex `min-width`).

Framework-agnostic: parses CSS/SCSS, Tailwind class strings, JSX/TSX/Vue/Svelte
templates, and the manifest.

### 6.3 Runtime probes

Playwright across a device matrix — 320/360/390/430/768/1024, portrait + landscape,
WebKit + Chromium, plus standalone display-mode and RTL passes.

Findings must be **actionable**: an overflow failure names the offending element and
its selector by walking the DOM for boxes exceeding the viewport. "The page
overflows" is not a finding.

### 6.4 The deploy harness — the differentiator

Every PWA test suite in existence tests *first install*. Almost none test
**deploy A → deploy B on an existing client**, which is exactly where P-502, P-503,
P-504, P-505 and P-514 live.

`packages/deploy-harness` serves build A, installs the SW, swaps the origin to build
B (deleting A's hashed chunks), and asserts the client converges — no stale HTML, no
chunk 404, no infinite reload loop.

This is the single highest-value test in the suite and the main reason it earns its
existence rather than being a lint config.

### 6.5 Report output

Two artefacts, following the `qa-pass` precedent:

1. **Graded report** — P0/P1/P2, each finding carrying its catalog ID, file:line or
   selector, symptom, fix, and screenshot where visual.
2. **Fix-handoff blocks** — one paste-ready ticket per P0/P1, so each becomes a
   fresh-session task.

## 7. Superpowers integration

**Standalone by default.** Every skill carries inline fallback instructions and never
hard-fails on a missing plugin.

**Detected and used when present.** The mapping is unusually clean:

> Each catalog entry's probe **is** the failing test. `test-driven-development` maps
> 1:1 — write the probe, watch it fail, apply the fix, watch it pass.

| superpowers skill | role here |
|---|---|
| `brainstorming` | scope a conversion before touching code |
| `writing-plans` / `executing-plans` | multi-area conversions |
| `test-driven-development` | probe-first for every fix |
| `verification-before-completion` | **hard gate: no done-claim without a green `pwa-verify` report** |
| `requesting-code-review` | self-review before merge |
| `finishing-a-development-branch` | land it |

Detection is capability-based (is the skill invocable?), not path-sniffing, so it
survives plugin-layout changes. Absent superpowers, `pwa-convert` runs its own
lighter sequence.

## 8. Two corrections to common requirements

Recorded here because they invert requests people (reasonably) make, and the suite
must be opinionated about them:

1. **"Disable zoom."** Correct for double-tap zoom (P-110) and input-focus zoom
   (P-101) — the suite enforces both. Wrong for pinch zoom: `user-scalable=no` is a
   WCAG 1.4.4 failure **and iOS Safari ignores it anyway**, so it harms users without
   even working. The suite refuses to emit it and **fails** the check if found (P-701).
2. **"Disable text selection."** Correct for chrome — tab bars, buttons, headers.
   Applied globally it breaks copy on real content and degrades assistive tooling.
   The suite enforces the chrome/content split (P-111, P-702).

## 9. README (the public face)

Open-source discoverability is a real deliverable, not decoration. The README must:

- Open with the problem in one sentence and the catalog count as the hook.
- Show a real report as its first artefact — findings are the product.
- Publish the honest coverage table, including the device-only gap.
- Quick start: install → `pwa-audit` on an existing app → read report.
- Document standalone vs superpowers modes.
- Contribution path: **a new failure mode = a catalog entry + a rule and/or probe**.
  That's the whole contribution model, and it keeps the project extensible by
  strangers.
- Follow the standing modern-fonts/design rule for any hosted docs page.

## 10. Testing strategy for the suite itself

The suite is a testing tool, so it must be tested against known-bad input:

- **Fixture apps** under `packages/probes/fixtures/` — deliberately broken PWAs, one
  per catalog section, each failing a known ID set.
- **Rule unit tests** — every scanner rule proves it fires on the bad fixture and
  stays silent on the good one. A rule without both is not merged.
- **Coverage CI job** — asserts catalog.json ↔ rules ↔ probes stay in sync and
  publishes the counts the README quotes.
- **False-positive budget.** A scanner that cries wolf gets disabled by its users,
  which is a worse outcome than not existing. Rules that can't be made precise ship
  as `advisory`, ranked below real findings.

## 11. Build order

1. `packages/catalog` — JSON, schema, md generator. Everything depends on it.
2. `packages/scanner` + top-20 highest-yield rules + fixtures.
3. `packages/report` — make findings legible early.
4. `pwa-audit` skill — first usable end-to-end deliverable.
5. `packages/probes` + device matrix.
6. `packages/deploy-harness` — the differentiator.
7. `pwa-verify` skill.
8. Remaining eight skills.
9. README, install.sh, LICENSE, CI.

Rationale: something genuinely useful (`pwa-audit` on a real app) exists at step 4,
before the expensive runtime work.

## 12. Open questions for review

1. Ten skills — right granularity, or consolidate (e.g. fold `pwa-responsive` into
   `pwa-native-feel`, or `pwa-a11y` into `pwa-verify`)?
2. Build order — is `pwa-audit`-first correct, or do you want the deploy harness
   earlier because it's the differentiator?
3. Should `pwa-convert` be allowed to auto-fix P0s, or always propose-then-confirm?
4. Test the suite against one of your real PWAs (taqat-work is the obvious
   candidate) as dogfooding before the public release?
