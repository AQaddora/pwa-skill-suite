# The PWA / Frontend AI-Mistake Catalog

Every failure mode an AI coding agent reliably introduces when turning an existing
web app into a mobile PWA — and how to *detect* each one automatically.

This is the source of truth the skill suite is built on. Each entry is written so a
verifier can be generated from it mechanically.

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

The densest cluster. Most agents were trained mostly on desktop Chrome behaviour.

### P-101 · Input focus zooms the whole page   [P1] [S][R][D]
**AI writes:** `<input class="text-sm">` / `font-size: 14px` on form controls.
**Breaks:** iOS Safari auto-zooms any focused control whose computed `font-size` < 16px, then never zooms back. The app instantly reads as a website.
**Correct:** computed `font-size >= 16px` on every `input, select, textarea`. If the design needs smaller text, shrink with `padding` / `line-height`, not `font-size`. **Do not** fix this by disabling zoom (see P-701).
**Detect:** [S] scan computed styles of all form controls for `< 16px`. [R] focus each control, assert `visualViewport.scale === 1`. [D] real iOS confirm.

### P-102 · `100vh` is wrong on mobile   [P1] [S][R]
**AI writes:** `h-screen`, `min-h-screen`, `height: 100vh`.
**Breaks:** iOS `vh` is sized to the *expanded* viewport, ignoring the URL bar. Bottom content and fixed CTAs sit below the fold; a full-height layout scrolls when it shouldn't.
**Correct:** `100dvh` with a `100vh` fallback for old engines; or the `--vh` JS custom-property pattern where `dvh` isn't viable. Know the family: `svh` (smallest/URL-bar-visible), `lvh` (largest), `dvh` (dynamic).
**Detect:** [S] flag `100vh` / `h-screen` in any layout-critical rule. [R] assert no vertical overflow with the URL bar simulated.

### P-103 · Safe-area insets ignored (notch + home indicator)   [P0] [S][R][V]
**AI writes:** a fixed bottom tab bar with `padding-bottom: 12px`; no `viewport-fit=cover`.
**Breaks:** the tab bar sits *under* the home indicator and is partly untappable; the header hides behind the notch/Dynamic Island.
**Correct:** `<meta name="viewport" content="... viewport-fit=cover">` **and** `padding-bottom: calc(12px + env(safe-area-inset-bottom))` on the bottom bar, `env(safe-area-inset-top)` on the header, plus `-left`/`-right` in landscape.
**Detect:** [S] `viewport-fit=cover` present AND every `position: fixed` edge-anchored element references the matching `env(safe-area-inset-*)`. [V] snapshot on a notched device profile.

### P-104 · Fixed bottom bar breaks when the keyboard opens   [P1] [R][D]
**AI writes:** `position: fixed; bottom: 0` for the composer / CTA.
**Breaks:** iOS does not resize the layout viewport for the virtual keyboard. The bar stays pinned to the *old* bottom — floating behind or over the keyboard.
**Correct:** drive the offset from the **VisualViewport API** (`visualViewport.height`, `offsetTop`, `resize` + `scroll` events), or use `interactive-widget=resizes-content` in the viewport meta where supported.
**Detect:** [R] simulate keyboard, assert bar's bounding box stays above the visual viewport bottom. [D] real device is authoritative.

### P-105 · Rubber-band overscroll reveals the page background   [P1] [S]
**Breaks:** dragging past the top/bottom shows the browser/body background behind your "app" — the single biggest tell that it's a web page.
**Correct:** `overscroll-behavior: none` on the scroll root; give `html, body` the app background; for a true app shell use the fixed-body pattern with a single internal scroller.
**Detect:** [S] assert `overscroll-behavior` set on the scroll container.

### P-106 · Browser pull-to-refresh fights in-app pull-to-refresh   [P1] [S][R]
**Correct:** `overscroll-behavior-y: contain` on the scroller.
**Detect:** [S] scanner. [R] assert a top overscroll gesture does not trigger navigation reload.

### P-107 · `100vw` causes horizontal scroll   [P1] [S][R]
**AI writes:** `w-screen` / `width: 100vw`.
**Breaks:** `100vw` includes the scrollbar gutter → a few px of horizontal scroll, which on mobile becomes a visible sideways drag of the whole app.
**Correct:** `width: 100%` / `100dvw`, or `max-width: 100%`.
**Detect:** [S] flag `100vw`. [R] assert `document.scrollingElement.scrollWidth <= clientWidth` at 320/360/390/430px.

### P-108 · Grey tap flash on every touch   [P2] [S]
**Correct:** `-webkit-tap-highlight-color: transparent` on interactive elements, paired with a real `:active` state so feedback isn't lost.
**Detect:** [S] scanner; also assert a visible `:active` style exists (removing the flash *without* replacing it is its own P2).

