# The PWA / Frontend AI-Mistake Catalog

Every failure mode an AI coding agent reliably introduces when turning an existing
web app into a mobile PWA — and how to *detect* each one automatically.

This is the source of truth the skill suite is built on. Each entry is written so a
verifier can be generated from it mechanically.

_This file is generated from `packages/catalog/catalog.json` by
`packages/catalog/generate-md.mjs`. Do not hand-edit — edit the catalog entries and
regenerate._

---

## How to read an entry

```
### <ID> · <one-line failure>            [severity] [detection]
AI writes:   what the agent actually produces
Breaks:      the real-world symptom, and why
Correct:     the fix that actually works
Detect:      the concrete assertion that catches it
```

**Severity**

| | meaning |
|---|---|
| **P0** | App is broken, uninstallable, unusable, or serves stale/dead code. Ship-blocker. |
| **P1** | Users immediately feel "this is a website in a box, not an app". |
| **P2** | Polish. Noticed by good testers and by you. |

**Detection channel**

| | method |
|---|---|
| **[S]** | Static — source/AST/CSS scan. No browser. Fast, runs on every save. |
| **[R]** | Runtime — Playwright assertion in a mobile WebKit/Chromium context. |
| **[L]** | Lighthouse / manifest / SW audit. |
| **[V]** | Visual regression snapshot at mobile widths. |
| **[D]** | **Real device only** — emulation cannot prove it. Must be flagged as unverifiable in CI, never silently "passed". |

The **[D]** class matters more than it looks. Playwright's WebKit is *not* iOS Safari —
it does not run the iOS input-zoom heuristic, the URL-bar viewport collapse, the
home-screen icon pipeline, or ITP storage eviction. Any suite that claims to verify
those in CI is lying. The honest design reports them as `UNVERIFIED (device-only)`.

---


# §1 · iOS Safari & WebKit

