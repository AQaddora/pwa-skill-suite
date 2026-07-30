---
name: pwa-manifest
description: Use when an app won't install, shows the wrong icon, flashes the wrong colour on launch, or has a manifest that lint passes but browsers reject — icon generation and verification, theming, splash, and the install flow on both iOS and Chromium. Fixes §4 manifest (P-401..P-417) and §10 theming (P-1001..P-1005). Trigger phrases: "app isn't installable", "generate PWA icons", "manifest icons are the wrong size", "no install prompt on iOS", "white flash on launch", "theme-color is wrong in dark mode", "add a web manifest".
---

# pwa-manifest

Makes the app genuinely installable and correctly themed on both platforms: manifest
validity, **icon generation and pixel-level verification**, splash, and the two-path
install flow. Covers §4 (**P-401..P-417**) and §10 (**P-1001..P-1005**).

**Audit first:**

```bash
node skills/pwa-audit/scripts/run-audit.mjs <path-to-app>
```

Most of §4 is `lighthouse`-class in the catalog — it needs the **built/deployed** artefact
(fetch the manifest, decode each icon, hit `start_url`), not just source. A static pass is
not proof of installability; the authoritative check is a Lighthouse/installability audit
(P-1104), which `pwa-verify` runs.

## §4 — Manifest, install & icons

**Manifest presence & reachability**
- **P-401** — `<link rel="manifest" href="/manifest.webmanifest">` present and resolvable.
- **P-413** — served as `application/manifest+json`, valid JSON, unauthenticated (or `crossorigin="use-credentials"` with matching CORS). Not `text/html`.
- **P-415** — origin is HTTPS (localhost exempt in dev). No secure context → no SW, no install, no push.

**Routing keys**
- **P-402** — `start_url` absolute, in-scope, returns **200** (not a 404 on subpath deploys). Add `?source=pwa` for analytics.
- **P-403** — `scope` set to the app's real root; keep in-app navigation inside it (out-of-scope links open a browser tab — see P-116).
- **P-410** — a stable manifest `id` that never changes across deploys (else `start_url` changes install a duplicate instead of updating).

**Icons — generate *and* verify**
- **P-404** — both `192×192` and `512×512` present and fetchable.
- **P-406** — decode each icon; the real pixel dimensions must match the declared `sizes` string. Agents copy boilerplate without generating assets; a `512×512` declaration on a 192px file makes the install prompt vanish silently. **High-yield, trivially automatable, almost never checked.**
- **P-405** — a **separate** `maskable` asset (different file from `any`), logo inside the 40% safe zone, background padded to the edges.
- **P-407** — opaque PNGs, **no alpha**, for the apple-touch-icon and maskable icon (transparent → solid black on iOS).

**Install UX & metadata**
- **P-416** — call the deferred prompt's `.prompt()` synchronously inside a user-gesture handler, never on a timer/on load.
- **P-417** — hide install UI when `matchMedia('(display-mode: standalone)')` matches or after `appinstalled`.
- **P-408** — manifest `theme_color` and `<meta name="theme-color">` (light/dark `media` variants) all agree with the actual painted background.
- **P-409** — `background_color` equals the app's true initial background per scheme (no colour flash).
- **P-411** — `short_name` ≤ 12 chars (else ellipsised under the icon).
- **P-412** — `screenshots` with `form_factor` for the rich Android install dialog.
- **P-414** — only lock `orientation` when the app genuinely requires one; otherwise leave it unset.

**The two-path install flow.** `beforeinstallprompt` does not exist in Safari. Ship two
code paths (this is P-119, owned with `pwa-native-feel`):
- **Chromium** — capture the deferred prompt, call `.prompt()` inside a gesture (P-416).
- **iOS** — detect Safari + not-standalone and show an Add-to-Home-Screen sheet (Share → Add to Home Screen).

## §10 — Theming & system integration

- **P-1001** — inline a **blocking** `<head>` script that reads the stored/system theme and applies it (class or `color-scheme`) **before first paint**. Installed PWAs cold-start constantly; a FOUC into a dark app is jarring.
- **P-1002** — declare `color-scheme` (`light`/`dark`/`light dark`) so native controls, scrollbars, and form widgets match the theme.
- **P-1003** — manifest `background_color` (the splash) equals the app's real initial background per scheme (splash ↔ first paint match).
- **P-1004** — `theme-color` meta **variants** scoped with `media="(prefers-color-scheme: dark|light)"`, matching the manifest and painted background (same as P-408).
- **P-1005** — colours flow through theme tokens/CSS custom properties, not hardcoded hex, so both light and dark variants stay in sync.

## Icon generation note

When you (re)generate icons, generate the full set from one source and **assert each output's
real dimensions and alpha channel** before writing the manifest — that closes P-404, P-406,
and P-407 in one pass. Ship: `192×192` and `512×512` (`purpose: any`), a distinct
`512×512` maskable (opaque, safe-zone padded), and a `180×180` opaque apple-touch-icon.

## Standalone vs superpowers

Works standalone. When `superpowers` is available (detect **by capability** — is
`verification-before-completion` invocable now? — never by path-sniffing):

- **`test-driven-development`** — the installability audit *is* the failing test: run it,
  watch it fail, add/fix the manifest and icons, watch it pass.
- **`verification-before-completion`** / `pwa-verify` — the done-gate. "It has a manifest"
  is **not** "installable" (P-1104) — require a real audit pass, on both platforms
  end-to-end (P-1205), before claiming done.

Absent superpowers: run Chrome DevTools → Application → Manifest, confirm "installable",
decode each icon (`file`/`identify`) against its `sizes`, then walk the real install flow on
an Android device and an iPhone.
