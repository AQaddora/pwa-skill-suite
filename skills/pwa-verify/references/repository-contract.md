# Repository-neutral verification contract

Use this contract when the target is not a plain static directory. It deliberately names
capabilities, not frameworks, clouds, CI vendors, or hosting products.

## Inputs

The CLI argument is the readable source root. Runtime behavior should normally be described
by a non-executable `pwa-probes.config.json` in that root:

```json
{
  "baseURL": "http://127.0.0.1:4173",
  "target": "dev-server",
  "routes": ["/", "/catalog", "/cart"],
  "auth": {
    "storageState": "./test-state.json",
    "success": { "selector": "[data-authenticated-user]" }
  },
  "selectors": {
    "tabbar": "[data-app-tabs]",
    "overlayTrigger": "[data-open-menu]"
  },
  "scenarios": {
    "overlays": [
      {
        "name": "main menu",
        "route": "/",
        "triggers": ["[data-open-menu]"],
        "overlay": "[role=\"dialog\"]",
        "close": "[data-close-menu]",
        "direction": "document"
      }
    ]
  }
}
```

Prefer `data-pwa-role` annotations over selectors where the application can add them.
The same contract works for static generators, client-rendered apps, server-rendered apps,
and existing deployed origins because the suite only needs an HTTP origin and observable
DOM behavior. The suite does not start an application-specific dev server or deploy it.
For a plain static artifact, omit `baseURL` and set `"staticRoot": "./dist"` (or another
existing, reviewed build-artifact directory strictly below the repository root). The path
is resolved canonically: `"."`, aliases of the repository root, missing paths, files, and
symlinks outside the repository are rejected, and the artifact must have a contained
`index.html` entry document. `--allow-external-targets` never relaxes this
filesystem boundary. The static server also refuses hidden files (except `.well-known`),
source maps/source-language files, lock/config metadata, and key material. For a plain site
whose public files live at repository root, run its preview server or copy the reviewed
artifact into a dedicated child directory. Never point `staticRoot` at a repository or
source tree.

JSON is non-executable, but it can still direct a browser and attach auth state. The loader
therefore keeps auth state inside the repository and restricts `baseURL` to localhost by
default. `--allow-external-targets` explicitly trusts a remote origin or external state file.
The contract rejects unknown keys at the root and in each nested object, including misspelled
selector roles and scenario fields, rather than silently replacing them with defaults.

When `auth` is configured, it must contain exactly one seed — `storageState` or `login` — and
exactly one provider-neutral success postcondition under `auth.success`:

```json
{ "storageState": "./test-state.json", "success": { "selector": "[data-authenticated-user]" } }
```

The alternative postcondition is a same-origin path glob such as
`{ "urlPattern": "/account/*" }`; `*` matches within the path, query, and fragment observed
after navigation. Absolute/cross-origin patterns are rejected. Choose a selector that exists
only for an authenticated user and is available on every protected route being probed, or a
URL pattern that those routes satisfy. The harness applies the state to every configured route
by default and verifies the postcondition after each authenticated navigation. An unreadable
seed produces typed `BLOCKED / AUTH_SEED_FAILED`; a seed that lands on a public, login, or
otherwise unauthenticated page produces typed `BLOCKED / AUTH_POSTCONDITION_FAILED`. It never
falls back to a public/empty page and claims PASS.
If an `auth.login` callback is required, use `pwa-probes.config.mjs` and opt in with
`--allow-config-code` only after reviewing the repository. Never use production credentials
or a privileged browser profile for contributed code.

Supported `selectors` keys are `tabbar`, `header`, `scroller`, `shell`, `overlay`,
`overlayTrigger`, and `overlayCloseVia`. Overlay journey objects support `name`, `route`, one
of `trigger`/`triggers`, `overlay`, `close`, and `direction`.

## Evidence boundaries

Record these as evidence supplied by the target project's normal build/deploy workflow:

- the source revision and exact build command;
- the built artifact or immutable build identifier;
- the preview/deployed origin and tested deep routes;
- response headers and exact remote bytes for the manifest, service worker, entry document,
  and representative hashed assets;
- the A and B build identifiers plus seeded state and reproduction steps for update/version
  skew checks;
- real-device observations for entries that CI cannot prove.

Do not turn a missing item into a guessed default. A source directory cannot prove deployed
headers; one deployed origin cannot prove an A→B update; the bundled deploy harness only
proves its own fixture assertions. Report those gaps as `UNVERIFIED` or `BLOCKED`.

The automated browser matrix requires both Chromium and WebKit by default. A report must
list the engines actually run plus every skipped engine and its launch reason. If a required
engine is unavailable, retain any useful findings from engines that did run but mark the
combined verification `BLOCKED`; partial browser coverage is never a green gate. WebKit
coverage does not convert real-iOS-only entries into PASS, so their device steps remain
`UNVERIFIED`.

## Repository discovery

Before configuring probes, inspect rather than assume:

1. Identify the actual app root if the repository contains several packages.
2. Reuse the repository's documented build and preview commands; do not invent a framework
   command or mutate deployment configuration.
3. Find the routes, authenticated states, persistent navigation, overlays, and RTL locales
   that exist in this app.
4. Point `baseURL` at a process or deployed origin the user has authorized. The verifier is
   observational and never promotes, rolls back, or writes infrastructure.
5. Keep credentials out of the config. Prefer a short-lived, least-privilege storage state
   created for tests.

If discovery cannot resolve one of these safely, stop that check as `BLOCKED` and name the
missing input. That is portable behavior; silently guessing is not.