### P-101 · Input focus zooms the whole page   [P1] [R][D]
**AI writes:** <input class="text-sm">` / `font-size: 14px` on form controls.
**Breaks:** iOS Safari auto-zooms any focused control whose computed font-size < 16px, then never zooms back. The app instantly reads as a website.
**Correct:** Computed font-size >= 16px on every input, select, textarea. If the design needs smaller text, shrink with padding/line-height, not font-size. Do not fix this by disabling zoom (see P-701).
**Detect:** Reclassified: computed font-size cannot be read from source alone (Tailwind/CSS cascade + inheritance resolve it at render time). Phase 2 will implement this as a computed-style/DOM sweep: focus each control, assert visualViewport.scale === 1, and read computed font-size directly. [D] real iOS confirm.

### P-102 · `100vh` is wrong on mobile   [P1] [S][R]
**AI writes:** `h-screen`, `min-h-screen`, `height: 100vh`.
**Breaks:** iOS `vh` is sized to the expanded viewport, ignoring the URL bar. Bottom content and fixed CTAs sit below the fold; a full-height layout scrolls when it shouldn't.
**Correct:** `100dvh` with a `100vh` fallback for old engines; or the `--vh` JS custom-property pattern where `dvh` isn't viable. Know the family: `svh` (smallest/URL-bar-visible), `lvh` (largest), `dvh` (dynamic).
**Detect:** [S] flag `100vh` / `h-screen` in any layout-critical rule. [R] assert no vertical overflow with the URL bar simulated. Advisory: `h-screen` is legitimate inside a fixed shell — flag, don't fail.

### P-103 · Safe-area insets ignored (notch + home indicator)   [P0] [S][R][V]
**AI writes:** A fixed bottom tab bar with `padding-bottom: 12px`; no `viewport-fit=cover`.
**Breaks:** The tab bar sits under the home indicator and is partly untappable; the header hides behind the notch/Dynamic Island.
**Correct:** `<meta name="viewport" content="... viewport-fit=cover">` and `padding-bottom: calc(12px + env(safe-area-inset-bottom))` on the bottom bar, `env(safe-area-inset-top)` on the header, plus `-left`/`-right` in landscape.
**Detect:** [S] `viewport-fit=cover` present AND every `position: fixed` edge-anchored element references the matching `env(safe-area-inset-*)`. [V] snapshot on a notched device profile. Advisory: matching an element's anchored edge to the right inset is a bundled heuristic, not a single crisp match.

### P-104 · Fixed bottom bar breaks when the keyboard opens   [P1] [R][D]
**AI writes:** `position: fixed; bottom: 0` for the composer / CTA.
**Breaks:** iOS does not resize the layout viewport for the virtual keyboard. The bar stays pinned to the old bottom — floating behind or over the keyboard.
**Correct:** Drive the offset from the VisualViewport API (`visualViewport.height`, `offsetTop`, `resize` + `scroll` events), or use `interactive-widget=resizes-content` in the viewport meta where supported.
**Detect:** [R] simulate keyboard, assert bar's bounding box stays above the visual viewport bottom. [D] real device is authoritative.

### P-105 · Rubber-band overscroll reveals the page background   [P1] [S]
**Breaks:** Dragging past the top/bottom shows the browser/body background behind your "app" — the single biggest tell that it's a web page.
**Correct:** `overscroll-behavior: none` on the scroll root; give `html, body` the app background; for a true app shell use the fixed-body pattern with a single internal scroller.
**Detect:** [S] assert `overscroll-behavior` set on the scroll container.

### P-106 · Browser pull-to-refresh fights in-app pull-to-refresh   [P1] [S][R]
**Breaks:** The browser's native pull-to-refresh gesture fires alongside the app's own in-app pull-to-refresh, so pulling down triggers a full page reload instead of (or on top of) the in-app refresh.
**Correct:** `overscroll-behavior-y: contain` on the scroller.
**Detect:** [S] scanner. [R] assert a top overscroll gesture does not trigger navigation reload.

### P-107 · `100vw` causes horizontal scroll   [P1] [S][R]
**AI writes:** `w-screen` / `width: 100vw`.
**Breaks:** `100vw` includes the scrollbar gutter, causing a few px of horizontal scroll, which on mobile becomes a visible sideways drag of the whole app.
**Correct:** `width: 100%` / `100dvw`, or `max-width: 100%`.
**Detect:** [S] flag `100vw`. [R] assert `document.scrollingElement.scrollWidth <= clientWidth` at 320/360/390/430px.

### P-108 · Grey tap flash on every touch   [P2] [S]
**Breaks:** Every touch on an interactive element shows Safari's default grey tap-highlight flash, which reads as unpolished/web-like — and removing it without a real `:active` state removes touch feedback entirely.
**Correct:** `-webkit-tap-highlight-color: transparent` on interactive elements, paired with a real `:active` state so feedback isn't lost.
**Detect:** [S] scanner; also assert a visible `:active` style exists (removing the flash without replacing it is its own P2).

### P-109 · `:hover` styles latch on touch   [P1] [S]
**AI writes:** `hover:bg-slate-100` everywhere.
**Breaks:** On touch, hover state applies on tap and stays until you tap elsewhere — buttons look permanently selected.
**Correct:** Wrap hover-dependent styles in `@media (hover: hover) and (pointer: fine)`.
**Detect:** [S] flag hover rules that carry visual state and aren't hover-media-gated. Advisory: must detect Tailwind's `hoverOnlyWhenSupported` config before flagging, or every hover rule false-positives.

### P-110 · Double-tap zoom + legacy tap delay   [P1] [S]
**Breaks:** Interactive elements lack `touch-action: manipulation`, so taps can trigger the browser's double-tap-to-zoom gesture. Historically this class of fix was framed around a ~300ms tap delay, but that delay is already gone in modern browsers given a correct viewport meta — the property's real remaining value today is suppressing double-tap zoom.
**Correct:** Add `touch-action: manipulation` to interactive elements to suppress double-tap zoom. The 300ms delay itself is no longer an issue in modern browsers with a correct viewport meta; don't cite delay-removal as the justification.
**Detect:** [S] scanner on buttons/links/tappables.

### P-111 · Long-press selects UI text   [P1] [R]
**AI writes:** Nothing — or, worse, `user-select: none` on `*`.
**Breaks:** Long-pressing a tab label or button selects it and pops the iOS selection bubbles. Feels like a webpage.
**Correct:** `user-select: none` on chrome only (nav, tab bar, buttons, headers) and explicitly `user-select: text` on real content (messages, articles, code, addresses). Never global.
**Detect:** Reclassified: whether chrome/content is correctly split requires resolving `user-select` across the cascade for every selector, not a single source match. Phase 2 will implement this as a computed-style/DOM sweep: assert content is selectable and chrome is not.

### P-112 · Long-press pops the iOS callout menu on images/links   [P2] [S]
**Breaks:** Long-pressing UI imagery or icon links pops iOS's callout menu (Copy/Save/Look Up), which feels like a webpage rather than an app for chrome elements.
**Correct:** `-webkit-touch-callout: none` on UI imagery and icon links (keep it on user content where "save image" is desirable).
**Detect:** [S] scanner.

### P-113 · `position: sticky` silently dies   [P0] [S]
**AI writes:** An unconditional `document.body.style.overflow = 'hidden'` scroll lock on mount.
**Breaks:** Sticky needs an unconstrained ancestor scroll context. Locking body overflow kills sticky headers, deadens mobile scroll, and makes dropdowns unreachable — three "unrelated" bugs from one line.
**Correct:** Gate every scroll lock behind `matchMedia('(min-width: 768px)')` with a resize listener, or use the fixed-body + scroll-restore pattern. Never unconditional.
**Detect:** [S] grep `body.style.overflow`, `documentElement.style.overflow`, `scrollLock`, `overflow-hidden` applied to body — assert each is media-gated. This is the single highest-yield static check in the suite.

### P-114 · Momentum scroll lost in nested scrollers   [P2] [S]
**Breaks:** Nested scroll containers lose momentum scrolling on iOS. Historically `-webkit-overflow-scrolling: touch` was applied as the fix, but the property has been obsolete since iOS 13 and can itself cause stacking-context bugs — it should not be added on modern iOS.
**Correct:** No action needed on modern iOS; avoid adding `-webkit-overflow-scrolling: touch` — it can cause stacking-context bugs. Historical note only. Prefer avoiding nested scroll containers where possible.
**Detect:** No detect method documented in the source entry. The honest check is a presence grep flagging `-webkit-overflow-scrolling: touch` as an anti-pattern to remove, not a fix to require.

### P-115 · No back button in standalone mode   [P0] [R]
**Breaks:** Installed iOS PWAs have no browser chrome. If the design assumed the browser back button, users are trapped on any detail route.
**Correct:** Every route deeper than a tab root renders an in-app back affordance; verify against `matchMedia('(display-mode: standalone)')`.
**Detect:** Reclassified: standalone display-mode is a runtime-only client condition (`matchMedia('(display-mode: standalone)')`), invisible to source. [R] launch in standalone display-mode, walk every route, assert a back control or tab-root status.

### P-116 · External links eject the user from the PWA   [P1] [S][R]
**Breaks:** On iOS, an out-of-scope link opens Safari and the user loses app state with no way back.
**Correct:** Keep in-scope navigation in-app; open genuinely external links with explicit intent (`target="_blank" rel="noopener"`) and warn, or render in-app.
**Detect:** [S] enumerate anchors, flag out-of-scope hrefs without explicit external handling. Advisory: marketing links are legitimately external — one of the suite's FP-heaviest checks.

### P-117 · State lost when the PWA is backgrounded   [P1] [R][D]
**Breaks:** iOS aggressively evicts backgrounded web apps; relaunch is a cold start. In-memory state and unsaved forms vanish.
**Correct:** Persist critical state on `visibilitychange` -> `hidden` / `pagehide`, rehydrate on load. Never rely on the process surviving.
**Detect:** [R] simulate `pagehide`/reload, assert state restored. [D] real backgrounding.

### P-118 · Web Push written as if iOS supports it like Chrome   [P1] [S][R]
**Breaks:** iOS supports Web Push only 16.4+, only when installed to the Home Screen, and only after a user-gesture permission request. Agents ship a Chrome-shaped flow that silently no-ops on iOS.
**Correct:** Feature-detect (`'PushManager' in window` + standalone check), gate the UI, and give iOS users the Add-to-Home-Screen path first.
**Detect:** [S] assert push registration is feature-detected and gesture-bound, not called on load. Advisory: this is an absence-of-guard heuristic, not a single literal match.

### P-119 · Install button that never appears on iOS   [P1] [S][R]
**AI writes:** `beforeinstallprompt` handler and an "Install app" button.
**Breaks:** `beforeinstallprompt` does not exist in Safari. iOS users see nothing, or a dead button.
**Correct:** Two paths — Chromium: capture the deferred prompt, call `.prompt()` inside a user gesture. iOS: detect Safari + not-standalone and show an Add-to-Home-Screen instruction sheet (Share -> Add to Home Screen).
**Detect:** [S] check for a distinct iOS fallback code path alongside the Chromium `beforeinstallprompt` handler. [R] in a WebKit context, assert an install affordance still renders and is the iOS variant.

### P-120 · Apple touch icon missing or transparent   [P0] [S][L]
**Breaks:** iOS historically ignores manifest icons for the Home Screen; without `<link rel="apple-touch-icon">` you get a blurry screenshot of the page. Transparent PNGs composite to black.
**Correct:** 180x180 opaque PNG at `apple-touch-icon`, no alpha, no rounded corners (iOS masks it).
**Detect:** [S] tag present. [L] fetch the asset, assert exact 180x180, assert no alpha channel.

### P-121 · White flash on launch (no iOS splash)   [P2] [S][D]
**Breaks:** No iOS splash screen is configured (no `apple-touch-startup-image` and no consistent `background_color`), so there's a white flash on launch before the app's own UI paints.
**Correct:** `apple-touch-startup-image` per device via media queries, or accept the `background_color` splash — but make it match the app background (see P-1003).
**Detect:** [S] presence check + `background_color` consistency. [D] real launch confirms the actual flash.

### P-122 · Status bar style unset   [P2] [S]
**Breaks:** The `apple-mobile-web-app-status-bar-style` meta tag is left unset, so the status bar doesn't match the app's theme — and if `black-translucent` is used without safe-area handling, content slides under the status bar.
**Correct:** `<meta name="apple-mobile-web-app-status-bar-style">` chosen to match the theme (`default` / `black` / `black-translucent`). `black-translucent` requires safe-area handling or content slides under the status bar.
**Detect:** [S] tag present; if `black-translucent`, assert P-103 compliance.

### P-123 · `type="number"` used for phone / OTP / PIN   [P1] [S]
**Breaks:** Spinner arrows, scroll-wheel value changes, silently strips leading zeros, and gives the wrong keyboard.
**Correct:** `type="tel"` or `inputmode="numeric" pattern="[0-9]*"`. For OTP add `autocomplete="one-time-code"`.
**Detect:** [S] flag `type="number"` on non-quantity fields. Advisory: "non-quantity" is a semantic classification of the field, not a literal match.

### P-124 · Native date/time controls styled as if they were divs   [P2] [S][V]
**Breaks:** iOS renders its own wheel picker; custom borders/heights don't apply and the control looks broken.
**Correct:** Accept the native iOS wheel-picker chrome for date/time inputs rather than fighting it with custom CSS, or build a fully custom picker component instead of styling the native control.
**Detect:** No detect method documented in the source entry. [S] heuristic: flag heavy custom CSS (borders/height/appearance overrides) applied directly to `<input type=date|time|datetime-local>`. [V] snapshot confirms the actual broken rendering on iOS.

### P-125 · iOS auto-capitalises the email field   [P2] [S]
**Breaks:** Email/username/code fields get auto-capitalised, auto-corrected, and spell-checked by iOS, corrupting the entered value.
**Correct:** `autocapitalize="none" autocorrect="off" spellcheck="false"` on email/username/code fields.
**Detect:** [S] scanner keyed on field type. Advisory: matching "email/username/code" fields is a semantic classification from name/label/type, not a literal token.

---

# §2 · App shell & navigation

### P-201 · Tab bar is a normal div in the page flow   [P0] [S][R][V]
**Breaks:** It scrolls away with the content. The #1 "this isn't an app" signal.
**Correct:** Fixed/sticky to the bottom, above content in stacking order, safe-area padded (P-103), and rendered once in a persistent shell (P-203).
**Detect:** [S] check the tab-bar component's CSS for `position: fixed`/`sticky` as a proxy. [R] scroll to the bottom of every tab route, assert the bar's box is unchanged. Advisory: the static proxy only catches literal CSS, not JS-driven positioning.

### P-202 · Content hidden behind the tab bar   [P1] [R]
**Breaks:** The last list item / submit button is permanently unreachable under the bar.
**Correct:** Scroll container gets `padding-bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom))`. Derive both from one token so they can't drift.
**Detect:** [R] assert the last focusable element in each scroller is fully visible when scrolled to the end.

### P-203 · No persistent shell — the whole page re-renders per route   [P1] [R][V]
**Breaks:** The tab bar remounts and flashes on every navigation; transitions stutter; scroll position is lost.
**Correct:** Shell layout (tab bar + header) mounted above the router outlet, only the outlet swaps.
**Detect:** [R] tag the bar node, navigate, assert the same DOM node identity survives.

### P-204 · No per-tab scroll restoration   [P1] [R]
**Breaks:** Switching tabs and back dumps you at the top of a long feed. Native apps never do this.
**Correct:** Persist scrollTop per tab; restore on re-entry; reset on explicit tab re-tap (native "tap active tab -> scroll to top" idiom).
**Detect:** [R] scroll, switch away, return, assert scrollTop restored +/-2px.

### P-205 · Desktop sidebar shipped to mobile   [P0] [S][R][V]
**Breaks:** An overlay drawer with no backdrop, no close, no focus trap, no ESC, and — often — an unconditional body scroll lock that triggers P-113.
**Correct:** Below the breakpoint the sidebar becomes a drawer with: backdrop, focus trap, ESC + backdrop-tap close, `inert` on background content, media-gated scroll lock, and a history entry so Android back closes it (P-208).
**Detect:** [S] check for a backdrop element, a focus-trap import, an ESC handler, and a media-gated scroll lock (same technique as P-113) as a bundled structural proxy. [R] open drawer at 390px, assert focus trapped, ESC closes, background `inert`, body lock is media-gated. Advisory: the static proxy bundles several independent heuristics, each with real false-negative risk.

### P-206 · Header compaction implemented with scroll jank   [P2] [S][R]
**AI writes:** A non-passive `scroll` listener reading `scrollTop` and writing styles synchronously.
**Breaks:** Layout thrash -> dropped frames on exactly the low-end devices that matter.
**Correct:** CSS scroll-driven animations where supported; otherwise a passive listener + `requestAnimationFrame` batching, or an IntersectionObserver sentinel. Never read-then-write per event.
**Detect:** [S] flag non-passive scroll listeners and sync style writes inside them. [R] assert no long tasks > 50ms during a scripted scroll. Advisory: identifying a synchronous style write inside a callback is a call-site heuristic, not a literal match.

### P-207 · Modal renders behind the fixed bar / stacking-context trap   [P0] [R]
**Breaks:** A `transform`, `filter`, `backdrop-filter`, `will-change`, or `contain` on any ancestor re-parents `position: fixed` to that ancestor. The modal is then clipped or trapped — and the agent "fixes" it with escalating z-index, which cannot work.
**Correct:** Portal overlays to `document.body` (or a top-level `#overlay-root`), or use the top layer via `<dialog>` / popover. Audit ancestors for transform-family properties.
**Detect:** Reclassified: the offending ancestor can live in any component up the tree, and identifying the actual stacking-context break requires the rendered DOM chain, not a single file's AST. Phase 2 will implement this as a computed-style/DOM sweep: assert overlay bounding box covers the viewport and sits above the tab bar.

