# Phase 3 — Progress

**Status:** shipped.
**Merged to `main`:** squash commit `5b8fb7d2ee7f13baf2814f1f6c05c5e3cd491026` (PR #2).
**Branch:** `feat/phase3-skills-readme-ci`.

## What shipped

Completes the suite's public surface. Path ownership was `skills/` (every skill except
`pwa-audit`/`pwa-verify`), `README.md`, `LICENSE`, `install.sh`, `.github/`. No `packages/**`
or `catalog.json` was touched (Phase 2 owns those).

### Eight skills (`skills/`)
Each `SKILL.md` carries frontmatter `name` + a `description` with concrete trigger phrases,
body in the Phase-1 house style, and **cites its catalog IDs** so guidance and enforcement
cannot drift:

- **`pwa-convert`** — orchestrator: audit → present findings → plan → per-area skills →
  verify. Runs `pwa-audit` first and proposes changes only after presenting the report.
  References §12 meta (P-1201..P-1210) as the done-gate.
- **`pwa-shell`** — §2 app shell (P-201..P-210).
- **`pwa-native-feel`** — §1 iOS/WebKit (P-101..P-125) + §9 forms (P-901..P-908). Hard-enforces
  the corrections: refuses/fails `user-scalable=no` (P-701), 16px input fonts (P-101),
  `touch-action: manipulation` (P-110), chrome-only `user-select` (P-111/P-702).
- **`pwa-manifest`** — §4 manifest (P-401..P-417) + §10 theming (P-1001..P-1005); icon
  generation **and** pixel/alpha verification.
- **`pwa-offline`** — §5 service worker (P-501..P-519) + §5b version skew (P-520..P-531) +
  §11 build-deploy (P-1101..P-1105); centres the deploy A→B update path.
- **`pwa-responsive`** — §3 responsive (P-301..P-310) + §6 performance (P-601..P-611).
- **`pwa-rtl`** — §8 RTL & i18n (P-801..P-808).
- **`pwa-a11y`** — §7 accessibility (P-701..P-712); hard-enforces the P-701/P-702 corrections.

All skills work standalone and detect `superpowers` **by capability**, never by path-sniffing.

### Enforcement, docs, tooling
- **`skills/lint-skills.mjs`** — drift linter: every SKILL.md must have valid frontmatter, a
  quoted trigger phrase, and cite only catalog IDs that exist in `catalog.json` (checks
  frontmatter **and** body). Wired into CI.
- **`README.md`** — leads with a real `pwa-audit` report; publishes the `stats.mjs`-derived
  coverage table (verified equal to `computeStats`); explains the five outcomes and the
  8-entry device-only trust claim (`UNVERIFIED`, never PASS); one-entry contribution model;
  honest scope.
- **`LICENSE`** — MIT.
- **`install.sh`** — installs `skills/*` into `${CLAUDE_SKILLS_DIR:-~/.claude/skills}`,
  idempotent, prints what it installed, `--dry-run` lists them dynamically (9 present here;
  the 10th, `pwa-verify`, lands via its own sprint).
- **`.github/workflows/ci.yml`** — coverage CI: `validate.mjs`, `stats.mjs`,
  `generate-md.mjs --check` (fails on doc drift), `npm test`, `lint-skills.mjs`,
  `install.sh --dry-run`.

## Verification (fresh, exit 0)

```
node packages/catalog/validate.mjs           -> 152 entries, all valid
node packages/catalog/generate-md.mjs --check -> up to date with catalog.json
npm test                                     -> 80 pass / 0 fail
node skills/lint-skills.mjs                   -> 9 skills checked, 0 failing
bash install.sh --dry-run                     -> lists the installed skills
```

Coverage numbers the README quotes (from `stats.mjs`): total **152**; P0 **32** / P1 **88**
/ P2 **32**; rules **15/152 (10%)**, probes **0/152 (0%)**; device-only **8 (5%)**.

## Self-review

Ran `/code-review high` on the diff. One confirmed finding — `lint-skills.mjs` checked
catalog IDs only in the body, missing frontmatter-cited IDs (the drift it exists to prevent).
Fixed (commit `3ead0fc` on the branch), regression-verified red→green. PR CI green before merge.
