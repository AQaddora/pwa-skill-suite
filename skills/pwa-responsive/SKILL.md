---
name: pwa-responsive
description: 'Use to hunt horizontal overflow, sweep the mobile breakpoint set, fix small touch targets and layout shift, and cut first-load weight on real phones — fluid widths, string wrapping, table wrappers, image dimensions, code splitting, and mobile-throttled perf budgets. Fixes §3 responsive (P-301..P-310) and §6 performance (P-601..P-611). Trigger phrases: "page scrolls sideways on mobile", "fix horizontal overflow", "check all the breakpoints", "touch targets too small", "images cause layout shift", "bundle is too big", "slow on mid-range Android", "content jumps as it loads".'
---

# pwa-responsive

Kills the most common mobile defect (horizontal overflow), enforces the canonical
breakpoint sweep and touch-target minimums, and trims first-load weight measured on a real
phone rather than an M-series laptop. Covers §3 (**P-301..P-310**) and §6 (**P-601..P-611**).

**Audit first:**

```bash
node "<pwa-audit-skill-dir>/scripts/run-audit.mjs" "<path-to-app>"
```

Resolve `<pwa-audit-skill-dir>` from the selected `pwa-audit/SKILL.md`, not from the target
repository.

Overflow and touch-target sizing are `runtime` in the catalog — `scrollWidth`/`clientWidth`
and computed box sizes only exist once the page is laid out. A finding must **name the
offending element**; "the page overflows" is not actionable. The runtime pack (`pwa-verify`)
provides element geometry; CLS still requires a separately configured metric/audit and must
remain `UNVERIFIED` when none ran.

## §3 — Responsive layout

- **P-301** — horizontal overflow, the single most common mobile defect. At
  **320/360/390/430** assert `document.scrollingElement.scrollWidth <= clientWidth`, and on
  failure walk the DOM for the box exceeding the viewport. Fix its source, which is almost
  always one of P-107, P-302, P-303, P-304, P-305.
- **P-302** — fluid widths + `max-width`, not hardcoded `width: 375px` / `w-[420px]`.
  (Small fixed widths — icons, avatars — are legitimate; only layout-scale widths are findings.)
- **P-303** — `min-width: 0` (or `overflow: hidden`) on flex/grid children that must
  truncate; `min-height: 0` on column axes. Flex items default to `min-width: auto` and refuse to shrink.
- **P-304** — `overflow-wrap: anywhere` / `word-break: break-word` on user-content
  containers (URLs, tokens, wallet addresses blow out the width otherwise).
- **P-305** — wrap wide `<table>` in an `overflow-x: auto` container (never let the page
  scroll sideways), or switch to a card layout below the breakpoint.
- **P-306** — test the canonical width set — **320, 360, 390, 430, 768, 1024** — plus
  landscape. Designing at ~390px and stopping is the classic miss (320 = SE/older Android, 430 = Pro Max).
- **P-307** — design and test the shell chrome and modals at landscape heights, not just portrait.
- **P-308** — interactive elements ≥ **44×44 CSS px** (Apple HIG) / 48dp (Material), including padding. Icon-only buttons are the usual offender.
- **P-309** — intrinsic `width`/`height` or `aspect-ratio` on images; `loading="lazy"` below the fold, `fetchpriority="high"` for the LCP image. Prevents the CLS spike.
- **P-310** — `rem` for type/spacing that should scale with the user's accessibility text-size; keep `text-size-adjust` sane.

## §6 — Performance on real phones

- **P-601** — split routes/heavy components into lazy chunks (`import()` / `React.lazy`) so first load ships only what's needed.
- **P-602** — `font-display: swap` on `@font-face` and preload the primary font file (avoids invisible-text FOIT on cellular).
- **P-603** — import icons individually / via a tree-shakeable subpath, not a whole-library barrel (`import * from 'lucide-react'`).
- **P-604** — responsive `srcset`/`sizes`, AVIF/WebP, lazy-load below the fold, `fetchpriority=high` on the LCP image.
- **P-605** — animate `transform`/`opacity` only, never layout properties (`width`/`height`/`top`/`left`/`margin`) — guaranteed jank on mid-range Android.
- **P-606** — apply `will-change` narrowly, right before an animation, and remove it after. Each one is a permanent compositor layer; mobile GPU memory isn't free.
- **P-607** — virtualise long lists, or at minimum `content-visibility: auto`. 1,000 DOM rows freezes low-end devices.
- **P-608** — keep components server-rendered/static by default; opt into client hydration only where interactivity is actually needed.
- **P-609** — load third-party scripts (analytics, chat, ads) with `async`/`defer` or after first paint, not synchronously in `<head>`.
- **P-610** — reserve space for install prompts / cookie banners (skeleton/placeholder) or render them as overlays — a banner injected above content is a self-inflicted CLS spike.
- **P-611** — measure the perf budget with **mobile CPU throttling (4–6×)** and a throttled network, not on your laptop (P-1209).

## Standalone vs superpowers

Works standalone. When `superpowers` is available (detect **by capability** — is
`test-driven-development` invocable now? — never by path-sniffing):

- **`test-driven-development`** — write the probe (assert `scrollWidth <= clientWidth`
  across the width set; assert every interactive box ≥ 44×44; assert a CLS budget), watch
  it fail, fix, watch it pass.
- **`verification-before-completion`** / `pwa-verify` — the done-gate. Overflow, touch
  targets, and CLS are runtime — require a green report across the canonical width set
  (P-306, P-1202), not a single-viewport check.

Absent superpowers: resize DevTools to each width in the set (portrait + landscape),
watch for a horizontal scrollbar, tap-test icon buttons, and run Lighthouse mobile with CPU
throttling on.
