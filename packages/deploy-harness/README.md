# packages/deploy-harness

Tests the thing almost nobody tests: an **existing client, mid-session, across a real
deploy** — not first install. `npm run harness` (from the repo root) runs it.

## Why single-origin, not two ports

Service worker registration is origin-scoped. Serving build A on `:3000` and build B on
`:3001` would be two different origins to the browser — the SW installed against A would
never see B at all, and the whole test would silently prove nothing. `lib/proxy.mjs` is a
single HTTP server whose backing directory is swapped underneath a live client
(`swapTo(dirB)`); the URL never changes. A's content-hashed chunks are simply absent from
B's directory, so they 404 automatically — that *is* "the old chunk got deleted on
deploy," with no simulation needed.

## What's asserted

- **Stale code** (`checks/p502…p514`) — no cache-first navigation pinning old HTML, a
  deleted lazy chunk recovers instead of white-screening (and doesn't loop), a waiting
  update is discoverable within a bounded wait, `skipWaiting` never swaps assets under a
  live tab without the app choosing to, and `sw.js`/the manifest aren't served with a
  long-TTL cache header.
- **Version skew** (`checks/p520…p531`) — an auth-cookie shape change resolves to a
  coherent state (still authed or cleanly signed out, never wedged); an old shell calling
  a new API is handled gracefully; **no cross-user data survives a logout/account switch**
  (treated as the most severe finding this harness can produce); a persisted storage
  schema migrates instead of crashing boot; SW and shell build ids converge after an
  applied update; a breaking deploy force-updates rather than lingering on a banner.

Every check reports `BLOCKED`, not `PASS`, when it cannot establish the state it needs
(e.g. it could not seed an authenticated session). See `lib/outcome.mjs`.

## Scope — what this spike found, and what's *not* built

This harness runs the 11 checks above against **two bundled fixture builds**
(`fixtures/build-a`, `fixtures/build-b`, `fixtures/build-b-breaking`), not against an
arbitrary project's real build output. Two things came out of the spike that shaped this:

1. **SSR apps have no static output to swap.** A static/SPA build is just files in a
   directory, which is exactly what `swapTo()` needs. An SSR app's "build" is a running
   server process; swapping that safely needs a two-instance mode behind the same proxy
   (route requests to instance A or B, still one origin) — a real feature, not a stub, and
   out of scope for this sprint. Static/SPA output is what's supported today.
2. **The version-skew checks need seeded state that only the app itself can produce** — a
   valid build-A session cookie, a specific persisted-storage shape, a specific API
   response. The bundled fixtures supply that seeding through `window.app.signIn()` /
   `window.app.checkUpdate()` etc. (see `fixtures/build-a/app.a1a1a1.js`). Pointing this at
   a real project would need the same seeding contract packages/probes already defines
   (`pwa-probes.config.mjs`'s `auth` field) — wiring the harness to consume that contract
   is the natural next step, not done here. Attempting it without real seeding would have
   meant synthesizing fake state and calling it verified, which is exactly the
   "appears to pass" failure mode this sprint was warned against — so it's left as a
   documented gap instead.

In short: the assertions themselves are real (see `test/checks-negative.test.mjs`, which
proves five of them fail against genuinely broken synthetic fixtures) and the proxy
mechanics are real, but "point this at your own app" is not yet wired up. That's the
honest boundary of what shipped this sprint.