### P-109 · `:hover` styles latch on touch   [P1] [S]
**AI writes:** `hover:bg-slate-100` everywhere.
**Breaks:** on touch, hover state applies on tap and *stays* until you tap elsewhere — buttons look permanently selected.
**Correct:** wrap hover-dependent styles in `@media (hover: hover) and (pointer: fine)`.
**Detect:** [S] flag hover rules that carry visual state and aren't hover-media-gated.

### P-110 · Double-tap zoom + 300ms tap delay   [P1] [S]
**Correct:** `touch-action: manipulation` on interactive elements (kills double-tap zoom and the delay without disabling pinch zoom).
**Detect:** [S] scanner on buttons/links/tappables.

### P-111 · Long-press selects UI text   [P1] [S]
**AI writes:** nothing — or, worse, `user-select: none` on `*`.
**Breaks:** long-pressing a tab label or button selects it and pops the iOS selection bubbles. Feels like a webpage.
**Correct:** `user-select: none` on **chrome only** (nav, tab bar, buttons, headers) and explicitly `user-select: text` on real content (messages, articles, code, addresses). Never global.
**Detect:** [S] assert `user-select:none` is not applied to `*`/`body`, AND that a content-region allowlist re-enables `text`. [R] assert content is selectable and chrome is not.

### P-112 · Long-press pops the iOS callout menu on images/links   [P2] [S]
**Correct:** `-webkit-touch-callout: none` on UI imagery and icon links (keep it on user content where "save image" is desirable).
**Detect:** [S] scanner.

### P-113 · `position: sticky` silently dies   [P0] [S]
**AI writes:** an unconditional `document.body.style.overflow = 'hidden'` scroll lock on mount.
**Breaks:** sticky needs an unconstrained ancestor scroll context. Locking body overflow kills sticky headers, deadens mobile scroll, and makes dropdowns unreachable — three "unrelated" bugs from one line. *(Already in your `ai-doctrine.md` — it earned its place.)*
**Correct:** gate every scroll lock behind `matchMedia('(min-width: 768px)')` with a resize listener, or use the fixed-body + scroll-restore pattern. Never unconditional.
**Detect:** [S] grep `body.style.overflow`, `documentElement.style.overflow`, `scrollLock`, `overflow-hidden` applied to body — assert each is media-gated. This is the single highest-yield static check in the suite.

### P-114 · Momentum scroll lost in nested scrollers   [P2] [S]
**Correct:** `-webkit-overflow-scrolling: touch` (legacy engines) and avoid nesting scroll containers at all where possible.

### P-115 · No back button in standalone mode   [P0] [S][R]
**Breaks:** installed iOS PWAs have **no browser chrome**. If the design assumed the browser back button, users are trapped on any detail route.
**Correct:** every route deeper than a tab root renders an in-app back affordance; verify against `matchMedia('(display-mode: standalone)')`.
**Detect:** [R] launch in standalone display-mode, walk every route, assert a back control or tab-root status.

### P-116 · External links eject the user from the PWA   [P1] [S][R]
**Breaks:** on iOS, an out-of-scope link opens Safari and the user loses app state with no way back.
**Correct:** keep in-scope navigation in-app; open genuinely external links with explicit intent (`target="_blank" rel="noopener"`) and warn, or render in-app.
**Detect:** [S] enumerate anchors, flag out-of-`scope` hrefs without explicit external handling.

### P-117 · State lost when the PWA is backgrounded   [P1] [R][D]
**Breaks:** iOS aggressively evicts backgrounded web apps; relaunch is a **cold start**. In-memory state and unsaved forms vanish.
**Correct:** persist critical state on `visibilitychange` → `hidden` / `pagehide`, rehydrate on load. Never rely on the process surviving.
**Detect:** [R] simulate `pagehide`/reload, assert state restored. [D] real backgrounding.

### P-118 · Web Push written as if iOS supports it like Chrome   [P1] [S][R]
**Breaks:** iOS supports Web Push only 16.4+, **only when installed to the Home Screen**, and only after a user-gesture permission request. Agents ship a Chrome-shaped flow that silently no-ops on iOS.
**Correct:** feature-detect (`'PushManager' in window` + standalone check), gate the UI, and give iOS users the Add-to-Home-Screen path first.
**Detect:** [S] assert push registration is feature-detected and gesture-bound, not called on load.

### P-119 · Install button that never appears on iOS   [P1] [S][R]
**AI writes:** a `beforeinstallprompt` handler and an "Install app" button.
**Breaks:** `beforeinstallprompt` **does not exist in Safari**. iOS users see nothing, or a dead button.
**Correct:** two paths — Chromium: capture the deferred prompt, call `.prompt()` inside a user gesture. iOS: detect Safari + not-standalone and show an Add-to-Home-Screen instruction sheet (Share → Add to Home Screen).
**Detect:** [R] in a WebKit context, assert an install affordance still renders and is the iOS variant.