### P-208 · Hardware/gesture back doesn't close the modal   [P1] [R]
**Breaks:** On Android, back closes the entire app instead of the sheet. On iOS the edge-swipe navigates away.
**Correct:** Push a history entry when opening an overlay; close on `popstate`.
**Detect:** [R] open overlay, `history.back()`, assert overlay closed and route unchanged.

### P-209 · Route transitions break on back navigation   [P2] [R][V]
**Breaks:** Route transitions don't account for navigation direction, so going back plays the same forward animation (or breaks entirely), and motion isn't gated behind `prefers-reduced-motion`.
**Correct:** Direction-aware transitions driven by navigation type; respect `prefers-reduced-motion` (P-707).
**Detect:** No detect method documented in the source entry. [R] navigate forward and back, assert the transition direction matches. [V] visually confirm no broken/backwards transition, and that motion is suppressed under `prefers-reduced-motion`.

### P-210 · Competing nested scroll containers   [P1] [R]
**Breaks:** Touch is captured by the wrong scroller; the page feels stuck.
**Correct:** One scroll owner per screen; `overscroll-behavior: contain` on any genuinely nested scroller.
**Detect:** Reclassified: whether nested `overflow: auto` containers are actually competing scrollers depends on rendered content overflowing at a given viewport, which source alone can't know. [R] walk the rendered DOM for nested containers that are simultaneously scrollable, and flag competing scroll owners.

---

# §3 · Responsive layout

### P-301 · Horizontal overflow   [P0] [R][V]
**Breaks:** The single most common mobile defect. Sources: `100vw` (P-107), negative margins, unbreakable strings (URLs, tokens, wallet addresses), images without `max-width: 100%`, wide tables (P-305), fixed pixel widths (P-302), `min-width` on flex children (P-303).
**Correct:** Fix the contributing sources (P-107, P-302, P-303, P-304, P-305) and eliminate any container whose content exceeds the viewport.
**Detect:** Reclassified: `scrollWidth`/`clientWidth` only exist once the page is laid out — this is unavoidably a runtime measurement, not a source-level check. [R] at 320/360/390/430px assert `scrollWidth <= clientWidth`, and on failure report the offending element by walking the DOM for boxes exceeding the viewport. A generic "page overflows" finding is not actionable; naming the node is.

### P-302 · Hardcoded pixel widths   [P1] [S]
**AI writes:** `width: 375px`, `w-[420px]`.
**Breaks:** Fixed pixel widths on layout containers don't adapt to the viewport, causing overflow or wasted space on other screen sizes.
**Correct:** Fluid widths + `max-width`.
**Detect:** No detect method documented in the source entry. [S] flag literal px widths / Tailwind arbitrary `w-[Npx]` values. Advisory: small fixed widths (icons, avatars) are legitimate; only large/layout-scale widths are real findings, which needs a size threshold.

### P-303 · Flex/grid children won't shrink   [P1] [R]
**Breaks:** Text refuses to truncate and blows out the row, because flex items default to `min-width: auto`.
**Correct:** `min-width: 0` (or `overflow: hidden`) on the shrinking child; `min-height: 0` for column axes.
**Detect:** Reclassified: whether a truncation class's flex-ancestor chain actually lacks `min-w-0` requires walking the resolved DOM/cascade across components, not a single file's AST. Phase 2 will implement this as a computed-style/DOM sweep.

### P-304 · Long unbreakable strings overflow   [P1] [S][R]
**Breaks:** User-generated unbreakable strings (URLs, tokens, wallet addresses) blow out their container's width.
**Correct:** `overflow-wrap: anywhere` / `word-break: break-word` on user-content containers.
**Detect:** No detect method documented in the source entry. [S] flag user-content containers lacking `overflow-wrap`/`word-break`. [R] confirm actual overflow with representative long content. Advisory: identifying "user-content containers" is a semantic judgment, not a literal match.

### P-305 · Tables dumped raw   [P1] [S][R]
**Breaks:** A wide `<table>` with no horizontal scroll wrapper forces the whole page to scroll sideways.
**Correct:** Wrap in an `overflow-x: auto` container (never let the page scroll sideways), or switch to a card layout below the breakpoint.
**Detect:** No detect method documented in the source entry. [S] flag `<table>` elements without an `overflow-x: auto` ancestor wrapper. [R] confirm the page itself doesn't scroll sideways. Advisory: a card-layout alternative can't be verified by structural scan alone.

### P-306 · Only tested at one width   [P1] [V]
**Breaks:** Agents design at ~390px and never check 320px (SE / older Androids) or 430px (Pro Max).
**Correct:** The suite's canonical width set — 320, 360, 390, 430, 768, 1024 — plus landscape.
**Detect:** No detect method documented in the source entry. [V] check test/snapshot configuration covers the canonical width set rather than a single viewport.

### P-307 · Landscape ignored   [P2] [V]
**Breaks:** The tab bar + header eat most of a short landscape viewport; modals become unscrollable.
**Correct:** Design and test the shell chrome and modals explicitly at landscape heights, not just portrait.
**Detect:** No detect method documented in the source entry. [V] snapshot at landscape widths/short heights; judging "eats most of the viewport" is a visual assessment.

### P-308 · Touch targets too small   [P1] [R]
**Breaks:** Interactive elements are smaller than the platform minimum tap target, most often icon-only buttons.
**Correct:** ≥ 44x44 CSS px (Apple HIG) / 48dp (Material), including padding.
**Detect:** Reclassified: the effective tap-target box depends on computed padding/box-sizing, which requires the rendered layout, not source alone. [R] measure every interactive element's box; report each violation with its selector.

### P-309 · Images cause layout shift   [P1] [S][R]
**Breaks:** Images without dimensions reflow the page as they load, causing a CLS spike.
**Correct:** Intrinsic `width`/`height` attributes or `aspect-ratio`; `loading="lazy"` below the fold, `fetchpriority="high"` for the LCP image.
**Detect:** [S] `<img>` without dimensions. [R] CLS budget.

### P-310 · Nothing scales with user font-size   [P2] [S]
**Breaks:** Everything in `px` ignores the user's accessibility text-size setting.
**Correct:** `rem` for type and spacing that should scale; keep `text-size-adjust` sane.
**Detect:** No detect method documented in the source entry. [S] flag `px` used for type/spacing that should scale with the user's font-size preference.

---

# §4 · Manifest, install & icons

### P-401 · No manifest, or not linked   [P0] [S][L]
**Breaks:** The app has no `<link rel="manifest">`, or it points somewhere unresolvable, so the browser has nothing to install from.
**Correct:** Add a valid manifest and link it: `<link rel="manifest" href="/manifest.webmanifest">`.
**Detect:** [S] `<link rel="manifest">` present and resolvable.

### P-402 · `start_url` wrong   [P0] [L]
**Breaks:** Launching the installed app lands on a 404 — classic when the app is served from a subpath, or when the agent writes `/` for an app mounted at `/app/`.
**Correct:** Absolute, in-scope, verified to return 200. Add a source param (`?source=pwa`) for analytics.
**Detect:** [L] fetch `start_url`, assert 200 and within `scope`.

### P-403 · `scope` wrong or missing   [P1] [L]
**Breaks:** In-app links fall out of scope and open in a browser tab (see P-116).
**Correct:** Set `scope` to the app's real root path and keep all in-app navigation within it.
**Detect:** No detect method documented in the source entry. [L] assert `scope` is present and matches the app's actual deployed root.

### P-404 · Missing 192 / 512 icons   [P0] [L]
**Breaks:** Chromium refuses to treat the app as installable.
**Correct:** Provide both 192x192 and 512x512 icons in the manifest, fetchable at their declared URLs.
**Detect:** [L] both sizes present, fetchable, and actually those pixel dimensions — see P-406.

### P-405 · No `maskable` icon → logo cropped into a circle   [P1] [L]
**AI writes:** The same PNG listed for both `"purpose": "any"` and `"maskable"`.
**Breaks:** Android applies a mask; a full-bleed logo loses its edges — usually decapitating the wordmark.
**Correct:** A separate maskable asset with the logo inside the 40% safe zone (centred circle of radius 40% of the icon), padded background to the edges.
**Detect:** [L] a maskable entry exists and is a different file from `any`; analyse pixel content outside the safe zone.

### P-406 · Declared icon size ≠ actual file size   [P0] [L]
**Breaks:** The manifest says `512x512`, the file is 192 — install prompts vanish with no error. Agents copy manifest boilerplate without generating the assets.
**Correct:** Regenerate icon assets to match every declared `sizes` entry exactly.
**Detect:** [L] decode each icon, assert the real dimensions match the `sizes` string. High-yield, trivially automatable, almost never checked.

