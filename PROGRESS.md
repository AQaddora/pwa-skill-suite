# Progress

## Phase 1 — catalog, scanner, report, pwa-audit ✅ merged

**Merge commit on `main`:** `923e07f9d1190a88dca173ca0d7042cf93d39b56`
(PR #1, squash-merged 2026-07-30)

### Shipped

- **`packages/catalog`** — single source of truth.
  - `catalog.json` — **152 entries, 32 P0**; `schema.json`, `validate.mjs`,
    `generate-md.mjs` (`--check`), `stats.mjs`, all with `node:test` tests.
  - `docs/catalog.md` is generated from the JSON; the version-skew addendum was folded
    in and deleted.
  - `detect` honesty: 29 entries are `runtime`-only with `rule: null` (Phase 2), incl.
    P-101, P-303, P-709, P-111, P-702, P-207. `confidence` on every entry (93 advisory).
    Device-only = 8 (P-101, P-104, P-117, P-121, P-903, P-904, P-1201, P-1206).
  - Stale-fact rewrites: P-110, P-114, P-517.

- **`packages/scanner`** — static rules only.
  - Core: `walk`, `parseClasses`, `css`, `tags`, `loc`, `baseline` (line-anchored
    eslint-style suppression), `registry`; `cli.mjs` exposing `runScan()`.
  - **15 rules**, each with `bad/` + `good/` fixtures (top rules multi-syntax
    CSS/SCSS/JSX/Vue): P-113, P-102, P-107, P-103, P-701, P-110, P-123, P-901, P-902,
    P-801, P-502, P-504, P-514, P-703, P-302. Each wired into `catalog.json`'s `rule`.

- **`packages/report`** — graded, honest renderer.
  - Five outcomes (`PASS`/`FAIL`/`UNVERIFIED`/`N/A`/`BLOCKED`; device-only never PASS).
  - Fix-level aggregation ("1 root cause → N instances"), P0→P1→P2→advisory ordering,
    scanner-visibility disclosure near the top, Markdown + JSON.

- **`skills/pwa-audit`** — read-only `SKILL.md` + `run-audit.mjs`; hands P0/P1 groups to
  `writing-plans` when that skill is invocable (capability detection, no path sniffing).

### Verification (all green at merge)

- `validate.mjs` → 152 entries valid · `stats.mjs` → 152 / 32 P0 / 15 rules / 0 probes
- `generate-md.mjs --check` → up to date · `npm test` → **80 tests, 80 pass, 0 fail**
- `cli bad/p113` shows P-113 · `cli good/p113` shows none

### Self-review outcomes (code-review skill, high effort)

Two confirmed correctness bugs found in-diff and fixed (regression-tested):
- `tags.getAttr` read `data-*` attributes as the base attribute → anchored on
  attribute-start whitespace.
- `css.extractDeclarations` didn't strip block comments → property/value corruption;
  blanked out comments (P-801 recall 42 → 48 on the real app after the fix).

### Real-app dogfood (`~/work/interact-land42`)

Final: **42 P0** (one root cause — physical CSS, 48 instances after the css fix) · **76
advisory**. One false positive (P-107 `max-width: calc(100vw - 32px)`) found and fixed
with a regression fixture; P-801/P-703 spot-checks confirmed true positives.

### Deferred (Phase 2 / 3)

Probes + deploy harness, computed-style/DOM runtime rules (the 29 reclassified entries),
the remaining 8 skills, and the README.