### P-120 · Apple touch icon missing or transparent   [P0] [S][L]
**Breaks:** iOS historically ignores manifest icons for the Home Screen; without `<link rel="apple-touch-icon">` you get a blurry screenshot of the page. Transparent PNGs composite to **black**.
**Correct:** 180×180 opaque PNG at `apple-touch-icon`, no alpha, no rounded corners (iOS masks it).
**Detect:** [S] tag present. [L] fetch the asset, assert exact 180×180, assert no alpha channel.

### P-121 · White flash on launch (no iOS splash)   [P2] [S][D]
**Correct:** `apple-touch-startup-image` per device via media queries, or accept the `background_color` splash — but make it match the app background (see P-1003).
**Detect:** [S] presence check + `background_color` consistency.

### P-122 · Status bar style unset   [P2] [S]
**Correct:** `<meta name="apple-mobile-web-app-status-bar-style">` chosen to match the theme (`default` / `black` / `black-translucent`). `black-translucent` requires safe-area handling or content slides under the status bar.
**Detect:** [S] tag present; if `black-translucent`, assert P-103 compliance.

### P-123 · `type="number"` used for phone / OTP / PIN   [P1] [S]
**Breaks:** spinner arrows, scroll-wheel value changes, silently strips leading zeros, and gives the wrong keyboard.
**Correct:** `type="tel"` or `inputmode="numeric" pattern="[0-9]*"`. For OTP add `autocomplete="one-time-code"`.
**Detect:** [S] flag `type="number"` on non-quantity fields.

### P-124 · Native date/time controls styled as if they were divs   [P2] [S][V]
**Breaks:** iOS renders its own wheel picker; custom borders/heights don't apply and the control looks broken.

### P-125 · iOS auto-capitalises the email field   [P2] [S]
**Correct:** `autocapitalize="none" autocorrect="off" spellcheck="false"` on email/username/code fields.
**Detect:** [S] scanner keyed on field type.

---

# §2 · App shell & navigation

### P-201 · Tab bar is a normal div in the page flow   [P0] [S][R][V]
**Breaks:** it scrolls away with the content. The #1 "this isn't an app" signal.
**Correct:** fixed/sticky to the bottom, above content in stacking order, safe-area padded (P-103), and **rendered once in a persistent shell** (P-203).
**Detect:** [R] scroll to the bottom of every tab route, assert the bar's box is unchanged.

### P-202 · Content hidden behind the tab bar   [P1] [R]
**Breaks:** the last list item / submit button is permanently unreachable under the bar.
**Correct:** scroll container gets `padding-bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom))`. Derive both from one token so they can't drift.
**Detect:** [R] assert the last focusable element in each scroller is fully visible when scrolled to the end.

### P-203 · No persistent shell — the whole page re-renders per route   [P1] [R][V]
**Breaks:** the tab bar remounts and flashes on every navigation; transitions stutter; scroll position is lost.
**Correct:** shell layout (tab bar + header) mounted above the router outlet, only the outlet swaps.
**Detect:** [R] tag the bar node, navigate, assert the same DOM node identity survives.

### P-204 · No per-tab scroll restoration   [P1] [R]
**Breaks:** switching tabs and back dumps you at the top of a long feed. Native apps never do this.
**Correct:** persist scrollTop per tab; restore on re-entry; reset on explicit tab re-tap (native "tap active tab → scroll to top" idiom).
**Detect:** [R] scroll, switch away, return, assert scrollTop restored ±2px.

### P-205 · Desktop sidebar shipped to mobile   [P0] [S][R][V]
**Breaks:** an overlay drawer with no backdrop, no close, no focus trap, no ESC, and — often — an unconditional body scroll lock that triggers P-113.
**Correct:** below the breakpoint the sidebar becomes a drawer with: backdrop, focus trap, ESC + backdrop-tap close, `inert` on background content, media-gated scroll lock, and a history entry so Android back closes it (P-208).
**Detect:** [R] open drawer at 390px, assert focus trapped, ESC closes, background `inert`, body lock is media-gated.

### P-206 · Header compaction implemented with scroll jank   [P2] [S][R]
**AI writes:** a non-passive `scroll` listener reading `scrollTop` and writing styles synchronously.
**Breaks:** layout thrash → dropped frames on exactly the low-end devices that matter.
**Correct:** CSS scroll-driven animations where supported; otherwise a **passive** listener + `requestAnimationFrame` batching, or an IntersectionObserver sentinel. Never read-then-write per event.
**Detect:** [S] flag non-passive scroll listeners and sync style writes inside them. [R] assert no long tasks > 50ms during a scripted scroll.

