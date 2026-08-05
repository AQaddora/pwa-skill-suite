---
name: pwa-auth-state
description: 'Use when authentication, anonymous state, or account continuity behaves differently in an installed PWA, browser tab, or in-app browser — redirect-safe OAuth, cold installed sessions, cart/state merging, cross-tab logout, storage migrations, and identity-change privacy. Trigger phrases: "Google sign-in fails in the installed app", "keep the cart after login", "Safari and the PWA have different sessions", "logout every open tab", "migrate persisted state safely".'
---

# pwa-auth-state

Make identity and persisted user state survive the boundaries a mobile PWA actually has:
browser versus installed storage partitions, background eviction, multiple clients, OAuth
navigation, schema upgrades, logout, and account switching. Covers **P-540..P-546** and
coordinates with the version-skew controls in `pwa-offline`.

**Audit first:**

```bash
node "<pwa-audit-skill-dir>/scripts/run-audit.mjs" "<path-to-app>"
```

Resolve `<pwa-audit-skill-dir>` from the selected `pwa-audit/SKILL.md`, not from the target
repository.

## Preserve the repository's architecture

Detect the framework, router, identity provider, server/session model, and storage layer
before proposing changes. Reuse their supported redirect/credential APIs. Do not replace an
auth provider, proxy an identity endpoint, or introduce durable browser tokens merely to make
one test easier.

## Required state model

- Treat an installed launch as a **cold client**. Never assume a Safari-tab session, cookie,
  or storage record transferred into standalone mode (**P-540**).
- Prefer a redirect- or credential-based mobile flow that returns to an in-scope app route.
  Do not depend on a popup, `window.opener`, or transient activation surviving an `await`
  (**P-541**, **P-542**).
- Detect in-app browsers client-side. Hide unsupported install/login actions and provide a
  clear "Open in browser" path; do not render UA-dependent server markup that hydrates to a
  different tree (**P-544**, **P-545**).
- Do not promise links will open an installed PWA. Android requires verified link plumbing;
  iOS PWAs have no equivalent guarantee (**P-546**).
- Coordinate logout and identity changes across clients with `BroadcastChannel` or a storage
  event. Serialize refresh rotation where the platform supports `navigator.locks` (**P-543**).
- Version every persisted schema. Migrate or discard atomically, and recover to a clean state
  when stored data is corrupt (**P-525**).
- Purge user-scoped Cache Storage, IndexedDB, memory caches, and persisted queries on logout
  **and account switch**. Never show account A's state to account B (**P-523**, **P-526**).

## Anonymous-to-account continuity

Model anonymous and authenticated state as separate inputs to an explicit merge operation.
For carts, drafts, or favorites:

1. Load and validate both versions.
2. Merge by stable item identity with documented quantity/conflict rules.
3. Send mutations with idempotency keys and a client revision.
4. Keep the local input until the server confirms the merge.
5. Record the resulting account revision, then remove only the consumed anonymous state.

Never silently upload unrelated local history. Make the merge visible when it can change a
user's saved state.

## Sign-in UX

Keep browsing and a local cart available without an account when the product permits it.
Offer a clear, provider-appropriate sign-in action where continuity has obvious value—such
as saving a cart across devices—and explain that benefit without implying installation and
authentication are the same thing. Preserve the anonymous cart through redirect, cancel,
failure, and retry; merge only after identity is confirmed. Reuse the repository's existing
button, consent, localization, and identity-provider conventions instead of hardcoding Google
or any other provider into the skill.

## Verification matrix

Test the actual provider flow and state repository through:

- ordinary browser, installed display mode, and a simulated in-app browser;
- first launch, returning launch, background eviction, and offline relaunch;
- anonymous state → login success, login cancel/failure, and retry;
- two tabs plus one installed client; logout and account A → B switching;
- previous schema, corrupt schema, storage denied/quota failure, and memory fallback;
- build A → build B with old auth cookies and persisted state.

Use fake accounts and staging origins. Never place access tokens, ID tokens, cookies, or
customer state in screenshots, logs, fixtures, static exports, or the service-worker cache.

## Done gate

Static absence of popup helpers is not proof. Require browser tests for merge/migration and a
real-device cold installed-session pass. Report unsupported provider or device checks as
`UNVERIFIED`; report an unreachable auth seed as `BLOCKED`, never `PASS`.
