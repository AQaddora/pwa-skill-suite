# Getting started

This guide takes you from a fresh checkout to your first audit report and shows you how to
read it. It assumes **Node.js 20 or newer** (the suite is tested on Node 20 and Node 22 in
CI — see [Contributing](./contributing.md#node-version-expectation)).

The suite is a set of portable Agent Skills backed by a machine-readable catalog of PWA
failure modes. Everything here runs locally and the audit is **read-only**: it opens no write
handle against the project you point it at.

## 1. Install the skills

`install.sh` copies the skills and a self-contained runtime into an agent skills directory.
Always dry-run first — it prints the exact destination and the follow-up commands with your
real paths substituted in:

```bash
bash install.sh --dry-run
```

Then install into the layout you use:

```bash
# Claude (default): ~/.claude/skills, or $CLAUDE_SKILLS_DIR / $CLAUDE_HOME/skills if set
bash install.sh --target claude

# Codex: $CODEX_SKILLS_DIR, or $CODEX_HOME/skills (default ~/.codex/skills)
bash install.sh --target codex

# Any explicit directory (does not need to live inside your app repo)
bash install.sh --dest /path/to/skills
```

The installer writes the skills plus a private `.pwa-skill-suite/` runtime next to them. It
takes a destination-scoped lock, backs up any existing install, and rolls back on failure, so
a re-run never leaves a half-installed tree.

### Optional: enable browser-based verification

The static audit needs nothing else. The runtime probes and the `pwa-verify` gate use
Playwright; enable them once per installed runtime (substitute the destination `install.sh`
printed):

```bash
npm ci --prefix /path/to/skills/.pwa-skill-suite
npx --prefix /path/to/skills/.pwa-skill-suite playwright install chromium webkit
```

Until you do this, probe-backed checks report `UNVERIFIED` rather than a guessed pass — they
are never silently skipped into a green result.

## 2. Run your first audit

Point the audit script at any web app. Nothing is written to it:

```bash
node "/path/to/skills/pwa-audit/scripts/run-audit.mjs" "/path/to/your/app"

# machine-readable, for CI or tooling
node "/path/to/skills/pwa-audit/scripts/run-audit.mjs" "/path/to/your/app" --json
```

Want to see real output before touching your own code? Run it against the deliberately broken
fixture that ships with the repo:

```bash
node skills/pwa-audit/scripts/run-audit.mjs packages/scanner/fixtures/bad
```

## 3. Read the report

A report has four parts, in order:

1. **Scan status** — `COMPLETE` means the scanner ran end to end. It is *not* a readiness
   verdict; a completed scan with unimplemented rules is still full of `UNVERIFIED`.
2. **Summary** — counts of P0 (critical), P1, P2, and advisory findings. Fix P0 groups first.
3. **What this scan could NOT see** — the explicit limits of static analysis (CSS-in-JS, theme
   objects, Shadow DOM, computed styles). A clean report is not proof for an app that leans on
   these; that is exactly why such surfaces come back `UNVERIFIED`, never `PASS`.
4. **Findings, grouped by root cause** — each group is `1 root cause → N instances`, carries
   its catalog ID, symptom, fix, and up to five `file:line` locations. One codemod usually
   clears a whole group.

Each catalog entry ends up with one of five outcomes — `PASS`, `FAIL`, `UNVERIFIED`, `N/A`, or
`BLOCKED`. Understanding why a clean-but-unparsed repo is `UNVERIFIED` and never `PASS` is the
heart of trusting the report; read [Outcomes](./outcomes.md) next.

## 4. Fix, then verify

Invoke the fix skills for the areas the report flagged (`pwa-shell`, `pwa-native-feel`,
`pwa-manifest`, `pwa-offline`, `pwa-responsive`, `pwa-rtl`, `pwa-a11y`, and the runtime skills),
or run the `pwa-convert` orchestrator to sequence the whole conversion. See [Skills](./skills.md)
for what each one owns and when it applies.

When you believe the work is done, run the completion gate. It runs the scanner, the Playwright
probes, and the deploy harness together and renders one combined report:

```bash
node "/path/to/skills/pwa-verify/scripts/run-verify.mjs" "/path/to/your/app"
node "/path/to/skills/pwa-verify/scripts/run-verify.mjs" "/path/to/your/app" --json
```

`pwa-verify` is the automated done-gate. Its `UNVERIFIED` scopes (device-only concerns,
unimplemented rules) still bound what a green run can claim — the report tells you what it could
not see so you can check those on a real device.