### P-407 · Transparent icon → black square on iOS   [P0] [L]
**Breaks:** A transparent apple-touch-icon or maskable icon composites to solid black on iOS.
**Correct:** Ship opaque PNGs with no alpha channel for the apple-touch-icon and maskable icon.
**Detect:** [L] assert no alpha in the apple-touch-icon and in the maskable icon.

### P-408 · `theme_color` / `<meta name="theme-color">` mismatch or dark-mode-blind   [P1] [S][L]
**Breaks:** White status/URL bar strip above a dark app.
**Correct:** Manifest `theme_color` and `<meta name="theme-color">` with `media="(prefers-color-scheme: dark|light)"` variants, all agreeing with the actual painted background.
**Detect:** [S] cross-check the three sources (manifest `theme_color`, meta tag light/dark variants) for internal agreement.

### P-409 · `background_color` mismatched → coloured flash on launch   [P2] [L]
**Breaks:** The manifest's `background_color` doesn't match the app's true initial background, producing a visible colour flash on launch.
**Correct:** Set `background_color` to equal the app's true initial background, per colour scheme.
**Detect:** No detect method documented in the source entry. [L] compare manifest `background_color` against the rendered initial background. Advisory: colour-match comparison needs a tolerance judgment.

### P-410 · Manifest `id` missing   [P1] [L]
**Breaks:** Without a stable `id`, changing `start_url` makes the browser treat it as a different app — installs duplicate instead of updating.
**Correct:** Set a stable manifest `id` that never changes across deploys.
**Detect:** No detect method documented in the source entry. [L] assert manifest `id` is present.

### P-411 · `short_name` too long   [P2] [L]
**Breaks:** `short_name` is ellipsised under the home-screen icon.
**Correct:** Keep `short_name` <= 12 chars or it's ellipsised under the home-screen icon.
**Detect:** No detect method documented in the source entry. [L] assert `short_name` length <= 12 chars.

### P-412 · No `screenshots` / `form_factor`   [P2] [L]
**Breaks:** Android shows the minimal install chip instead of the rich install dialog.
**Correct:** Provide `screenshots` (with `form_factor`) in the manifest for the rich install UI.
**Detect:** No detect method documented in the source entry. [L] assert `screenshots` array is present with `form_factor` set.

### P-413 · Manifest unreachable — MIME, auth, or CDN   [P0] [L]
**Breaks:** Served as `text/html`, or behind auth without `crossorigin="use-credentials"` → install silently unavailable.
**Correct:** Serve the manifest as `application/manifest+json`, unauthenticated (or with `crossorigin="use-credentials"` and matching CORS).
**Detect:** [L] fetch as an unauthenticated client, assert `application/manifest+json` and valid JSON.

### P-414 · `orientation` locked wrongly   [P2] [L]
**Breaks:** The manifest locks `orientation` in a way that doesn't match how the app is actually meant to be used.
**Correct:** Only lock `orientation` when the app genuinely requires a single orientation; otherwise leave it unset.
**Detect:** No detect method documented in the source entry. [L] flag a locked `orientation`; whether it's "wrong" needs a judgment call against the app's actual UI.

### P-415 · Not served over HTTPS   [P0] [L]
**Breaks:** No secure context → no service worker, no install, no push.
**Correct:** Serve the app over HTTPS (localhost is exempt for development).
**Detect:** No detect method documented in the source entry. [L] assert the deployed origin is HTTPS.

### P-416 · `prompt()` called outside a user gesture   [P1] [S]
**Breaks:** The deferred install prompt is discarded by the browser and the button does nothing.
**Correct:** Call the deferred install prompt's `.prompt()` synchronously inside a user-gesture handler (e.g. a click listener), never on a timer or on load.
**Detect:** No detect method documented in the source entry. [S] check the call site of `.prompt()` is inside a gesture-bound event handler. Advisory: call-site gesture-boundedness is a control-flow heuristic.

### P-417 · Already-installed state not detected   [P2] [S][R]
**Breaks:** Install UI (button, banner) keeps showing even after the user has already installed the app.
**Correct:** Hide install UI when `matchMedia('(display-mode: standalone)')` matches or after `appinstalled`.
**Detect:** No detect method documented in the source entry. [S] check for a `matchMedia('(display-mode: standalone)')` or `appinstalled` guard around install UI. [R] confirm install UI hides once standalone. Advisory: presence of the guard doesn't guarantee it's wired correctly.

---

# §5 · Service worker, caching & updates

### P-501 · No service worker at all   [P0] [L]
**Breaks:** A manifest alone is not a PWA. Common when the agent "adds PWA support" in one pass.
**Correct:** Register a service worker that actually controls the origin.
**Detect:** No detect method documented in the source entry. [L] assert a service worker is registered and active for the origin.

### P-502 · Cache-first on HTML/navigation   [P0] [S][R]
**Breaks:** The catastrophic one. Users are pinned to the old app forever; your deploys are invisible; you cannot fix it remotely because the fix itself is behind the cache.
**Correct:** Network-first (or stale-while-revalidate with a fast timeout) for navigations; cache-first only for content-hashed immutable assets.
**Detect:** [S] classify the fetch handler's navigation strategy — reject cache-first for `request.mode === 'navigate'`. [R] deploy-B simulation (P-512). Advisory: classifying an arbitrary fetch handler's strategy is a control-flow heuristic, not a literal match.

### P-503 · No update flow — new SW waits forever   [P1] [S][R]
**Breaks:** The new worker sits in `waiting` until every tab closes. On an installed PWA that can be days.
**Correct:** Detect `updatefound` -> `installed` with an existing controller -> surface a non-blocking "Update available — reload", then `skipWaiting` + `clients.claim` on user confirmation.
**Detect:** No detect method documented in the source entry. [S] check for an `updatefound`/`installed`-with-existing-controller handler paired with a user-confirmed reload. [R] confirm the update banner appears and reload is user-gated. Advisory: confirming correct ordering needs flow analysis.

### P-504 · `skipWaiting()` fired unconditionally   [P0] [S]
**Breaks:** The inverse mistake, and agents love it as a "fix" for P-503. Assets swap under a live tab → the running bundle requests chunks that no longer exist → white screen mid-session.
**Correct:** Only after user-confirmed reload, or paired with a controlled reload on `controllerchange`.
**Detect:** [S] `skipWaiting` at install-time with no reload coordination. Advisory: proving "no reload coordination" is an absence-of-guard heuristic across the whole SW file.

### P-505 · Lazy chunk 404s after deploy   [P0] [S][R]
**Breaks:** The loaded shell references `chunk-A1B2.js`; the new deploy deleted it. Any lazy route now white-screens. This is the most common real-world PWA outage and agents essentially never handle it.
**Correct:** A global dynamic-import error handler that force-reloads once (guarded against reload loops), plus a retention window for old chunks on the origin.
**Detect:** [S] assert a chunk-error boundary exists. [R] deploy-B simulation with the old chunk removed. Advisory: presence of a boundary doesn't confirm it reloads correctly.

### P-506 · POST / mutations cached   [P0] [S]
**Breaks:** The fetch handler caches or serves cached responses for non-GET requests, so mutation results can be replayed stale.
**Correct:** Never cache non-GET; never serve API mutations from cache.
**Detect:** No detect method documented in the source entry. [S] check the fetch handler branches on `request.method === 'GET'` before any cache read/write. Advisory: tracing method-guards across a handler's control flow is heuristic.

### P-507 · Opaque cross-origin responses cached   [P1] [S]
**Breaks:** Opaque responses have unknown status (a 404 caches happily) and are padded — they blow the quota.
**Correct:** Don't blanket-cache cross-origin `no-cors` requests; check `response.type`/status where possible, or scope caching to same-origin.
**Detect:** No detect method documented in the source entry. [S] flag cache writes of cross-origin `no-cors` fetches without a type/status check. Advisory: tracing the response object's provenance is heuristic.

### P-508 · SW scope too narrow   [P0] [S]
**Breaks:** `/static/sw.js` can only control `/static/`. The app is uncontrolled and nothing works.
**Correct:** Serve from the origin root, or set `Service-Worker-Allowed`.
**Detect:** [S] check the SW file's serve path / registration scope option / `Service-Worker-Allowed` header against the app's real root.

### P-509 · No offline fallback   [P1] [R]
**Breaks:** A failed navigation while offline shows the browser's generic error page instead of the app's own offline UI.
**Correct:** A precached offline document for failed navigations; enable `navigationPreload` to avoid the SW boot penalty.
**Detect:** [R] go offline, navigate, assert a real offline page rather than the browser error.

### P-510 · Caches never versioned or purged   [P1] [S]
**Breaks:** Old cache entries from previous deploys accumulate forever and can shadow the current build.
**Correct:** Versioned cache names + delete non-current caches on `activate`.
**Detect:** No detect method documented in the source entry. [S] check cache names are build/version-derived and the `activate` handler deletes non-current cache keys. Advisory: bundled two-part heuristic.

### P-511 · Quota exceeded unhandled   [P2] [S]
**Breaks:** The service worker / cache-storage layer never handles a `QuotaExceededError`, so once device storage fills up, cache writes silently fail (or throw uncaught) and the app degrades with no diagnostic.
**Correct:** Catch storage-quota errors from Cache/IndexedDB writes, evict least-valuable cached data, and surface a diagnostic instead of failing silently.
**Detect:** No detect method documented in the source entry. [S] flag cache/IndexedDB write call sites lacking a catch/quota-error handling path. Advisory: absence-based heuristic across arbitrary code shapes.

