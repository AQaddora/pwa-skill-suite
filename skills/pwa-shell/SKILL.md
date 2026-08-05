---
name: pwa-shell
description: 'Use when making a web app''s navigation feel like an installed app — persistent tab bar, header compaction, sidebar-to-drawer, scroll restoration, hardware back, overlay stacking, and cross-platform safe areas. Fixes app-shell entries P-201..P-210 and P-547. Trigger phrases: "tab bar scrolls away", "make the shell persistent", "sidebar should be a drawer on mobile", "modal renders behind the tab bar", "back button doesn''t close the sheet", "restore scroll position per tab".'
---

# pwa-shell

Builds and repairs the **app shell** — the persistent chrome (tab bar, header, drawers,
overlays) that separates "an app" from "a website in a box". Covers §2 of the catalog,
entries **P-201..P-210**.

It also owns **P-547**: safe-area insets are not iOS-only. Apply
`env(safe-area-inset-*)` without UA or WebKit gates so Android edge-to-edge installs protect
their gesture/navigation areas too; unsupported insets safely resolve to zero.

**Audit before you touch anything.** Run `pwa-audit` first so the changes are driven by
findings, not guesses:

```bash
node "<pwa-audit-skill-dir>/scripts/run-audit.mjs" "<path-to-app>"
```

Resolve `<pwa-audit-skill-dir>` from the selected `pwa-audit/SKILL.md`, not from the target
repository.

Most of §2 is `runtime`/`visual` in the catalog — a static scan is a weak proxy (it can
read a component's CSS but not JS-driven positioning or DOM node identity across a
navigation). Treat static passes here as "nothing obvious", not "correct"; the
authoritative check is the runtime pack (`pwa-verify`, Phase 2).

## What it fixes

| ID | Failure | The fix this skill applies |
|---|---|---|
| **P-201** | Tab bar scrolls away with content (the #1 "not an app" tell) | Fix/sticky to the bottom, above content in stacking order, safe-area padded (P-103), rendered **once** in a persistent shell (P-203). |
| **P-202** | Last item / submit button trapped under the bar | Scroll container gets `padding-bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom))`. Derive both from one token so they can't drift. |
| **P-203** | Whole page re-renders per route; bar flashes | Shell layout (tab bar + header) mounts **above** the router outlet; only the outlet swaps. |
| **P-204** | No per-tab scroll restoration | Persist `scrollTop` per tab, restore on re-entry, reset to top on active-tab re-tap (the native idiom). |
| **P-205** | Desktop sidebar shipped to mobile | Below the breakpoint the sidebar becomes a drawer: backdrop, focus trap, ESC + backdrop-tap close, `inert` background, **media-gated** scroll lock (never unconditional — that is P-113), and a history entry so Android back closes it (P-208). |
| **P-206** | Header compaction with scroll jank | CSS scroll-driven animation where supported; otherwise a **passive** listener + `requestAnimationFrame` batching or an IntersectionObserver sentinel. Never read-then-write per event. |
| **P-207** | Modal behind the fixed bar, clipped, or shaped like a desktop popup | Portal overlays to `document.body` (or `#overlay-root`), or use the top layer via `<dialog>`/popover. Bound the visible surface to the visual viewport, give long content one internal scroll owner, keep close/actions reachable, and use safe-area padding. Escalating `z-index` cannot fix a transformed/contained ancestor. |
| **P-208** | Hardware/gesture back doesn't close the modal | Push a history entry when opening an overlay; close on `popstate`. |
| **P-209** | Route transitions break on back navigation | Direction-aware transitions driven by navigation type; gate motion behind `prefers-reduced-motion` (P-707). |
| **P-210** | Competing nested scroll containers | One scroll owner per screen; `overscroll-behavior: contain` on any genuinely nested scroller. |

## Order of operations

1. **P-203 first.** A persistent shell is the precondition for P-201, P-204, and P-209 —
   without a shell that outlives the route, the others cannot hold. Mount tab bar + header
   above the outlet.
2. **P-201 / P-202** — pin the bar, then reserve its height in every scroller from one shared token.
3. **P-205** — convert the sidebar to a drawer. Reuse the overlay primitive you build for P-207/P-208.
4. **P-207 / P-208** — one overlay primitive: portalled to a top-level root,
   history-backed, focus-trapped, viewport-bounded, and internally scrollable. Every modal,
   sheet, and drawer shares it. Declare nested or stateful journeys in
   `pwa-probes.config.json` under `scenarios.overlays` instead of adding repository-specific
   logic to the probe.
5. **P-204 / P-206 / P-209 / P-210** — polish once the structure is right.

The recurring anti-pattern across this section is the **unconditional body scroll lock**
(`document.body.style.overflow = 'hidden'` on mount). It kills sticky, deadens scroll, and
strands dropdowns — one line, three "unrelated" bugs. That is **P-113**; every scroll lock
here must be `matchMedia`-gated with a resize listener, or use the fixed-body + scroll-restore pattern.

## Standalone vs superpowers

Works standalone — the table above is self-contained guidance. When the `superpowers`
plugin is available in this session (detect **by capability** — is `test-driven-development`
invocable as a skill right now? — never by sniffing plugin paths):

- **`test-driven-development`** — write the runtime probe for the fix (tag the bar node,
  navigate, assert the same DOM node survives; scroll, switch tab, return, assert
  `scrollTop` restored ±2px; open overlays at short portrait/landscape sizes in LTR/RTL and
  assert containment, internal scrolling, reachable close controls, and stacking), watch it
  fail, apply the fix, watch it pass.
- **`verification-before-completion`** / `pwa-verify` — the done-gate. No "shell fixed"
  claim without a green runtime report; several §2 entries (P-203, P-204, P-207) are only
  provable at runtime.

Absent superpowers, apply the fixes and verify manually on a device: scroll every tab route
to the bottom (bar unchanged), open every overlay and press hardware back (it closes, route
unchanged), switch tabs and return (scroll restored).
