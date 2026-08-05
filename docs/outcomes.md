# Outcomes — how to trust a verdict

Most PWA tools grade every check as pass or fail. That forces two lies: a concern a static
scanner cannot actually observe gets a green pass, and an app that has not been converted yet
gets a wall of red for service-worker features it was never supposed to have.

This suite grades every applicable catalog entry as one of **five** outcomes. The exact
derivation lives in [`packages/report/outcomes.mjs`](../packages/report/outcomes.mjs); this
page explains what each outcome means and — more importantly — the rules that stop a clean scan
from being mistaken for a correct app.

## The five outcomes

| Outcome | Meaning |
|---|---|
| **PASS** | A rule ran, understood the input, and found nothing. Genuine positive evidence — only ever given when a rule actually exists and inspected a format it can parse. |
| **FAIL** | A rule ran and found a violation. Actionable now. |
| **UNVERIFIED** | Cannot be proven here. Either the concern is **device-only** (Playwright's WebKit ≠ iOS Safari), the rule is **not yet implemented**, or the source was **only partially parseable**. Never counted as passing. |
| **N/A** | The app has no such surface. Auditing a pre-conversion app does not fail every service-worker entry — with no service worker present, those entries are `N/A`. |
| **BLOCKED** | The scan itself could not run (bad target, missing runtime). A caller-supplied override; nothing was observed. |

## How an outcome is derived

`deriveOutcome()` applies these checks in order. The order is the point — evidence outranks
heuristics, and every path to `PASS` is guarded:

1. **`blocked` → `BLOCKED`.** If the scan could not run, no verdict is inferred from silence.
2. **Any finding → `FAIL`.** A positive observation is direct evidence. This outranks
   surface-detection, so a missed surface can never downgrade a real defect to `N/A`.
3. **A baselined finding → `FAIL`.** Baselines de-noise the grouped list during a migration,
   but the positively observed defect keeps its `FAIL` outcome — a baseline hides it from the
   diff, it does not make it correct.
4. **Surface absent → `N/A`.** No forms, no service worker → the entry does not apply here.
5. **Device-only entry → `UNVERIFIED`.** The concern cannot be proven off a real device.
6. **No rule implemented → `UNVERIFIED`.** The catalog documents the failure mode, but no
   automated check exists yet, so absence proves nothing.
7. **Incomplete parse → `UNVERIFIED`.** If any applicable file was only partially understood
   (embedded/preprocessed styles, an unsupported single-file-component surface), a clean
   *supported* file does not prove the *unsupported* source is clean.
8. **Zero applicable files → `UNVERIFIED`.** A rule can only prove absence after it inspected
   at least one input format it understands. An empty repo, or one made entirely of
   unsupported file types, stays `UNVERIFIED` — never a synthetic `PASS`.
9. **Otherwise → `PASS`.** A rule exists, it parsed real input it understands, and it found
   nothing.

## The anti-false-PASS rules

These are the guarantees that make a green verdict worth trusting:

- **A clean-but-unparsed repo is `UNVERIFIED`, never `PASS`.** If the scanner could not parse
  the files a rule cares about — or there were no such files at all — it says so. Silence from a
  scanner that never read your code is not evidence, and the report refuses to dress it up as
  one (steps 7 and 8 above).

- **Device-only concerns are `UNVERIFIED`, never `PASS`.** Playwright's WebKit is not iOS
  Safari: it does not run the iOS input-zoom heuristic, the URL-bar viewport collapse, the
  home-screen icon pipeline, or ITP storage eviction. Those entries can never be proven green in
  CI, so the suite marks them `UNVERIFIED` and tells you to check on a real device. This is the
  project's central trust claim — most tools quietly report these as passing.

- **A documented-but-unimplemented entry is `UNVERIFIED`, never `PASS`.** The catalog is larger
  than the set of automated rules on purpose. An entry with no rule reports `UNVERIFIED`, so
  coverage gaps are visible instead of masquerading as clean.

- **Positive evidence always wins.** A real finding is `FAIL` even if surface detection or a
  baseline would have softened it. The report never talks you out of a defect it actually saw.

## COMPLETE is not PASS

A report's **scan status** (`COMPLETE`) describes whether the scanner finished executing — not
whether the app is ready. A `COMPLETE` scan can be almost entirely `UNVERIFIED`. Only
`pwa-verify` acts as the automated completion gate, and even a green `pwa-verify` run is bounded
by its listed `UNVERIFIED` scopes: the things it could not see on this machine still need a real
device. The report states those limits plainly so a green run is honest about its own edges.
