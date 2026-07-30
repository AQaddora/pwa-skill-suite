---
name: pwa-rtl
description: Use to make a UI work correctly right-to-left for Arabic (and other RTL locales) — logical CSS properties, bidi isolation of embedded LTR runs, mirrored directional icons, dir/lang attributes, Arabic-capable fonts, and localised numerals. Fixes §8 RTL & i18n (P-801..P-808). Trigger phrases: "add RTL support", "make it work in Arabic", "layout is backwards in RTL", "the back arrow points the wrong way", "phone numbers scramble inside Arabic text", "font shows tofu for Arabic", "mixed English and Arabic reorders wrong".
---

# pwa-rtl

Makes the app correct — not just flipped — in right-to-left locales. Covers §8
(**P-801..P-808**).

**Audit first:**

```bash
node skills/pwa-audit/scripts/run-audit.mjs <path-to-app>
```

Static detection catches physical CSS properties (P-801) and hardcoded strings well;
mirroring and bidi correctness are `visual` — they need a rendered RTL pass. `pwa-verify`
runs an RTL pass at runtime; several entries here are only truly confirmable that way (P-1207).

## What it fixes

- **P-801** — **logical properties, not physical.** `margin-inline-start`,
  `padding-inline-end`, `inset-inline-start`, `text-align: start`. In Tailwind: `ms-*`/`me-*`/`ps-*`/`pe-*`,
  never `ml-*`/`mr-*`. Physical-direction CSS stays LTR-shaped inside an Arabic UI. This is
  the single highest-yield RTL fix and is statically enforced by the scanner.
- **P-803** — set `dir` and `lang` on `<html>` (and any locale-scoped subtree) to match the
  active locale. Missing them breaks the bidi algorithm and screen-reader pronunciation —
  do this **first**, it's the precondition for everything else rendering correctly.
- **P-804** — wrap embedded LTR runs (phone numbers, `+970`, URLs, latin brand names) in
  `<bdi>` / `unicode-bidi: isolate` so they don't reorder wrongly inside Arabic text.
- **P-802** — mirror direction-bearing glyphs (back chevrons, "next" arrows). **Never**
  mirror logos, media/play controls, or clocks.
- **P-805** — enforce Arabic-capable faces — **Tajawal / Cairo / IBM Plex Sans Arabic**
  (the standing modern-fonts rule) with an explicit Arabic subset. A system fallback gives
  inconsistent weights, broken ligatures, and tofu.
- **P-806** — drive slide/transition direction from the active `dir`, not a hardcoded LTR
  assumption (drawers must enter from the correct edge; "next" must not run backwards).
- **P-807** — route all user-facing text through the i18n layer (`t()` calls); no raw
  literal strings in components, or it never localises.
- **P-808** — format numerals/dates/currency with `Intl.NumberFormat` /
  `Intl.DateTimeFormat` (or the app's i18n layer) consistently — not a mix of Arabic-Indic
  and Latin digits within one screen.

## Order of operations

1. **P-803** — set `dir`/`lang`. Nothing below renders correctly until the document knows its direction.
2. **P-801** — convert physical → logical properties (the bulk of the work; the scanner lists the sites).
3. **P-807 / P-808** — route strings and number/date formatting through i18n.
4. **P-804 / P-802 / P-805 / P-806** — bidi isolation, icon mirroring, fonts, directional motion.

## Standalone vs superpowers

Works standalone. When `superpowers` is available (detect **by capability** — is
`test-driven-development` invocable now? — never by path-sniffing):

- **`test-driven-development`** — write the probe (set `dir=rtl`, assert no physical
  `margin-left`/`right` leaks into layout, assert embedded LTR runs stay intact), watch it
  fail, fix, watch it pass.
- **`verification-before-completion`** / `pwa-verify` — the done-gate. Switch the app to
  RTL / an Arabic locale and re-check layout before claiming done (P-1207); mirroring and
  bidi correctness are visual and won't show in a static pass.

Absent superpowers: set `dir="rtl"` (and an Arabic locale), then walk the app — check
alignment, drawer entry edge, back-arrow direction, phone-number/URL rendering inside Arabic
paragraphs, and that no text renders as tofu.