### P-207 · Modal renders behind the fixed bar / stacking-context trap   [P0] [S][R]
**Breaks:** a `transform`, `filter`, `backdrop-filter`, `will-change`, or `contain` on **any ancestor** re-parents `position: fixed` to that ancestor. The modal is then clipped or trapped — and the agent "fixes" it with escalating z-index, which cannot work.
**Correct:** portal overlays to `document.body` (or a top-level `#overlay-root`), or use the top layer via `<dialog>` / popover. Audit ancestors for transform-family properties.
**Detect:** [S] flag fixed/absolute overlays whose ancestor chain contains a transform-family property. [R] assert overlay bounding box covers the viewport and sits above the tab bar.

### P-208 · Hardware/gesture back doesn't close the modal   [P1] [R]
**Breaks:** on Android, back closes the entire app instead of the sheet. On iOS the edge-swipe navigates away.
**Correct:** push a history entry when opening an overlay; close on `popstate`.
**Detect:** [R] open overlay, `history.back()`, assert overlay closed and route unchanged.

### P-209 · Route transitions break on back navigation   [P2] [R][V]
**Correct:** direction-aware transitions driven by navigation type; respect `prefers-reduced-motion` (P-707).

### P-210 · Competing nested scroll containers   [P1] [S][R]
**Breaks:** touch is captured by the wrong scroller; the page feels stuck.
**Correct:** one scroll owner per screen; `overscroll-behavior: contain` on any genuinely nested scroller.

---

# §3 · Responsive layout

### P-301 · Horizontal overflow   [P0] [S][R][V]
The single most common mobile defect. Sources: `100vw` (P-107), negative margins, unbreakable strings (URLs, tokens, wallet addresses), images without `max-width: 100%`, wide tables (P-305), fixed pixel widths (P-302), `min-width` on flex children (P-303).
**Detect:** [R] at 320 / 360 / 390 / 430px assert `scrollWidth <= clientWidth`, and on failure **report the offending element** by walking the DOM for boxes exceeding the viewport. A generic "page overflows" finding is not actionable; naming the node is.

### P-302 · Hardcoded pixel widths   [P1] [S]
**AI writes:** `width: 375px`, `w-[420px]`.
**Correct:** fluid widths + `max-width`.

### P-303 · Flex/grid children won't shrink   [P1] [S][R]
**Breaks:** text refuses to truncate and blows out the row, because flex items default to `min-width: auto`.
**Correct:** `min-width: 0` (or `overflow: hidden`) on the shrinking child; `min-height: 0` for column axes.
**Detect:** [S] flag truncation classes (`truncate`, `text-ellipsis`) whose flex parent chain lacks `min-w-0`.

### P-304 · Long unbreakable strings overflow   [P1] [S][R]
**Correct:** `overflow-wrap: anywhere` / `word-break: break-word` on user-content containers.

### P-305 · Tables dumped raw   [P1] [S][R]
**Correct:** wrap in an `overflow-x: auto` container (never let the page scroll sideways), or switch to a card layout below the breakpoint.

### P-306 · Only tested at one width   [P1] [V]
**Breaks:** agents design at ~390px and never check 320px (SE / older Androids) or 430px (Pro Max).
**Correct:** the suite's canonical width set — 320, 360, 390, 430, 768, 1024 — plus landscape.

### P-307 · Landscape ignored   [P2] [V]
**Breaks:** the tab bar + header eat most of a short landscape viewport; modals become unscrollable.

### P-308 · Touch targets too small   [P1] [S][R]
**Correct:** ≥ 44×44 CSS px (Apple HIG) / 48dp (Material), including padding. Icon-only buttons are the usual offender.
**Detect:** [R] measure every interactive element's box; report each violation with its selector.

### P-309 · Images cause layout shift   [P1] [S][R]
**Correct:** intrinsic `width`/`height` attributes or `aspect-ratio`; `loading="lazy"` below the fold, `fetchpriority="high"` for the LCP image.
**Detect:** [S] `<img>` without dimensions. [R] CLS budget.

### P-310 · Nothing scales with user font-size   [P2] [S]
**Breaks:** everything in `px` ignores the user's accessibility text-size setting.
**Correct:** `rem` for type and spacing that should scale; keep `text-size-adjust` sane.

---

# §4 · Manifest, install & icons

### P-401 · No manifest, or not linked   [P0] [S][L]
**Detect:** [S] `<link rel="manifest">` present and resolvable.

### P-402 · `start_url` wrong   [P0] [L]
**Breaks:** launching the installed app lands on a 404 — classic when the app is served from a subpath, or when the agent writes `/` for an app mounted at `/app/`.
**Correct:** absolute, in-scope, verified to return 200. Add a source param (`?source=pwa`) for analytics.
**Detect:** [L] fetch `start_url`, assert 200 and within `scope`.

