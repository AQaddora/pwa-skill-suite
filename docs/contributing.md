# Contributing

The contribution model is deliberately small: **a new failure mode = a catalog entry + a rule
and/or probe + a fixture pair.** A stranger can land one in a single sitting. This page covers
the repo layout, the exact steps to add an entry, how to run the suite, and the Node-version
expectation.

## Repository layout

```
packages/
  catalog/          The machine-readable catalog and its tooling
    catalog.json      177 entries: the source of truth
    validate.mjs      Schema validation (run after any edit)
    stats.mjs         Generated coverage numbers the README quotes
    generate-md.mjs   Regenerates docs/catalog.md from catalog.json
  scanner/          Static analysis
    rules/            One file per implemented rule (p###-*.mjs)
    fixtures/         bad/ and good/ pairs, one per rule
    lib/              Source walking, lexical JS analysis, applicability
  probes/           Playwright runtime probes + fixtures and config
  report/           Outcome derivation and JSON/Markdown rendering
    outcomes.mjs      deriveOutcome() — the five-outcome model
  deploy-harness/   The A→B deploy verification harness
  installer/        install.sh behaviour tests
skills/             The 13 Agent Skills (SKILL.md + scripts/)
  lint-skills.mjs   Frontmatter + catalog-ID citation linter
docs/               This documentation (docs/catalog.md is generated)
install.sh          The installer
```

`docs/catalog.md` is **generated** from `catalog.json` — never hand-edit it. CI fails if it
drifts from the JSON.

## Add a failure mode

1. **Add the catalog entry.** Append an object to `packages/catalog/catalog.json` with a new
   `P-###` id, a `section`, a `severity` (`P0`/`P1`/`P2`), a `symptom`, the `correct` behaviour,
   and the `detect` channels. Mark it `deviceOnly` if it can only be confirmed on real hardware.
   Validate against the schema:

   ```bash
   node packages/catalog/validate.mjs
   ```

2. **Regenerate the catalog doc.** The Markdown is produced from the JSON:

   ```bash
   node packages/catalog/generate-md.mjs          # rewrite docs/catalog.md
   node packages/catalog/generate-md.mjs --check   # what CI runs; fails on drift
   ```

3. **Implement detection (encouraged).** Add a static rule under `packages/scanner/rules/` and
   point the entry's `rule` field at it. **A rule must ship with a `bad`/`good` fixture pair** —
   a fixture that triggers the finding and one that must stay clean — under
   `packages/scanner/fixtures/bad/<id>/` and `packages/scanner/fixtures/good/<id>/`. A rule
   without both fixtures is not merged. Where the concern needs a real browser, add a runtime
   `probe` under `packages/probes/` with its own good/bad fixtures instead of (or in addition to)
   a static rule.

4. **Cite it in the owning skill.** Every rule a skill enforces must reference its catalog id in
   that skill's `SKILL.md`. The linter fails if a skill cites an id the catalog does not define:

   ```bash
   node skills/lint-skills.mjs
   ```

   New sections also need an owner in
   [`skills/pwa-convert/references/catalog-ownership.json`](../skills/pwa-convert/references/catalog-ownership.json);
   CI rejects a section with no owner or no orchestrator route.

5. **Keep the coverage honest.** `stats.mjs` publishes the numbers the README asserts on, and a
   test cross-checks the README against `catalog.json`. If your entry changes a total, the README
   stats block must move with it — CI catches the drift.

## Run the suite

```bash
npm ci        # install locked dependencies
npm test      # run every package's test suite (node --test)
```

Other useful entry points:

```bash
# Static audit of any app (read-only)
node skills/pwa-audit/scripts/run-audit.mjs <project-dir> [--json]

# Runtime probes (needs Playwright browsers installed)
node packages/probes/cli.mjs <project-dir> [--json]

# Combined completion gate: scanner + probes + deploy harness
node skills/pwa-verify/scripts/run-verify.mjs <project-dir> [--json]

# Installer dry-run (lists the skills it would install)
bash install.sh --dry-run
```

The runtime probes and `pwa-verify` need browser engines. Install them once:

```bash
npx playwright install --with-deps chromium webkit
```

Before opening a PR, make sure the same checks CI runs are green locally: `validate.mjs`,
`stats.mjs`, `generate-md.mjs --check`, `npm test`, `lint-skills.mjs`, and the installer
dry-run.

## Node-version expectation

The suite targets **Node.js 20 or newer** (`engines.node: ">=20"`). CI runs the full suite on a
matrix of **Node 20 (npm 10)** and **Node 22 (npm 11)** — `fail-fast: false`, so both legs must
pass. Testing both versions is not incidental: npm 11 changed how `npm run` drains a
grandchild's stdout, which can make a bug green on Node 20 and red on Node 22. A green CI that
can only see one npm is not enough, so contributions must pass on both.
