# Catalog addendum — §5b · Version skew & stale client state

Twelve entries (P-520 … P-531) extending §5. Merged into `catalog.json` immediately
after Phase 1 lands the catalog machinery — this addendum is the first exercise of
the project's own contribution model (a new failure mode = an entry + a rule/probe).

**Why this is its own cluster.** §5 covers stale *code* reaching a client. This covers
stale *state* — cookies, storage schema, cached user data — surviving a version
boundary. Same trigger (a new deploy meets an old client), different failure, and
almost entirely unaddressed by existing PWA tooling.

**What makes every entry here vicious:** they affect *existing users only*. A fresh
browser profile — which is what dev, CI, and every manual test uses — cannot reproduce
any of them. They ship green and break in production, for exactly the users who
already trusted you.

---

### P-520 · Auth cookie shape changed; existing clients wedge   [P0] [S][R]
**AI writes:** renames or reshapes the session cookie in a new release.
**Breaks:** existing users still send the *old* cookie. The app half-reads it — infinite redirect loop, or "logged in" with no session. Reproduces for nobody testing with a clean profile.
**Correct:** version the cookie name on any breaking change **and** explicitly clear the old one; or read both shapes for one release. A deliberate migration, never an implicit one.
**Detect:** [S] diff auth-cookie names/shapes between builds A and B; flag a change with no clear-old path. [R] harness — authenticate on A, deploy B, assert the client reaches a *coherent* state: still authed, or cleanly logged out. Never wedged.
> Real instance: the taqat.academy auth outage, resolved by renaming session cookies (`authjs` → `taqat2`) precisely because the old ones could not be reasoned about.

### P-521 · No build/version stamp on the client   [P1] [S][R]
**Breaks:** the app cannot know it is stale, you cannot answer "which build is this user on?", and every other check in this section has nothing to key off.
**Correct:** embed a build ID at build time, expose it (meta tag or global), and send it with API requests.
**Detect:** [S] a build stamp exists and differs between A and B.

### P-522 · API contract skew — old shell, new API   [P0] [R]
**Breaks:** a cached build-A shell calls build-B's API. Silent 4xx, or a shape mismatch rendered as a blank screen with no error.
**Correct:** version the API, or have the server advertise a minimum supported client so the app can force an update.
**Detect:** [R] harness — run A's shell against B's API; assert graceful handling (forced update, or a compatible response). A silent blank is a failure.

### P-523 · Cached data survives logout / account switch   [P0] [S][R]
**Breaks:** SW cache, IndexedDB, or localStorage retains user A's data; user B signs in on the same device and sees it. This is a privacy incident, not a glitch — and shared devices are the norm in plenty of markets.
**Correct:** purge all user-scoped caches and storage on logout **and** on identity change. Where retention is deliberate, key it by user.
**Detect:** [S] assert the logout path clears caches + IDB. [R] sign in as A, sign out, sign in as B, assert no A-scoped data is reachable.

### P-524 · Caches not keyed by build ID   [P1] [S]
**Breaks:** a new deploy reuses the old cache namespace, so stale entries survive the very update meant to replace them.
**Correct:** cache names derive from the build ID; `activate` deletes every non-current cache.
**Detect:** [S] cache names are build-derived and `activate` purges others.

### P-525 · Client storage schema migration missing   [P0] [S][R]
**Breaks:** build B expects a new shape; build A's persisted state crashes it during boot — `undefined` access, or `JSON.parse` of a changed shape. **White screen for existing users only.** Invisible in dev, invisible to any fresh-profile test, and it looks like a total outage to the affected user.
**Correct:** version the persisted schema; migrate or discard on read; wrap hydration in a failure path that falls back to clean state rather than dying.
**Detect:** [S] persisted reads are version-checked and failure-tolerant. [R] harness — seed A's storage, load B, assert boot succeeds.

### P-526 · Authenticated responses cached by the service worker   [P0] [S]
**Breaks:** a private response is written to the cache and later served to a different or logged-out user.
**Correct:** never cache responses to credentialed requests unless keyed by identity and purged on logout.
**Detect:** [S] flag cache writes for requests carrying credentials.

### P-527 · No hard-reset escape hatch   [P1] [S]
**Breaks:** when a user *is* wedged, there is no supported recovery. Support's only advice becomes "reinstall" — and on iOS that means deleting the home-screen app and losing everything local.
**Correct:** ship a reachable reset route that unregisters service workers, deletes all caches, clears storage, and reloads. The goal is that support can fix it in one sentence.
**Detect:** [S] such a route exists.

### P-528 · Service worker and app shell from different builds   [P1] [R]
**Breaks:** SW from A, shell from B — the precache manifest references assets the shell never requests, and vice versa.
**Correct:** the SW carries its build ID and declines to serve a mismatched shell; converge on one build.
**Detect:** [R] harness assertion.

### P-529 · Safari caps client-set cookies at 7 days   [P1] [S]
**Breaks:** cookies set via `document.cookie` in Safari are capped at 7 days by ITP regardless of stated `max-age` — users are silently signed out weekly. Installed PWAs make it worse, because a home-screen app is expected to stay signed in.
**Correct:** set auth cookies server-side via `Set-Cookie`; never rely on long-lived client-set cookies for session.
**Detect:** [S] flag long-`max-age` auth cookies assigned through `document.cookie`.

### P-530 · Cookie attributes wrong for standalone launch   [P1] [S]
**Breaks:** `SameSite` / `Secure` / partitioning mismatches break OAuth returns and cross-context launches from the home screen — works in the browser tab, fails in the installed app.
**Correct:** `Secure`, a deliberate `SameSite`, and test the real install → sign-in → relaunch path.

### P-531 · Breaking update never forced   [P1] [S][R]
**Breaks:** P-503's polite "update available" banner is the wrong answer when the old client is *incompatible* — it lets users keep operating a build that cannot work.
**Correct:** distinguish optional from mandatory updates; a server-signalled minimum version triggers a forced reload.
**Detect:** [R] harness — mark B as breaking, assert A's client force-updates rather than lingering.

---

## Effect on catalog totals

| | before | after |
|---|---|---|
| entries | 140 | **152** |
| P0 | 27 | **32** |
| §5 cluster | 19 | **31** |

New P0s: P-520, P-522, P-523, P-525, P-526.