### P-403 · `scope` wrong or missing   [P1] [L]
**Breaks:** in-app links fall out of scope and open in a browser tab (see P-116).

### P-404 · Missing 192 / 512 icons   [P0] [L]
**Breaks:** Chromium refuses to treat the app as installable.
**Detect:** [L] both sizes present, fetchable, and **actually those pixel dimensions** — see P-406.

### P-405 · No `maskable` icon → logo cropped into a circle   [P1] [L]
**AI writes:** the same PNG listed for both `"purpose": "any"` and `"maskable"`.
**Breaks:** Android applies a mask; a full-bleed logo loses its edges — usually decapitating the wordmark.
**Correct:** a *separate* maskable asset with the logo inside the 40% safe zone (centred circle of radius 40% of the icon), padded background to the edges.
**Detect:** [L] a maskable entry exists and is a different file from `any`; analyse pixel content outside the safe zone.

### P-406 · Declared icon size ≠ actual file size   [P0] [L]
**Breaks:** the manifest says `512x512`, the file is 192 — install prompts vanish with no error. Agents copy manifest boilerplate without generating the assets.
**Detect:** [L] decode each icon, assert the real dimensions match the `sizes` string. High-yield, trivially automatable, almost never checked.

### P-407 · Transparent icon → black square on iOS   [P0] [L]
**Detect:** [L] assert no alpha in the apple-touch-icon and in the maskable icon.

### P-408 · `theme_color` / `<meta name="theme-color">` mismatch or dark-mode-blind   [P1] [S][L]
**Breaks:** white status/URL bar strip above a dark app.
**Correct:** manifest `theme_color` **and** `<meta name="theme-color">` with `media="(prefers-color-scheme: dark|light)"` variants, all agreeing with the actual painted background.
**Detect:** [S] cross-check the three sources. [R] sample the real background pixel and compare.

### P-409 · `background_color` mismatched → coloured flash on launch   [P2] [L]
**Correct:** equals the app's true initial background, per scheme.

### P-410 · Manifest `id` missing   [P1] [L]
**Breaks:** without a stable `id`, changing `start_url` makes the browser treat it as a *different app* — installs duplicate instead of updating.

### P-411 · `short_name` too long   [P2] [L]
**Correct:** ≤ 12 chars or it's ellipsised under the home-screen icon.

### P-412 · No `screenshots` / `form_factor`   [P2] [L]
**Breaks:** Android shows the minimal install chip instead of the rich install dialog.

### P-413 · Manifest unreachable — MIME, auth, or CDN   [P0] [L]
**Breaks:** served as `text/html`, or behind auth without `crossorigin="use-credentials"` → install silently unavailable.
**Detect:** [L] fetch as an unauthenticated client, assert `application/manifest+json` and valid JSON.

### P-414 · `orientation` locked wrongly   [P2] [L]

### P-415 · Not served over HTTPS   [P0] [L]
No secure context → no service worker, no install, no push.

### P-416 · `prompt()` called outside a user gesture   [P1] [S]
**Breaks:** the deferred install prompt is discarded by the browser and the button does nothing.

### P-417 · Already-installed state not detected   [P2] [S][R]
**Correct:** hide install UI when `matchMedia('(display-mode: standalone)')` matches or after `appinstalled`.

---

# §5 · Service worker, caching & updates

**The most dangerous category.** Cache bugs don't fail loudly — they pin users to a
dead build, and no amount of redeploying fixes it.

### P-501 · No service worker at all   [P0] [L]
A manifest alone is not a PWA. Common when the agent "adds PWA support" in one pass.

### P-502 · Cache-first on HTML/navigation   [P0] [S][R]
**Breaks:** the catastrophic one. Users are pinned to the old app **forever**; your deploys are invisible; you cannot fix it remotely because the fix itself is behind the cache.
**Correct:** **network-first (or stale-while-revalidate with a fast timeout) for navigations**; cache-first *only* for content-hashed immutable assets.
**Detect:** [S] classify the fetch handler's navigation strategy — reject cache-first for `request.mode === 'navigate'`. [R] deploy-B simulation (P-512).

### P-503 · No update flow — new SW waits forever   [P1] [S][R]
**Breaks:** the new worker sits in `waiting` until every tab closes. On an installed PWA that can be days.
**Correct:** detect `updatefound` → `installed` with an existing controller → surface a non-blocking "Update available — reload", then `skipWaiting` + `clients.claim` **on user confirmation**.

### P-504 · `skipWaiting()` fired unconditionally   [P0] [S]
**Breaks:** the inverse mistake, and agents love it as a "fix" for P-503. Assets swap under a live tab → the running bundle requests chunks that no longer exist → white screen mid-session.
**Correct:** only after user-confirmed reload, or paired with a controlled reload on `controllerchange`.
**Detect:** [S] `skipWaiting` at install-time with no reload coordination.

