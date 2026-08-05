# Skills

The suite ships **13 skills**. Two are entry points (`pwa-audit` to diagnose, `pwa-convert` to
orchestrate), one is the completion gate (`pwa-verify`), and the rest each own a section of the
catalog and fix one area. Every skill is self-contained guidance backed by catalog entries and,
where a machine can prove them, static rules and runtime probes.

Each skill declares trigger phrases in its `SKILL.md` frontmatter, so an agent invokes the right
one from a natural request. You can also run the underlying scripts directly (see
[Getting started](./getting-started.md)).

## Entry points

| Skill | When it applies | Catalog scope |
|---|---|---|
| **pwa-audit** | Always first. Diagnoses an existing app for mobile-PWA readiness across the whole catalog. **Read-only** — never writes to the audited project. | All sections |
| **pwa-convert** | You want the full conversion. The orchestrator: audits, presents findings, sequences the applicable area skills, and refuses to declare done without runtime evidence. | Whole catalog via section ownership + `pwa-audit`/`pwa-verify` |

## Completion gate

| Skill | When it applies | Catalog scope |
|---|---|---|
| **pwa-verify** | Before claiming any PWA work is done. Runs the scanner, the Playwright runtime probes, and the deploy A→B harness together and renders one combined, honest report. No completion claim is valid without a fresh green run from this skill. | Runs every implemented rule and probe |

## Area fix skills

| Skill | When it applies | Catalog scope |
|---|---|---|
| **pwa-shell** | The app should feel installed: persistent tab bar, header compaction, sidebar→drawer, scroll restoration, hardware back, overlay stacking, safe-area chrome. | §2 app-shell (P-201..P-210) + P-547 |
| **pwa-native-feel** | The app "reads as a website" on iOS: rubber-band overscroll, grey tap flash, latched hover, 100vh cutoffs, notch/safe-area gaps, double-tap and input-focus zoom, wrong mobile keyboard. | §1 iOS/WebKit (P-101..P-126) + §9 forms (P-901..P-908) |
| **pwa-manifest** | Won't install, wrong icon, wrong launch colour, or a manifest that lints but browsers reject: icon generation **and** pixel-level verification, theming, splash, install flow on both platforms. | §4 manifest (P-401..P-417) + theming (P-548, P-1001..P-1005) |
| **pwa-offline** | Service-worker strategy and the update path: lazy-chunk 404s after deploy, cache versioning, offline fallback, version skew across deploys, and the CDN/deploy headers that pin a broken worker. The highest-stakes area — a wrong SW can trap the fix behind the cache. | Service-worker (P-501..P-519, P-549, P-560..P-561), version-skew (P-520..P-531), build-deploy (P-562, P-1101..P-1105) |
| **pwa-responsive** | Horizontal overflow, the mobile breakpoint sweep, small touch targets, layout shift, and first-load weight measured on a real phone. | §3 responsive (P-301..P-310) + §6 performance (P-601..P-611) |
| **pwa-rtl** | Make a UI correct — not just flipped — right-to-left: logical properties, bidi isolation, mirrored icons, `dir`/`lang`, Arabic-capable fonts, localised numerals. | §8 RTL & i18n (P-801..P-808) |
| **pwa-a11y** | Stop "app feel" changes from becoming accessibility regressions: keep pinch-zoom, restore focus styles, name icon buttons, real buttons, focus trapping in overlays, gate motion, label inputs. | §7 accessibility (P-701..P-712) |
| **pwa-auth-state** | Auth, anonymous state, or account continuity differs across installed PWA / browser / in-app browser: redirect-safe OAuth, cold installed sessions, cart/state merge, cross-tab logout, storage migrations, identity-change privacy. | P-540..P-546 (coordinates with `pwa-offline` version-skew) |
| **pwa-push-permissions** | Adding or repairing Web Push, notification consent, or other gesture-gated capabilities: installed-iOS gating, provider-neutral subscriptions, foreground/background delivery, notification clicks, denied recovery, token cleanup. | P-118, P-549..P-552 |
| **pwa-runtime-resilience** | A PWA breaks after backgrounding, loses realtime connections or offline writes, leaks media, or turns failures into a blank screen: resume/refetch, reconnect backoff, mutation outboxes, media cleanup, error boundaries, privacy-safe telemetry. | P-553..P-559, P-563 |

Section ownership is declared in
[`pwa-convert/references/catalog-ownership.json`](../skills/pwa-convert/references/catalog-ownership.json):
every catalog section is assigned one primary skill. CI rejects a new section that has no owner,
no affirmative orchestrator route, or no corresponding lesson in the owner skill — the map cannot
silently drift out of sync with the catalog.

## Claude vs Codex layout

The same skills install into both agent layouts; only the destination differs.
`install.sh --dry-run` prints the exact path it will use.

- **Claude** (`--target claude`, the default): installs into `~/.claude/skills`, or into
  `$CLAUDE_SKILLS_DIR` if set, or `$CLAUDE_HOME/skills`.
- **Codex** (`--target codex`): installs into `$CODEX_SKILLS_DIR` if set, otherwise
  `$CODEX_HOME/skills` (default `~/.codex/skills`).
- **Explicit** (`--dest /path`): installs into any directory you name; it need not live inside
  your app repo.

In every layout the installer places the skill directories alongside a private
`.pwa-skill-suite/` runtime that holds the catalog, scanner, probes, and (once enabled) the
Playwright dependencies. The skills resolve that runtime by walking up from their own location,
so a sibling checkout or unrelated parent `packages/` directory can never shadow it.

## Standalone vs superpowers

Every skill **works standalone** — its guidance is self-contained and it never hard-fails on a
missing plugin. When the [`superpowers`](https://github.com/obra/superpowers) plugin is available
in the session, the skills use it — detected **by capability** (is the skill invocable right
now?), never by sniffing plugin paths — so the integration survives plugin-layout changes.
`test-driven-development` (each entry's probe *is* the failing test) and
`verification-before-completion` (no done-claim without a green `pwa-verify`) are the two most
load-bearing integrations.