### P-512 · The update path is never tested   [P0] [R]
**Breaks:** Every SW suite tests a first install. Nearly none test deploy A → deploy B on an existing client, which is where P-502/503/504/505 all live.
**Correct:** The suite must ship a two-build harness: serve build A, install, then swap the origin to build B and assert the client converges to B (with old chunks deleted).
**Detect:** [R] this is the single most valuable runtime test in the suite.

### P-513 · SW active in development   [P1] [S]
**Breaks:** The dev sees stale output and concludes the AI broke something; hours vanish.
**Correct:** Register only in production, and ship an unregister-and-clear escape hatch.
**Detect:** No detect method documented in the source entry. [S] check SW registration is gated behind a production-only condition (e.g. `NODE_ENV === 'production'`). Advisory: env-guard call-site heuristic.

### P-514 · `sw.js` / manifest served with long cache TTL   [P0] [S]
**Breaks:** The CDN pins the worker itself. Users can never receive the fix.
**Correct:** `Cache-Control: no-cache` on `sw.js` and the manifest; long immutable TTLs only on hashed assets.
**Detect:** [S] response-header assertion against the deployed origin, or against the headers config file (e.g. `vercel.json`, `netlify.toml`, `_headers`, nginx/CDN config) when checked at build time.

### P-515 · Auth headers / credentials dropped by the fetch handler   [P1] [S][R]
**Breaks:** A naive `fetch(event.request)` re-issue loses credentials mode → random 401s only for installed users.
**Correct:** Re-issue requests with their original `credentials` mode preserved (or explicit `credentials: 'include'`/`'same-origin'` as appropriate).
**Detect:** No detect method documented in the source entry. [S] check the fetch handler preserves `request.credentials` when re-issuing. [R] confirm authenticated requests still succeed through the SW. Advisory: credentials-handling tracing is heuristic.

### P-516 · Range requests broken (audio/video)   [P2] [S]
**Breaks:** Media won't seek, or won't play at all on Safari, when the SW returns a non-range response.
**Correct:** Forward `Range` headers and return a proper 206 partial response from the fetch handler for media requests.
**Detect:** No detect method documented in the source entry. [S] check the fetch handler forwards `Range` headers for media requests rather than serving a full cached response. Advisory: range-handling heuristic.

### P-517 · `localStorage` used for offline data   [P1] [S]
**Breaks:** ~5MB cap, synchronous (jank on the main thread). iOS ITP evicts unused storage after 7 days of non-use — but an actively used, installed home-screen app counts days-of-use and is effectively exempt from that eviction; the real risk is specifically infrequently-opened installed apps and non-installed Safari tabs.
**Correct:** IndexedDB for anything meaningful; treat all client storage as evictable for infrequently-used installs and browser tabs; request persistence where it matters.
**Detect:** No detect method documented in the source entry. [S] flag `localStorage`/`sessionStorage` used to persist meaningful offline app data (as opposed to trivial UI preferences). Advisory: distinguishing "meaningful data" from trivial flags is a semantic classification.

### P-518 · `navigator.onLine` trusted   [P2] [S]
**Breaks:** It reports "online" on captive portals and any LAN-only connection.
**Correct:** Confirm with a real request before declaring connectivity.
**Detect:** No detect method documented in the source entry. [S] flag `navigator.onLine` used directly to gate logic without a nearby confirming network request. Advisory: weak absence-based heuristic.

### P-519 · Background/periodic sync assumed universal   [P2] [S]
**Breaks:** Chromium-only. Must be feature-detected with a foreground fallback.
**Correct:** Feature-detect (`'sync' in registration` / `'periodicSync' in registration`) and provide a foreground fallback.
**Detect:** No detect method documented in the source entry. [S] flag Background/Periodic Sync API usage without a feature-detect guard. Advisory: absence-of-guard heuristic.

---

# §5b · Version skew & stale client state

### P-520 · Auth cookie shape changed; existing clients wedge   [P0] [S][R]
**AI writes:** Renames or reshapes the session cookie in a new release.
**Breaks:** Existing users still send the old cookie. The app half-reads it — infinite redirect loop, or "logged in" with no session. Reproduces for nobody testing with a clean profile.
**Correct:** Version the cookie name on any breaking change and explicitly clear the old one; or read both shapes for one release. A deliberate migration, never an implicit one.
**Detect:** [S] diff auth-cookie names/shapes between builds A and B; flag a change with no clear-old path. [R] harness — authenticate on A, deploy B, assert the client reaches a coherent state: still authed, or cleanly logged out. Never wedged. Advisory: "no clear-old path" is a bundled code-presence heuristic.

### P-521 · No build/version stamp on the client   [P1] [S][R]
**Breaks:** The app cannot know it is stale, you cannot answer "which build is this user on?", and every other check in this section has nothing to key off.
**Correct:** Embed a build ID at build time, expose it (meta tag or global), and send it with API requests.
**Detect:** [S] a build stamp exists and differs between A and B.

### P-522 · API contract skew — old shell, new API   [P0] [R]
**Breaks:** A cached build-A shell calls build-B's API. Silent 4xx, or a shape mismatch rendered as a blank screen with no error.
**Correct:** Version the API, or have the server advertise a minimum supported client so the app can force an update.
**Detect:** [R] harness — run A's shell against B's API; assert graceful handling (forced update, or a compatible response). A silent blank is a failure. Advisory: classifying "graceful" vs "silent blank" is a judgment call.

### P-523 · Cached data survives logout / account switch   [P0] [S][R]
**Breaks:** SW cache, IndexedDB, or localStorage retains user A's data; user B signs in on the same device and sees it. This is a privacy incident, not a glitch — and shared devices are the norm in plenty of markets.
**Correct:** Purge all user-scoped caches and storage on logout and on identity change. Where retention is deliberate, key it by user.
**Detect:** [S] assert the logout path clears caches + IDB. [R] sign in as A, sign out, sign in as B, assert no A-scoped data is reachable. Advisory: confirming complete coverage of every user-scoped store is a completeness heuristic.

### P-524 · Caches not keyed by build ID   [P1] [S]
**Breaks:** A new deploy reuses the old cache namespace, so stale entries survive the very update meant to replace them.
**Correct:** Cache names derive from the build ID; `activate` deletes every non-current cache.
**Detect:** [S] cache names are build-derived and `activate` purges others. Advisory: bundled two-part heuristic, same pattern as P-510.

### P-525 · Client storage schema migration missing   [P0] [S][R]
**Breaks:** Build B expects a new shape; build A's persisted state crashes it during boot — `undefined` access, or `JSON.parse` of a changed shape. White screen for existing users only. Invisible in dev, invisible to any fresh-profile test, and it looks like a total outage to the affected user.
**Correct:** Version the persisted schema; migrate or discard on read; wrap hydration in a failure path that falls back to clean state rather than dying.
**Detect:** [S] persisted reads are version-checked and failure-tolerant. [R] harness — seed A's storage, load B, assert boot succeeds. Advisory: guard-presence heuristic.

### P-526 · Authenticated responses cached by the service worker   [P0] [S]
**Breaks:** A private response is written to the cache and later served to a different or logged-out user.
**Correct:** Never cache responses to credentialed requests unless keyed by identity and purged on logout.
**Detect:** [S] flag cache writes for requests carrying credentials. Advisory: tracing whether a cached request carried credentials requires data-flow analysis between request creation and the cache write.

### P-527 · No hard-reset escape hatch   [P1] [S]
**Breaks:** When a user is wedged, there is no supported recovery. Support's only advice becomes "reinstall" — and on iOS that means deleting the home-screen app and losing everything local.
**Correct:** Ship a reachable reset route that unregisters service workers, deletes all caches, clears storage, and reloads. The goal is that support can fix it in one sentence.
**Detect:** [S] such a route exists. Advisory: recognizing an ad-hoc combination of unregister/clear-cache/clear-storage/reload calls is a multi-API-call pattern match, not a single token.

### P-528 · Service worker and app shell from different builds   [P1] [R]
**Breaks:** SW from A, shell from B — the precache manifest references assets the shell never requests, and vice versa.
**Correct:** The SW carries its build ID and declines to serve a mismatched shell; converge on one build.
**Detect:** [R] harness assertion.

### P-529 · Safari caps client-set cookies at 7 days   [P1] [S]
**Breaks:** Cookies set via `document.cookie` in Safari are capped at 7 days by ITP regardless of stated `max-age` — users are silently signed out weekly. Installed PWAs make it worse, because a home-screen app is expected to stay signed in.
**Correct:** Set auth cookies server-side via `Set-Cookie`; never rely on long-lived client-set cookies for session.
**Detect:** [S] flag long-`max-age` auth cookies assigned through `document.cookie`.

### P-530 · Cookie attributes wrong for standalone launch   [P1] [S]
**Breaks:** `SameSite` / `Secure` / partitioning mismatches break OAuth returns and cross-context launches from the home screen — works in the browser tab, fails in the installed app.
**Correct:** `Secure`, a deliberate `SameSite`, and test the real install → sign-in → relaunch path.
**Detect:** No detect method documented in the source entry. [S] check server-set auth cookie attributes (`Secure`, `SameSite`, partitioning) for standalone-launch compatibility. Advisory: correctness depends on the app's actual OAuth/launch flow, a semantic judgment.