### P-505 · Lazy chunk 404s after deploy   [P0] [S][R]
**Breaks:** the loaded shell references `chunk-A1B2.js`; the new deploy deleted it. Any lazy route now white-screens. This is the most common real-world PWA outage and agents essentially never handle it.
**Correct:** a global dynamic-import error handler that force-reloads once (guarded against reload loops), plus a retention window for old chunks on the origin.
**Detect:** [S] assert a chunk-error boundary exists. [R] deploy-B simulation with the old chunk removed.

### P-506 · POST / mutations cached   [P0] [S]
**Correct:** never cache non-GET; never serve API mutations from cache.

### P-507 · Opaque cross-origin responses cached   [P1] [S]
**Breaks:** opaque responses have unknown status (a 404 caches happily) and are padded — they blow the quota.

### P-508 · SW scope too narrow   [P0] [S]
**Breaks:** `/static/sw.js` can only control `/static/`. The app is uncontrolled and nothing works.
**Correct:** serve from the origin root, or set `Service-Worker-Allowed`.

### P-509 · No offline fallback   [P1] [R]
**Correct:** a precached offline document for failed navigations; enable `navigationPreload` to avoid the SW boot penalty.
**Detect:** [R] go offline, navigate, assert a real offline page rather than the browser error.

### P-510 · Caches never versioned or purged   [P1] [S]
**Correct:** versioned cache names + delete non-current caches on `activate`.

### P-511 · Quota exceeded unhandled   [P2] [S]

### P-512 · The update path is never tested   [P0] [R]
**Breaks:** every SW suite tests a *first* install. Nearly none test **deploy A → deploy B on an existing client**, which is where P-502/503/504/505 all live.
**Correct:** the suite must ship a two-build harness: serve build A, install, then swap the origin to build B and assert the client converges to B (with old chunks deleted).
**Detect:** [R] this is the single most valuable runtime test in the suite.

### P-513 · SW active in development   [P1] [S]
**Breaks:** the dev sees stale output and concludes the AI broke something; hours vanish.
**Correct:** register only in production, and ship an unregister-and-clear escape hatch.

### P-514 · `sw.js` / manifest served with long cache TTL   [P0] [S]
**Breaks:** the CDN pins the *worker itself*. Users can never receive the fix.
**Correct:** `Cache-Control: no-cache` on `sw.js` and the manifest; long immutable TTLs only on hashed assets.
**Detect:** [S] response-header assertion against the deployed origin.

### P-515 · Auth headers / credentials dropped by the fetch handler   [P1] [S][R]
**Breaks:** a naive `fetch(event.request)` re-issue loses credentials mode → random 401s only for installed users.

### P-516 · Range requests broken (audio/video)   [P2] [S]
**Breaks:** media won't seek, or won't play at all on Safari, when the SW returns a non-range response.

### P-517 · `localStorage` used for offline data   [P1] [S]
**Breaks:** ~5MB cap, synchronous (jank on the main thread), and **iOS ITP evicts it after 7 days of non-use** — offline data silently disappears.
**Correct:** IndexedDB for anything meaningful; treat all client storage as evictable; request persistence where it matters.

### P-518 · `navigator.onLine` trusted   [P2] [S]
**Breaks:** it reports "online" on captive portals and any LAN-only connection.
**Correct:** confirm with a real request before declaring connectivity.

### P-519 · Background/periodic sync assumed universal   [P2] [S]
Chromium-only. Must be feature-detected with a foreground fallback.

---

# §6 · Performance on real phones

### P-601 · No code splitting   [P1] [S][L]
### P-602 · Font FOIT / no preload   [P1] [S]
`font-display: swap` + preload the primary face. (Your standing rule mandates embedded modern fonts — this is where agents drop the ball on *loading* them.)
### P-603 · Whole icon library imported   [P1] [S]
`import * from 'lucide-react'` ships thousands of icons for the six you use.
### P-604 · Unoptimised images   [P1] [S][L]
No `srcset`/`sizes`, no AVIF/WebP, no lazy loading, LCP image not prioritised.
### P-605 · Animating layout properties   [P1] [S]
`width`/`height`/`top`/`left`/`margin` instead of `transform`/`opacity` → guaranteed jank on mid-range Android.
### P-606 · `will-change` sprayed everywhere   [P2] [S]
Each one is a permanent compositor layer; mobile GPU memory is not free.
### P-607 · Long lists unvirtualised   [P1] [R]
1,000 rows of DOM freezes low-end devices. Virtualise, or at minimum `content-visibility: auto`.
### P-608 · Heavy hydration / everything a client component   [P1] [S]
### P-609 · Third-party scripts render-blocking   [P1] [L]
### P-610 · Install prompt / cookie banner injected above content   [P1] [R]
Pushes the page down after paint — a self-inflicted CLS spike from the PWA layer itself.
### P-611 · Perf budget measured on desktop   [P1] [L]
**Correct:** audit with mobile CPU throttling (4–6×) and a throttled network, not on your M-series laptop.

