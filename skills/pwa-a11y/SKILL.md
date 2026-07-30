---
name: pwa-a11y
description: Use to stop "app feel" from becoming an accessibility regression — keep pinch-zoom enabled, restore focus styles, give icon buttons names, make div-buttons real buttons, trap and restore focus in overlays, gate motion, and label inputs. Fixes §7 accessibility (P-701..P-712). Trigger phrases: "accessibility pass", "screen reader can't use the tab bar", "focus outline is gone", "icon buttons have no label", "trap focus in the modal", "prefers-reduced-motion", "don't disable pinch zoom", "inputs missing labels".
---

# pwa-a11y

Catches the accessibility regressions that "make it feel like an app" changes reliably
introduce — the a11y counterweight to the rest of the suite. Covers §7 (**P-701..P-712**).

**Audit first:**

```bash
node skills/pwa-audit/scripts/run-audit.mjs <path-to-app>
```

Some of §7 is statically detectable (P-701 pinch-zoom, P-703 icon buttons, P-705 focus,
P-707 reduced-motion, P-710 labels, P-712 headings); focus trapping, contrast, and route
announcements are `runtime` and confirmed by `pwa-verify`.

## The correction this skill hard-enforces (design §8)

- **P-701 — never disable pinch zoom.** `user-scalable=no` / `maximum-scale=1` (or `<1`) is
  a **WCAG 1.4.4 failure** the suite must never emit, and iOS Safari ignores it anyway. This
  is a **FAIL on sight, never a suggestion.** Fix input-focus zoom with 16px fonts (P-101,
  `pwa-native-feel`); leave pinch zoom enabled.
- **P-702** — `user-select: none` on **chrome only** (nav, tab bar, buttons, headers), never
  globally; real content stays selectable (paired with P-111). Global application breaks
  copy and degrades assistive tooling.

## What it fixes

- **P-703** — icon-only buttons get an accessible name (`aria-label` or visually-hidden text). The tab bar is the usual offender — a screen-reader user hears nothing otherwise.
- **P-704** — use a real `<button>` (or add `role="button"`, `tabIndex`, and Enter/Space handling) instead of `<div onClick>`. A div has no keyboard, role, focus, or activation.
- **P-705** — replace `outline: none` with a `:focus-visible` ring. Removing focus styling "because it looked bad on mobile" breaks every keyboard user.
- **P-706** — trap focus inside an open overlay; **restore focus to the triggering element** on close.
- **P-707** — gate non-essential motion behind `@media (prefers-reduced-motion: no-preference)`. Page transitions and parallax cause real vestibular harm (pairs with P-209).
- **P-708** — announce SPA route changes via a live region + focus management, or screen-reader users get no signal the view changed.
- **P-709** — meet WCAG contrast (4.5:1 normal text, 3:1 large). Tasteful mid-greys on placeholders and secondary labels are the usual failures.
- **P-710** — every input gets a real `<label>` (or `aria-label`); a placeholder is not a label. Wire errors with `aria-describedby` + `aria-invalid`.
- **P-711** — apply `inert` (or `aria-hidden` + focus containment) to background content while a modal is open, so it's unreachable by keyboard and screen reader (pairs with P-706, and with the drawer in `pwa-shell` P-205).
- **P-712** — keep heading levels sequential (no skips) and use one well-formed set of landmark regions (`main`/`nav`/`header`) per page.

## Standalone vs superpowers

Works standalone. When `superpowers` is available (detect **by capability** — is
`test-driven-development` invocable now? — never by path-sniffing):

- **`test-driven-development`** — write the probe (grep the viewport meta and **fail** on
  `user-scalable=no`; open a modal and assert focus is trapped then restored on close;
  assert every interactive element has an accessible name), watch it fail, fix, watch it pass.
- **`verification-before-completion`** / `pwa-verify` — the done-gate. Run a full
  screen-reader and keyboard-only pass before claiming done (P-1208); focus trapping,
  contrast, and route announcements only surface at runtime.

Absent superpowers: navigate the whole app keyboard-only (Tab/Shift-Tab/Enter/Escape),
run one screen reader (VoiceOver or TalkBack), and check contrast with any WCAG checker.
Confirm the viewport meta has **no** `user-scalable=no`.