### P-531 · Breaking update never forced   [P1] [S][R]
**Breaks:** P-503's polite "update available" banner is the wrong answer when the old client is incompatible — it lets users keep operating a build that cannot work.
**Correct:** Distinguish optional from mandatory updates; a server-signalled minimum version triggers a forced reload.
**Detect:** [S] check for a distinct mandatory-update code path (minimum-version check + forced reload) separate from the optional-update banner (P-503). [R] harness — mark B as breaking, assert A's client force-updates rather than lingering. Advisory: distinguishing the mandatory path from the optional one is a branch heuristic.

---

# §6 · Performance on real phones

### P-601 · No code splitting   [P1] [S][L]
**Breaks:** The entire app bundles into one chunk; every route pays the download/parse cost of the whole app on first load.
**Correct:** Split routes/heavy components into lazy-loaded chunks (dynamic `import()` / `React.lazy`) so first load ships only what's needed.
**Detect:** No detect method documented in the source entry. [S] flag route-level components with no dynamic `import()`/`lazy()` usage. [L] flags unused/oversized JS. Advisory: absence of the pattern doesn't strictly prove no splitting exists elsewhere.

### P-602 · Font FOIT / no preload   [P1] [S]
**Breaks:** Custom web fonts load without `font-display: swap` or a `<link rel=preload>`, so text is invisible (FOIT) until the font arrives — worse on cellular.
**Correct:** Set `font-display: swap` on `@font-face` and preload the primary font file.
**Detect:** No detect method documented in the source entry. [S] grep `@font-face` declarations for `font-display: swap` and check for a matching `<link rel=preload>` font tag.

### P-603 · Whole icon library imported   [P1] [S]
**AI writes:** `import * from 'lucide-react'` style barrel imports.
**Breaks:** Importing the whole icon library ships thousands of unused icons in the bundle, bloating first-load JS for the six icons actually used.
**Correct:** Import icons individually (or use a tree-shakeable subpath) so only used icons ship.
**Detect:** No detect method documented in the source entry. [S] AST scan for wildcard/barrel imports from known icon libraries.

### P-604 · Unoptimised images   [P1] [S][L]
**Breaks:** No `srcset`/`sizes`, no AVIF/WebP, no lazy loading, LCP image not prioritised.
**Correct:** Add responsive `srcset`/`sizes`, serve AVIF/WebP, lazy-load below-the-fold images, and set `fetchpriority=high` on the LCP image.
**Detect:** No detect method documented in the source entry. [S] scan of `<img>`/`<picture>` markup for missing `srcset`/`sizes`/`loading` attributes. [L] audits image optimisation and LCP. Advisory: identifying which image is the LCP candidate from source alone is a heuristic.

### P-605 · Animating layout properties   [P1] [S]
**Breaks:** `width`/`height`/`top`/`left`/`margin` instead of `transform`/`opacity` → guaranteed jank on mid-range Android.
**Correct:** Animate `transform` and `opacity` only; avoid animating layout properties.
**Detect:** No detect method documented in the source entry. [S] scan CSS `transition`/`animation`/`@keyframes` declarations for layout properties instead of `transform`/`opacity`.

### P-606 · `will-change` sprayed everywhere   [P2] [S]
**Breaks:** Each one is a permanent compositor layer; mobile GPU memory is not free.
**Correct:** Apply `will-change` narrowly, only immediately before an animation starts, and remove it after; never spray it globally.
**Detect:** No detect method documented in the source entry. [S] grep `will-change` usage breadth (broad selectors / many rules). Advisory: judging "sprayed" vs a few legitimate uses needs a threshold.

### P-607 · Long lists unvirtualised   [P1] [R]
**Breaks:** 1,000 rows of DOM freezes low-end devices.
**Correct:** Virtualise, or at minimum `content-visibility: auto`.
**Detect:** No detect method documented in the source entry. [R] render a long list and assert DOM node count / frame time stays bounded rather than scaling linearly with list length. Advisory: needs a size threshold.

### P-608 · Heavy hydration / everything a client component   [P1] [S]
**Breaks:** Nearly every component is marked a client component / hydrated eagerly, so the whole page pays hydration cost even where server rendering or partial hydration would do.
**Correct:** Keep components server-rendered/static by default; opt into client hydration only where interactivity is actually needed.
**Detect:** No detect method documented in the source entry. [S] scan for pervasive `'use client'` directives / client-component wrapping relative to actual interactive surface. Advisory: judging "heavy"/"everything" needs a proportion heuristic.

### P-609 · Third-party scripts render-blocking   [P1] [L]
**Breaks:** Third-party scripts (analytics, chat widgets, ads) load synchronously in `<head>` and block rendering.
**Correct:** Load third-party scripts with `async`/`defer`, or after first paint via a script loader.
**Detect:** No detect method documented in the source entry. [L] flags render-blocking resources and third-party script impact.

### P-610 · Install prompt / cookie banner injected above content   [P1] [R]
**Breaks:** Pushes the page down after paint — a self-inflicted CLS spike from the PWA layer itself.
**Correct:** Reserve space for the banner up front (skeleton/placeholder) or render it as an overlay that doesn't reflow content.
**Detect:** No detect method documented in the source entry. [R] measure CLS around banner mount and assert it stays within budget rather than spiking on injection.

### P-611 · Perf budget measured on desktop   [P1] [L]
**Breaks:** Performance budgets and audits are measured on a fast desktop machine, hiding the jank and load times real mobile users on mid-range Android actually experience.
**Correct:** Audit with mobile CPU throttling (4–6x) and a throttled network, not on your M-series laptop.
**Detect:** No detect method documented in the source entry. [L] check the Lighthouse run configuration applies mobile CPU/network throttling.

---

# §7 · Accessibility

### P-701 · Pinch-zoom disabled   [P0] [S]
**AI writes:** `user-scalable=no, maximum-scale=1` — very often as the "fix" for P-101.
**Breaks:** WCAG 1.4.4 failure. Low-vision users cannot zoom. iOS 10+ ignores it in Safari anyway, so it fails and doesn't work.
**Correct:** Fix input zoom with 16px fonts (P-101). Leave pinch zoom enabled. Blocking pinch zoom is a WCAG 1.4.4 failure the suite must never emit — this is a FAIL, never a suggestion.
**Detect:** [S] grep the viewport meta content for `user-scalable=no` / `maximum-scale=1` (or <1). Crisp presence check — the suite fails this on sight.

### P-702 · `user-select: none` applied globally   [P1] [R]
**Breaks:** Breaks copy for real content and degrades assistive tooling. See P-111 — chrome only.
**Correct:** Scope `user-select: none` to chrome only (nav, tab bar, buttons, headers); leave real content selectable.
**Detect:** Reclassified: same as P-111 — whether chrome/content is correctly split requires resolving `user-select` across the cascade, not a single source match. Phase 2 will implement this as a computed-style/DOM sweep.

### P-703 · Icon-only buttons with no accessible name   [P1] [S][R]
**Breaks:** The tab bar is the usual offender — a screen-reader user hears nothing meaningful for the control.
**Correct:** `aria-label` or visually-hidden text.
**Detect:** No detect method documented in the source entry. [S] flag icon-only buttons (no text child) lacking `aria-label`/`aria-labelledby`/visually-hidden text. [R] confirm the accessible name via the accessibility tree.

### P-704 · `<div onClick>` instead of a button   [P1] [S][R]
**Breaks:** No keyboard, no role, no focus, no Enter/Space.
**Correct:** Use a real `<button>`, or add `role="button"`, `tabIndex`, and Enter/Space key handling.
**Detect:** No detect method documented in the source entry. [S] flag `<div onClick>`/`<span onClick>` lacking `role`, `tabIndex`, and a key handler. [R] confirm keyboard activation works.

### P-705 · `outline: none` with no focus replacement   [P1] [S]
**Breaks:** Removing focus styling "because it looked bad on mobile" breaks all keyboard users.
**Correct:** `:focus-visible` ring.
**Detect:** No detect method documented in the source entry. [S] flag `outline: none`/`outline: 0` rules with no paired `:focus-visible` style elsewhere in scope. Advisory: correlating the removal with a replacement elsewhere in the stylesheet is heuristic.

### P-706 · Focus not trapped in overlays, not restored on close   [P1] [R]
**Breaks:** Focus escapes to the background page behind the modal.
**Correct:** Trap focus inside the overlay while open; restore focus to the triggering element on close.
**Detect:** [R] open overlay, tab through, assert focus stays inside; close, assert focus returns to the trigger.

### P-707 · `prefers-reduced-motion` ignored   [P1] [S]
**Breaks:** Page transitions and parallax cause real vestibular harm.
**Correct:** Gate non-essential motion behind `@media (prefers-reduced-motion: no-preference)`.
**Detect:** No detect method documented in the source entry. [S] flag animation/transition declarations with no `prefers-reduced-motion` override anywhere in scope. Advisory: correlating declarations across rules is heuristic.

### P-708 · SPA route changes unannounced   [P2] [R]
**Breaks:** Screen-reader users get no signal that the view changed.
**Correct:** Live region + focus management on navigation.
**Detect:** No detect method documented in the source entry. [R] navigate, assert a live-region announcement fires or focus moves to the new view's heading.

### P-709 · Contrast failures   [P1] [R]
**Breaks:** Agents reach for tasteful mid-greys that fail 4.5:1 — especially placeholder text and secondary labels.
**Correct:** Ensure text and background colours meet WCAG contrast thresholds (4.5:1 normal text, 3:1 large text).
**Detect:** Reclassified: contrast ratio needs the resolved computed color and background (cascade, opacity, overlays), not a source-level value. Phase 2 will implement this as a computed-style sweep. Confidence advisory: contrast ratio thresholds are the brief's own paradigm example of judgment-requiring detection.