---

# §7 · Accessibility

Agents are consistently weakest here, and several "app-like" instincts *cause* a11y regressions.

### P-701 · Pinch-zoom disabled   [P0] [S]
**AI writes:** `user-scalable=no, maximum-scale=1` — very often as the "fix" for P-101.
**Breaks:** WCAG 1.4.4 failure. Low-vision users cannot zoom. iOS 10+ ignores it in Safari anyway, so it fails *and* doesn't work.
**Correct:** fix input zoom with 16px fonts (P-101). Leave pinch zoom enabled.
> **Direct note on the brief:** "no zoom allowed" is right for *double-tap and input-focus zoom* (P-110, P-101) and wrong for *pinch zoom*. The suite should enforce the first two and actively **block** the third. Flagging because it inverts one requirement as stated.

### P-702 · `user-select: none` applied globally   [P1] [S]
Breaks copy for real content and degrades assistive tooling. See P-111 — chrome only.

### P-703 · Icon-only buttons with no accessible name   [P1] [S][R]
The tab bar is the usual offender. `aria-label` or visually-hidden text.

### P-704 · `<div onClick>` instead of a button   [P1] [S][R]
No keyboard, no role, no focus, no Enter/Space.

### P-705 · `outline: none` with no focus replacement   [P1] [S]
**Correct:** `:focus-visible` ring. Removing focus styling "because it looked bad on mobile" breaks all keyboard users.

### P-706 · Focus not trapped in overlays, not restored on close   [P1] [R]
Focus escapes to the background page behind the modal.

### P-707 · `prefers-reduced-motion` ignored   [P1] [S]
Page transitions and parallax cause real vestibular harm.

### P-708 · SPA route changes unannounced   [P2] [R]
Screen-reader users get no signal that the view changed. Live region + focus management on navigation.

### P-709 · Contrast failures   [P1] [S][V]
Agents reach for tasteful mid-greys that fail 4.5:1 — especially placeholder text and secondary labels.

### P-710 · Inputs without labels; errors not associated   [P1] [S]
Placeholder-as-label is not a label. Errors need `aria-describedby` + `aria-invalid`.

### P-711 · Background content not `inert` behind a modal   [P1] [R]

### P-712 · Heading order / landmarks broken   [P2] [S]

---

# §8 · RTL & internationalisation

First-class here, not an afterthought — most of your surfaces are Arabic.

### P-801 · Physical CSS properties instead of logical   [P0 for RTL] [S]
`margin-left`, `padding-right`, `left`, `text-align: left`, `border-l`.
**Correct:** `margin-inline-start`, `padding-inline-end`, `inset-inline-start`, `text-align: start`. In Tailwind: `ms-*`/`me-*`/`ps-*`/`pe-*`, not `ml-*`/`mr-*`.
**Detect:** [S] flag physical properties in any RTL-capable surface — mechanical and very high yield.

### P-802 · Directional icons not mirrored   [P1] [S][V]
The back chevron points the wrong way in RTL. Mirror direction-bearing glyphs; never mirror logos, media controls, or clocks.

### P-803 · `dir` / `lang` not set   [P1] [S]
Breaks the bidi algorithm and screen-reader pronunciation.

### P-804 · Mixed LTR inside RTL scrambles   [P1] [S][V]
Phone numbers, `+970`, URLs, latin brand names inside Arabic text reorder wrongly.
**Correct:** `<bdi>` / `unicode-bidi: isolate` around embedded LTR runs.

### P-805 · Font lacks Arabic glyphs   [P1] [S][V]
Falls back to a system face — inconsistent weights, broken ligatures, tofu. Enforce Arabic-capable faces (Tajawal / Cairo / IBM Plex Sans Arabic per your standing rule) with an explicit Arabic subset.

### P-806 · Animations directionally wrong in RTL   [P2] [V]
Drawers slide in from the wrong edge; "next" transitions run backwards.

### P-807 · Hardcoded strings   [P1] [S]

### P-808 · Numerals / dates / currency unlocalised   [P2] [S]
Arabic-Indic vs Latin digits used inconsistently within one screen.

---

# §9 · Forms & the mobile keyboard

