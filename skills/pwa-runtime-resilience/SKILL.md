---
name: pwa-runtime-resilience
description: 'Use when a PWA breaks after backgrounding, loses realtime connections or offline writes, leaks media resources, or turns runtime failures into a blank screen — resume/refetch, reconnect backoff, mutation outboxes, media cleanup, error boundaries, global rejection handling, and privacy-safe telemetry. Trigger phrases: "socket dies after reopening the app", "offline changes disappeared", "camera stays on", "blank screen with no error", "refetch when the PWA resumes".'
---

# pwa-runtime-resilience

Make long-lived and installed clients recover after backgrounding, network transitions,
resource revocation, and unexpected exceptions. Covers **P-553..P-559** and **P-563**.

**Audit first:**

```bash
node "<pwa-audit-skill-dir>/scripts/run-audit.mjs" "<path-to-app>"
```

Resolve `<pwa-audit-skill-dir>` from the selected `pwa-audit/SKILL.md`, not from the target
repository.

## Resume is a first-class lifecycle

Mobile browsers throttle timers, suspend connections, and may evict a process without unload.
On `visibilitychange` → visible, recompute freshness, refetch critical state, and reconnect
features that are still active. On hidden/pagehide, persist bounded state using IndexedDB and
send only essential telemetry with `sendBeacon` or `fetch(..., {keepalive:true})`.
`beforeunload` is not a mobile persistence mechanism (**P-557**, **P-558**).

## Realtime and offline mutations

- Use secure realtime transports outside localhost. Reconnect from close/error with capped
  exponential backoff plus jitter, then re-authenticate and re-subscribe (**P-556**).
- Queue offline mutations in an IndexedDB outbox with an idempotency key, creation time,
  account identity, and retry state. Replay serially after a confirmed request succeeds;
  `navigator.onLine` alone is not confirmation (**P-559**).
- Pause replay on logout or identity ambiguity. Never replay account A's mutation as account B.
- Keep optimistic UI marked pending until the server confirms; expose retry/discard controls
  for terminal failures.

## Media lifecycle

- Pair autoplay with `muted` and `playsinline`; handle the promise returned by `.play()`
  (**P-553**).
- Resume AudioContext only inside a user gesture and provide Media Session controls when
  background audio is intentional (**P-554**).
- Stop every `getUserMedia()` track on cleanup and react to `track.onended`; show a recoverable
  paused state instead of leaving a dead stream attached (**P-555**).

## Observable failure instead of a blank screen

Install a framework-appropriate top-level error boundary and recovery UI. Capture global
`error` and `unhandledrejection` events, service-worker registration/update failures, dynamic
import failures, and outbox terminal failures in the repository's reporting adapter
(**P-563**). Scrub credentials, customer content, full URLs, and notification payloads.
Console output alone is not production observability.

## Verification matrix

Test background → resume, offline → online, captive/failed probe, server restart, auth expiry,
duplicate events, outbox replay, media revocation, quota failure, and deliberate render/promise
exceptions. Use fake timers only for backoff math; exercise lifecycle events in a browser.
Require a real-device background/eviction pass for behavior the browser engine cannot prove.

Report an unavailable telemetry sink or unseedable authenticated state as `BLOCKED`. Do not
send test exceptions or synthetic customer mutations to production systems.