### P-710 · Inputs without labels; errors not associated   [P1] [S]
**Breaks:** Placeholder-as-label is not a label. Errors need `aria-describedby` + `aria-invalid`.
**Correct:** Every input gets a real `<label>` (or `aria-label`); error messages wire up via `aria-describedby` + `aria-invalid`.
**Detect:** No detect method documented in the source entry. [S] flag `<input>` without an associated `<label>`/`aria-label`, and error-message elements not wired via `aria-describedby`/`aria-invalid`. Advisory: bundled multi-condition structural check.

### P-711 · Background content not `inert` behind a modal   [P1] [R]
**Breaks:** Screen-reader and keyboard users can still reach content behind an open modal.
**Correct:** Apply `inert` (or `aria-hidden` + focus containment) to background content while a modal is open.
**Detect:** No detect method documented in the source entry. [R] open a modal, assert background content is `inert`/unreachable by tab or screen-reader traversal.

### P-712 · Heading order / landmarks broken   [P2] [S]
**Breaks:** Heading levels skip or land in the wrong order, and landmark roles (`main`, `nav`, `header`) are missing or duplicated, confusing screen-reader navigation.
**Correct:** Keep heading levels sequential (no skipped levels) and use one set of well-formed landmark regions per page.
**Detect:** No detect method documented in the source entry. [S] scan rendered heading structure for skipped levels and landmark roles for duplication/absence. Advisory: component-based apps often compose headings per-component in ways that are legitimately non-linear at the source level.

---

# §8 · RTL & internationalisation

### P-801 · Physical CSS properties instead of logical   [P0] [S]
**AI writes:** `margin-left`, `padding-right`, `left`, `text-align: left`, `border-l`.
**Breaks:** Physical-direction CSS properties don't flip in RTL, so layout, spacing, and text alignment stay LTR-shaped inside an Arabic UI.
**Correct:** `margin-inline-start`, `padding-inline-end`, `inset-inline-start`, `text-align: start`. In Tailwind: `ms-*`/`me-*`/`ps-*`/`pe-*`, not `ml-*`/`mr-*`.
**Detect:** [S] flag physical properties in any RTL-capable surface — mechanical and very high yield.

### P-802 · Directional icons not mirrored   [P1] [S][V]
**Breaks:** The back chevron points the wrong way in RTL.
**Correct:** Mirror direction-bearing glyphs; never mirror logos, media controls, or clocks.
**Detect:** No detect method documented in the source entry. [S] flag known directional icon names without an RTL mirror transform. [V] snapshot in RTL confirms visually. Advisory: no static analysis knows which SVGs are direction-bearing — one of the suite's FP-heaviest checks.

### P-803 · `dir` / `lang` not set   [P1] [S]
**Breaks:** Breaks the bidi algorithm and screen-reader pronunciation.
**Correct:** Set `dir` and `lang` on `<html>` (and on any locale-scoped subtree) to match the active locale.
**Detect:** No detect method documented in the source entry. [S] assert `<html>` has `dir` and `lang` attributes matching the active locale.

### P-804 · Mixed LTR inside RTL scrambles   [P1] [S][V]
**Breaks:** Phone numbers, `+970`, URLs, latin brand names inside Arabic text reorder wrongly.
**Correct:** `<bdi>` / `unicode-bidi: isolate` around embedded LTR runs.
**Detect:** No detect method documented in the source entry. [S] flag likely embedded LTR runs (phone/URL/latin-brand patterns) inside RTL text not wrapped in `<bdi>`/`unicode-bidi: isolate`. [V] snapshot confirms visual reordering. Advisory: content-pattern recognition is heuristic.

### P-805 · Font lacks Arabic glyphs   [P1] [S][V]
**Breaks:** Falls back to a system face — inconsistent weights, broken ligatures, tofu.
**Correct:** Enforce Arabic-capable faces (Tajawal / Cairo / IBM Plex Sans Arabic per the standing rule) with an explicit Arabic subset.
**Detect:** No detect method documented in the source entry. [S] check the active font stack includes an allow-listed Arabic-capable face. [V] snapshot confirms actual glyph rendering. Advisory: a name-matching allow-list misses custom/self-hosted fonts not on the list.

### P-806 · Animations directionally wrong in RTL   [P2] [V]
**Breaks:** Drawers slide in from the wrong edge; "next" transitions run backwards.
**Correct:** Drive slide/transition direction from the active `dir`, not a hardcoded LTR assumption.
**Detect:** No detect method documented in the source entry. [V] snapshot drawers/transitions in RTL; judging "wrong edge"/"backwards" is a visual assessment.

### P-807 · Hardcoded strings   [P1] [S]
**Breaks:** User-facing text is hardcoded in English rather than routed through the i18n layer, so it never localises.
**Correct:** Route all user-facing text through the translation layer (`t()`/i18n calls); no raw literal strings in components.
**Detect:** No detect method documented in the source entry. [S] flag literal string nodes in JSX/templates not wrapped in a translation call. Advisory: real risk of false positives on intentional non-translated strings (aria-labels, dev-only text, brand names).

