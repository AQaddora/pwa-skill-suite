---
name: pwa-native-feel
description: Use when an app "reads as a website" on iOS — rubber-band overscroll, grey tap flash, latched hover, 100vh cutoffs, notch/safe-area gaps, double-tap zoom, input-focus zoom, or the wrong mobile keyboard on forms. Fixes §1 iOS/WebKit (P-101..P-125) and §9 forms (P-901..P-908). Trigger phrases: "make it feel native on iOS", "fix the safe area / notch", "100vh is cutting off the bottom", "stop the grey tap highlight", "input zooms when I focus it", "wrong keyboard for the phone field", "OTP autofill isn't working".
---

# pwa-native-feel

Hardens the iOS/WebKit surface and the mobile keyboard so an installed app stops
telegraphing "web page". Covers §1 (**P-101..P-125**) and §9 (**P-901..P-908**).

**Audit first** — many of these are static-detectable and already flagged:

```bash
node skills/pwa-audit/scripts/run-audit.mjs <path-to-app>
```

## Two corrections this skill actively enforces (design §8)

These invert requests you will receive. Be explicit, not quietly compliant.

1. **Never disable pinch zoom.** This skill **refuses to emit** `user-scalable=no` /
   `maximum-scale=1` and **fails on sight** if it finds them (**P-701**). It is a WCAG
   1.4.4 failure *and* iOS Safari ignores it anyway — it harms users without even working.
   - Input-focus zoom is fixed with **≥16px computed font-size** on controls (**P-101**), never by disabling zoom.
   - Double-tap zoom is suppressed with `touch-action: manipulation` on interactive elements (**P-110**) — do **not** justify it as "300ms delay removal"; that delay is already gone in modern browsers.
2. **`user-select: none` on chrome only** (nav, tab bar, buttons, headers), never globally
   (**P-111**, **P-702**). Real content (messages, articles, code, addresses) stays
   `user-select: text`. Global application breaks copy and degrades assistive tooling.

## §1 — iOS Safari & WebKit

| ID | Fix |
|---|---|
| **P-101** | Computed `font-size >= 16px` on every `input`/`select`/`textarea`. Shrink with padding/line-height, not font-size. (Device-only to *prove*; fix in source.) |
| **P-102** | `100dvh` with a `100vh` fallback, or the `--vh` custom-property pattern. Know the family: `svh`/`lvh`/`dvh`. `h-screen` is legitimate inside a fixed shell — don't blanket-replace. |
| **P-103** | `viewport-fit=cover` **and** every edge-anchored `position: fixed` element references the matching `env(safe-area-inset-*)`; add `-left`/`-right` in landscape. |
| **P-104** | Drive the fixed bottom bar/composer offset from the VisualViewport API, or `interactive-widget=resizes-content` where supported. |
| **P-105** | `overscroll-behavior: none` on the scroll root; give `html, body` the app background. |
| **P-106** | `overscroll-behavior-y: contain` on the scroller so browser pull-to-refresh doesn't fight the app's. |
| **P-107** | Replace `100vw`/`w-screen` with `width: 100%` / `100dvw` / `max-width: 100%` (the `100vw` scrollbar gutter causes sideways drag). |
| **P-108** | `-webkit-tap-highlight-color: transparent` **paired with a real `:active` state** — removing the flash without feedback is its own P2. |
| **P-109** | Wrap hover-dependent styles in `@media (hover: hover) and (pointer: fine)` so they don't latch on touch. (Check Tailwind's `hoverOnlyWhenSupported` before flagging.) |
| **P-110** | `touch-action: manipulation` on interactive elements (see correction #1). |
| **P-111** | Chrome/content `user-select` split (see correction #2). |
| **P-112** | `-webkit-touch-callout: none` on UI imagery and icon links (keep it on user content where "save image" is desirable). |
| **P-113** | Every scroll lock `matchMedia`-gated with a resize listener, or fixed-body + scroll-restore. **Never** unconditional `body.style.overflow='hidden'` — the single highest-yield static check in the suite. |
| **P-114** | Do **not** add `-webkit-overflow-scrolling: touch`; it's obsolete since iOS 13 and causes stacking-context bugs. Remove it if present. |
| **P-115** | Every route deeper than a tab root renders an in-app back affordance, verified against `matchMedia('(display-mode: standalone)')`. |
| **P-116** | Keep in-scope navigation in-app; open genuinely external links with explicit intent (`target="_blank" rel="noopener"`). |
| **P-117** | Persist critical state on `visibilitychange`→`hidden`/`pagehide`; rehydrate on load. Never rely on the process surviving backgrounding. |
| **P-118** | Feature-detect Web Push (`'PushManager' in window` + standalone), gate the UI, give iOS the Add-to-Home-Screen path first. |
| **P-119** | Two install paths: Chromium `beforeinstallprompt` **and** an iOS Safari Add-to-Home-Screen instruction sheet. (See `pwa-manifest`.) |
| **P-120** | 180×180 opaque `apple-touch-icon` PNG, no alpha, no rounded corners. (See `pwa-manifest`.) |
| **P-121** | `apple-touch-startup-image` per device, or accept the `background_color` splash — matched to the app background (P-1003). |
| **P-122** | Set `apple-mobile-web-app-status-bar-style` to match the theme; if `black-translucent`, satisfy P-103 or content slides under the status bar. |
| **P-123** | `type="tel"` or `inputmode="numeric" pattern="[0-9]*"` for phone/OTP/PIN — never `type="number"` (spinners, wheel changes, strips leading zeros). OTP adds `autocomplete="one-time-code"`. |
| **P-124** | Accept the native iOS wheel picker for `date`/`time` inputs, or build a fully custom component — don't style the native control as a div. |
| **P-125** | `autocapitalize="none" autocorrect="off" spellcheck="false"` on email/username/code fields. |

## §9 — Forms & the mobile keyboard

| ID | Fix |
|---|---|
| **P-901** | Correct `type`/`inputmode` per field (email, tel, numeric, decimal, search, url). |
| **P-902** | `autocomplete` tokens on every relevant field — critically `autocomplete="one-time-code"` for iOS SMS OTP autofill. |
| **P-903** | Scroll the focused element into view on `focus`, accounting for the visual viewport (same API as P-104). |
| **P-904** | Drive a fixed submit CTA's position from the VisualViewport API (or reserve keyboard-safe space) so the keyboard never buries it. |
| **P-905** | `enterkeyhint` set to the action (go/search/send/next) per field. |
| **P-906** | Enter submits the form (native submit or an explicit keydown handler). |
| **P-907** | OTP inputs handle a **paste** event by distributing the code across boxes (or use one input styled as boxes). |
| **P-908** | Validate inline (on blur/change) with styled messages; suppress/replace native validation bubbles (`novalidate` + custom UI). |

## Standalone vs superpowers

Works standalone. When `superpowers` is available (detect **by capability** — is
`test-driven-development` invocable now? — never by path-sniffing):

- **`test-driven-development`** — write the probe (focus a control and assert
  `visualViewport.scale === 1` and computed `font-size >= 16px`; assert
  `document.scrollingElement.scrollWidth <= clientWidth` at 320/360/390/430), watch it
  fail, fix, watch it pass.
- **`verification-before-completion`** / `pwa-verify` — the done-gate. Note P-101, P-104,
  P-111, P-117, P-121 are **device-only**: they report `UNVERIFIED` in CI (Playwright
  WebKit is not iOS Safari) and must be confirmed on a real iPhone. Never mark them PASS.

Absent superpowers: fix in source, then verify on a real iOS device — focus each input
(no zoom), drag past the top (no background reveal), long-press chrome vs content.