### P-901 · Wrong keyboard type   [P1] [S]
Missing `inputmode` / wrong `type`: email, tel, numeric, decimal, search, url.
### P-902 · `autocomplete` tokens missing   [P1] [S]
Kills password managers and — critically — **`autocomplete="one-time-code"`** for iOS SMS autofill.
### P-903 · Keyboard covers the focused field   [P1] [R][D]
**Correct:** scroll the focused element into view on `focus`, accounting for the visual viewport (P-104).
### P-904 · Fixed submit CTA buried by the keyboard   [P1] [R][D]
### P-905 · `enterkeyhint` unset   [P2] [S]
The Return key should read Go / Search / Send / Next.
### P-906 · Enter doesn't submit   [P2] [R]
### P-907 · Paste blocked on OTP inputs   [P1] [S][R]
Split six-box OTP components that reject a pasted code are an agent classic.
### P-908 · Validation only on submit, native bubbles unstyled   [P2] [S]

---

# §10 · Theming & system integration

### P-1001 · Theme flash on load (FOUC)   [P1] [S][R]
No blocking inline script to apply the stored/system theme before first paint → white flash into a dark app on every cold start, which installed PWAs do constantly.
### P-1002 · `color-scheme` not declared   [P2] [S]
Native controls, scrollbars, and form widgets stay light inside a dark app.
### P-1003 · Splash `background_color` ≠ app background   [P2] [L]
### P-1004 · `theme-color` not switched per scheme   [P1] [S]
See P-408.
### P-1005 · Hardcoded hex instead of tokens   [P2] [S]
Guarantees the dark variant is missed somewhere.

---

# §11 · Build, deploy & platform config

### P-1101 · Wrong `base` path on subpath deploys   [P0] [S]
Manifest, SW scope, and asset URLs all break together.
### P-1102 · `Cache-Control` wrong on `sw.js` / manifest   [P0] [S]
See P-514 — worth stating separately because it lives in server/CDN config, not app code, so it survives every app-side fix.
### P-1103 · Framework PWA plugin misconfigured   [P1] [S]
`next-pwa` / `vite-plugin-pwa` with App Router, static export, or middleware interactions — precache manifest generated for the wrong output dir.
### P-1104 · Installability never actually verified   [P1] [L]
No one ran the audit; "it has a manifest" is assumed to mean installable.
### P-1105 · Missing `.well-known/assetlinks.json` for TWA   [P2] [S]
Only if shipping to Play via Trusted Web Activity — the URL bar stays visible without it.

---

# §12 · What agents never test (the meta-failures)

These are why the catalog needs a *verifier*, not documentation.

| | failure |
|---|---|
| **P-1201** | Never opened on a real device — emulation passes, iOS fails. |
| **P-1202** | Tested at desktop viewport only. |
| **P-1203** | **Never tested the second deploy** — the update path (§5) is where the P0s live. |
| **P-1204** | Never tested offline. |
| **P-1205** | Never tested the install flow end-to-end, on either platform. |
| **P-1206** | Never tested with the keyboard open. |
| **P-1207** | Never tested in RTL. |
| **P-1208** | Never tested with a screen reader or keyboard-only. |
| **P-1209** | Never tested on a throttled CPU/network. |
| **P-1210** | Declared "done" from a green build — no runtime evidence. |

---

## Coverage summary

| § | area | entries | P0 |
|---|---|---|---|
| 1 | iOS Safari & WebKit | 25 | 4 |
| 2 | App shell & navigation | 10 | 3 |
| 3 | Responsive layout | 10 | 1 |
| 4 | Manifest, install & icons | 17 | 7 |
| 5 | Service worker & caching | 19 | 8 |
| 6 | Performance | 11 | 0 |
| 7 | Accessibility | 12 | 1 |
| 8 | RTL & i18n | 8 | 1 |
| 9 | Forms & keyboard | 8 | 0 |
| 10 | Theming | 5 | 0 |
| 11 | Build & deploy | 5 | 2 |
| 12 | Untested paths (meta) | 10 | — |
| | **total** | **140** | **27** |

**Detection feasibility**

- **~55%** are catchable **statically** — no browser needed, runs on every save. Cheapest and highest yield: P-113, P-801, P-107, P-101, P-303.
- **~35%** need a **runtime** browser assertion — and the two highest-value are P-512 (deploy A→B) and P-301 (overflow with the offending node named).
- **~10%** are **device-only** and must be reported as `UNVERIFIED`, never as passing: P-101 (true zoom behaviour), P-104/P-903 (keyboard geometry), P-117 (backgrounding), P-121 (splash), P-1201.

## Two honest flags

1. **"No zoom allowed" as stated is half-wrong.** Blocking double-tap and input-focus zoom is correct and the suite will enforce it. Blocking *pinch* zoom is a WCAG 1.4.4 failure that iOS Safari overrides anyway — the suite should refuse to emit it and fail the check if it finds it (P-701).
2. **"No text selection allowed" as stated is half-wrong too.** Correct for chrome (tabs, buttons, headers); applying it globally breaks copy on real content and is a common agent overreach. The suite enforces the chrome/content split (P-111, P-702).