### P-808 · Numerals / dates / currency unlocalised   [P2] [S]
**Breaks:** Arabic-Indic vs Latin digits used inconsistently within one screen.
**Correct:** Use `Intl.NumberFormat`/`Intl.DateTimeFormat` (or the app's i18n layer) consistently instead of hardcoded digit/date/currency formatting.
**Detect:** No detect method documented in the source entry. [S] flag manual number/date/currency formatting instead of `Intl.*`/i18n helpers. Advisory: heuristic pattern match over arbitrary formatting code.

---

# §9 · Forms & the mobile keyboard

### P-901 · Wrong keyboard type   [P1] [S]
**Breaks:** Missing `inputmode` / wrong `type`: email, tel, numeric, decimal, search, url — so mobile users get the generic keyboard instead of the one suited to the field.
**Correct:** Set the correct `type`/`inputmode` per field (email, tel, numeric, decimal, search, url).
**Detect:** No detect method documented in the source entry. [S] scan of input elements for missing/incorrect type or inputmode given the field's semantic purpose (name/id/label heuristics). Advisory: matching "wrong type" needs semantic inference from field name/label.

### P-902 · `autocomplete` tokens missing   [P1] [S]
**Breaks:** Kills password managers and — critically — missing `autocomplete="one-time-code"` breaks iOS SMS OTP autofill.
**Correct:** Add appropriate autocomplete tokens to every relevant field, including `autocomplete="one-time-code"` on OTP inputs.
**Detect:** No detect method documented in the source entry. [S] scan of input elements for missing autocomplete attributes given field semantics. Advisory: same semantic-inference risk as P-901.

### P-903 · Keyboard covers the focused field   [P1] [R][D]
**Breaks:** iOS does not resize the layout viewport for the keyboard, so a focused field can end up covered by the virtual keyboard with no scroll compensation.
**Correct:** Scroll the focused element into view on `focus`, accounting for the visual viewport (P-104).
**Detect:** [R] simulate keyboard/focus and assert the focused field remains visible above the visual viewport bottom. [D] real device is authoritative.

### P-904 · Fixed submit CTA buried by the keyboard   [P1] [R][D]
**Breaks:** A fixed submit CTA sits at `bottom: 0`, but the virtual keyboard covers it because iOS doesn't resize the layout viewport, making the primary action unreachable while typing.
**Correct:** Drive the CTA's position from the VisualViewport API (or reserve keyboard-safe space) so it stays above the keyboard, same pattern as P-104.
**Detect:** [R] simulate keyboard open, assert the CTA remains within the visible viewport. [D] real device is authoritative.

### P-905 · `enterkeyhint` unset   [P2] [S]
**Breaks:** The Return key should read Go / Search / Send / Next, but shows a generic label because `enterkeyhint` is unset.
**Correct:** Set `enterkeyhint` to the action-appropriate value (go/search/send/next) per field.
**Detect:** No detect method documented in the source entry. [S] scan of form inputs for missing `enterkeyhint` attribute on the final/action field.

### P-906 · Enter doesn't submit   [P2] [R]
**Breaks:** Pressing Enter in a form field does not submit the form, forcing users to hunt for a submit button.
**Correct:** Ensure the Enter key submits the form (native form submit behavior, or an explicit keydown handler wired to the submit action).
**Detect:** No detect method documented in the source entry. [R] focus a field, press Enter, assert the form submit handler fires.

### P-907 · Paste blocked on OTP inputs   [P1] [S][R]
**Breaks:** Split six-box OTP components that reject a pasted code are an agent classic.
**Correct:** Handle a paste event on OTP inputs by distributing the pasted code across the boxes (or use a single input styled as boxes).
**Detect:** No detect method documented in the source entry. [S] scan OTP/split-input components for a paste handler. [R] paste a code and assert all boxes populate. Advisory: identifying "an OTP component" from source is a semantic classification.

### P-908 · Validation only on submit, native bubbles unstyled   [P2] [S]
**Breaks:** Validation only runs on submit (not inline/on-blur) and native browser validation bubbles are left unstyled, clashing with the app's design and appearing late.
**Correct:** Validate inline (on blur/change) with styled error messages, and suppress/replace native validation bubble UI (e.g. `novalidate` + custom messaging).
**Detect:** No detect method documented in the source entry. [S] flag absence of onBlur/onChange validation wiring and lack of custom error-message styling, form left to native `:invalid` bubbles. Advisory: judging "unstyled"/"only on submit" from source is heuristic.

---

# §10 · Theming & system integration

### P-1001 · Theme flash on load (FOUC)   [P1] [S][R]
**Breaks:** There's no blocking inline script to apply the stored/system theme before first paint, so a white flash appears into a dark app on every cold start — which installed PWAs do constantly.
**Correct:** Inline a blocking script in `<head>` that reads the stored/system theme preference and sets it (e.g. a class or `color-scheme`) before first paint.
**Detect:** No detect method documented in the source entry. [S] check for a blocking inline theme-setting script in `<head>` before stylesheets/hydration. [R] assert no flash of wrong theme on cold load. Advisory: confirming genuine pre-paint ordering needs inference.

### P-1002 · `color-scheme` not declared   [P2] [S]
**Breaks:** Native controls, scrollbars, and form widgets stay light inside a dark app.
**Correct:** Declare `color-scheme` (meta tag and/or CSS) matching the active theme, `light`/`dark`/`light dark` as appropriate.
**Detect:** No detect method documented in the source entry. [S] check presence of a `color-scheme` meta tag/CSS property matching the theme system.

### P-1003 · Splash `background_color` ≠ app background   [P2] [L]
**Breaks:** The manifest's `background_color` (splash screen) doesn't match the app's true initial background, so users see a mismatched colour flash between the splash screen and first paint.
**Correct:** Set `background_color` to the app's actual initial background colour, per colour scheme.
**Detect:** No detect method documented in the source entry. [L] compare manifest `background_color` against the rendered initial background. Advisory: colour comparison needs a tolerance judgment, and can vary by scheme.

### P-1004 · `theme-color` not switched per scheme   [P1] [S]
**Breaks:** `theme-color` is a single static value that doesn't switch with the active colour scheme (light/dark), so the browser chrome/status bar colour clashes with the app once it's in dark mode. See P-408.
**Correct:** Provide `theme-color` meta variants scoped with `media="(prefers-color-scheme: dark|light)"`, matching the manifest and the real painted background, same as P-408.
**Detect:** No detect method documented in the source entry. [S] static cross-check of `theme-color` meta variants against the active scheme, per P-408.

### P-1005 · Hardcoded hex instead of tokens   [P2] [S]
**Breaks:** Hardcoded hex colour values are used instead of design tokens/CSS variables, so the dark-mode variant is guaranteed to be missed somewhere those hardcoded values live.
**Correct:** Use theme tokens/CSS custom properties for all colour values instead of hardcoded hex, so every consumer picks up both light and dark variants automatically.
**Detect:** No detect method documented in the source entry. [S] grep hex colour literals in component/style source outside the token definitions themselves. Advisory: real risk of false positives from legitimate one-off hex (brand colours, gradients, third-party palettes).

---

# §11 · Build, deploy & platform config

### P-1101 · Wrong `base` path on subpath deploys   [P0] [S]
**Breaks:** Manifest, SW scope, and asset URLs all break together.
**Correct:** Set the build's base path, manifest paths, and SW registration scope consistently to the actual deploy subpath.
**Detect:** No detect method documented in the source entry. [S] cross-check the build's base config against manifest/SW-registration paths.

### P-1102 · `Cache-Control` wrong on `sw.js` / manifest   [P0] [S]
**Breaks:** See P-514 — worth stating separately because it lives in server/CDN config, not app code, so it survives every app-side fix.
**Correct:** Set `Cache-Control: no-cache` on `sw.js` and the manifest at the server/CDN layer, same as P-514.
**Detect:** [S] response-header assertion against the deployed origin for `sw.js`/manifest, or against the headers config file (same check as P-514, at the infra layer).

### P-1103 · Framework PWA plugin misconfigured   [P1] [S]
**Breaks:** `next-pwa` / `vite-plugin-pwa` with App Router, static export, or middleware interactions — precache manifest generated for the wrong output dir.
**Correct:** Configure the PWA plugin correctly for the framework mode in use (App Router/static export/middleware) and verify the precache manifest targets the real output directory.
**Detect:** No detect method documented in the source entry. [S] check the PWA plugin config against the framework's build output mode/directory. Advisory: correctness depends on framework-specific interactions that are hard to verify generically.

### P-1104 · Installability never actually verified   [P1] [L]
**Breaks:** No one ran the audit; "it has a manifest" is assumed to mean installable.
**Correct:** Run a Lighthouse/PWA installability audit as part of the release process and require it pass before calling the PWA work done.
**Detect:** No detect method documented in the source entry. [L] Lighthouse installability audit.

### P-1105 · Missing `.well-known/assetlinks.json` for TWA   [P2] [S]
**Breaks:** Only if shipping to Play via Trusted Web Activity — the URL bar stays visible without it.
**Correct:** Publish a correct `.well-known/assetlinks.json` linking the TWA package to the site, only relevant when shipping via TWA.
**Detect:** No detect method documented in the source entry. [S] check for presence and correctness of `.well-known/assetlinks.json` when a TWA/Android wrapper is present.

---

# §12 · What agents never test (the meta-failures)

### P-1201 · Never opened on a real device — emulation passes, iOS fails   [P1] [D]
**Breaks:** Never opened on a real device — emulation passes, iOS fails.
**Correct:** Run the device matrix (real iOS Safari + Android Chrome) before declaring PWA work done, not emulation alone.
**Detect:** documented gap — no automated check; process/testing-discipline entry.

### P-1202 · Tested at desktop viewport only   [P1]
**Breaks:** Tested at desktop viewport only.
**Correct:** Test at the canonical mobile width set (320/360/390/430/768/1024) plus landscape before declaring done.
**Detect:** documented gap — no automated check; process/testing-discipline entry.

### P-1203 · Never tested the second deploy — the update path is where the P0s live   [P1]
**Breaks:** Never tested the second deploy — the update path (§5) is where the P0s live.
**Correct:** Run the deploy-A-to-deploy-B update-path test (P-512) before declaring the service-worker/update work done.
**Detect:** documented gap — no automated check; process/testing-discipline entry.

### P-1204 · Never tested offline   [P1]
**Breaks:** Never tested offline.
**Correct:** Test the app with the network disabled (airplane mode / devtools offline) before declaring done.
**Detect:** documented gap — no automated check; process/testing-discipline entry.

### P-1205 · Never tested the install flow end-to-end, on either platform   [P1]
**Breaks:** Never tested the install flow end-to-end, on either platform.
**Correct:** Walk the real install flow end-to-end on both iOS (Add to Home Screen) and Chromium (install prompt) before declaring done.
**Detect:** documented gap — no automated check; process/testing-discipline entry.

### P-1206 · Never tested with the keyboard open   [P1] [D]
**Breaks:** Never tested with the keyboard open.
**Correct:** Open the on-screen keyboard on every form screen and check fixed CTAs/composers stay reachable before declaring done.
**Detect:** documented gap — no automated check; process/testing-discipline entry.

### P-1207 · Never tested in RTL   [P1]
**Breaks:** Never tested in RTL.
**Correct:** Switch the app to RTL (`dir=rtl` / an Arabic locale) and re-check layout before declaring done.
**Detect:** documented gap — no automated check; process/testing-discipline entry.

### P-1208 · Never tested with a screen reader or keyboard-only   [P1]
**Breaks:** Never tested with a screen reader or keyboard-only.
**Correct:** Run a full screen-reader and keyboard-only pass before declaring done.
**Detect:** documented gap — no automated check; process/testing-discipline entry.

### P-1209 · Never tested on a throttled CPU/network   [P1]
**Breaks:** Never tested on a throttled CPU/network.
**Correct:** Re-test with mobile CPU throttling (4–6x) and a throttled network before declaring done.
**Detect:** documented gap — no automated check; process/testing-discipline entry.

### P-1210 · Declared "done" from a green build — no runtime evidence   [P1]
**Breaks:** Declared "done" from a green build — no runtime evidence.
**Correct:** Require actual runtime evidence (a report, a recording, or a live pass) before declaring PWA work done — a green build is not runtime evidence.
**Detect:** documented gap — no automated check; process/testing-discipline entry.

---

## Coverage summary

| § | area | entries | P0 |
|---|---|---|---|
| 1 | iOS Safari & WebKit | 25 | 4 |
| 2 | App shell & navigation | 10 | 3 |
| 3 | Responsive layout | 10 | 1 |
| 4 | Manifest, install & icons | 17 | 7 |
| 5 | Service worker, caching & updates | 19 | 8 |
| 5b | Version skew & stale client state | 12 | 5 |
| 6 | Performance on real phones | 11 | 0 |
| 7 | Accessibility | 12 | 1 |
| 8 | RTL & internationalisation | 8 | 1 |
| 9 | Forms & the mobile keyboard | 8 | 0 |
| 10 | Theming & system integration | 5 | 0 |
| 11 | Build, deploy & platform config | 5 | 2 |
| 12 | What agents never test (the meta-failures) | 10 | 0 |
| | **total** | **152** | **32** |



**Detection feasibility**

- **~61%** are catchable **statically** — no browser needed, runs on every save.
- **~37%** need a **runtime** browser assertion.
- **~5%** are **device-only** and must be reported as `UNVERIFIED`, never as passing.



## Two honest flags

1. **"No zoom allowed" as stated is half-wrong.** Blocking double-tap and input-focus zoom is correct and the suite will enforce it. Blocking *pinch* zoom is a WCAG 1.4.4 failure that iOS Safari overrides anyway — the suite should refuse to emit it and fail the check if it finds it (P-701).
2. **"No text selection allowed" as stated is half-wrong too.** Correct for chrome (tabs, buttons, headers); applying it globally breaks copy on real content and is a common agent overreach. The suite enforces the chrome/content split (P-111, P-702).

