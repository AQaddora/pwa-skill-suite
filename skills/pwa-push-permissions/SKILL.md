---
name: pwa-push-permissions
description: 'Use when adding or repairing Web Push, notification consent, camera/microphone permissions, or other gesture-gated capabilities in a PWA — installed-iOS gating, provider-neutral subscriptions, foreground/background delivery, notification clicks, denied recovery, token cleanup, and canary verification. Trigger phrases: "send notifications to installed users", "push works only in the foreground", "notification click opens the wrong page", "permission was denied", "FCM token is stale".'
---

# pwa-push-permissions

Build permission and Push flows as explicit, reversible state machines rather than one-time
prompts. Covers **P-118** and **P-549..P-552**. The workflow is provider-neutral: use the
repository's Web Push, FCM, or equivalent adapter without exposing provider credentials to the
browser.

**Audit first:**

```bash
node "<pwa-audit-skill-dir>/scripts/run-audit.mjs" "<path-to-app>"
```

Resolve `<pwa-audit-skill-dir>` from the selected `pwa-audit/SKILL.md`, not from the target
repository.

## Capability and consent states

Distinguish `unsupported`, `requires-install`, `not-asked`, `requesting`, `granted`,
`denied`, `subscribing`, `enabled`, `stale`, and `error`. Request permission only from a
user gesture after explaining the value. A denied state needs platform-specific recovery
instructions; never loop prompts (**P-550**, **P-551**).

On iOS, gate Push behind genuine standalone installation and feature detection. On every
platform, test for Service Worker, PushManager, Notification, and the provider SDK surface
before rendering an enable action (**P-118**).

## Subscription lifecycle

- Register against the app's existing service worker; do not create competing workers.
- Keep VAPID keys and public provider configuration separate from server secrets.
- Upsert subscriptions by an authorized notification subject plus an opaque
  installation/device identity. That subject may be an account, or a deliberately supported
  anonymous installation; never require one identity model in every repository. Make retries
  idempotent and tolerate token rotation.
- Handle subscription changes, invalid endpoints, logout, account switch, and user disable.
  Server sends must remove permanently rejected subscriptions.
- Authorize every send server-side. A client may manage only its own subscription and may not
  select arbitrary recipients.

## Delivery behavior

- Use `registration.showNotification()` from the service worker; do not use
  `new Notification()` on mobile (**P-549**).
- Define foreground behavior separately so one event is not rendered twice.
- Keep payloads minimal and non-sensitive. Fetch protected details after the app opens.
- On `notificationclick`, validate the destination, focus a matching in-scope client when one
  exists, otherwise open one. Never navigate to an attacker-controlled URL.
- Preserve locale and direction in notification copy where the platform supports it.

## Owner/admin send path

When a repository needs an owner to send campaigns or order updates, put that capability
behind an authenticated server endpoint and an explicit admin role. The browser admin UI may
compose, preview, select a server-defined audience, and submit an idempotent send request; it
must never download raw subscriptions or choose arbitrary endpoint URLs. Add rate limits,
maximum audience size, confirmation for large sends, an audit record, delivery/invalid-token
counts, and a kill switch. Respect unsubscribe and consent state at send time, not only when a
subscription was first stored.

## Other permissions

Apply the same state-machine approach to camera, microphone, geolocation, and wake lock.
Stop media tracks on cleanup, re-check grants when returning from background, and reacquire a
needed wake lock on `visibilitychange` → visible (**P-551**, **P-552**).

## Verification matrix

Use injectable provider adapters and synthetic push events so CI needs no production secret.
Test unsupported, browser-only, installed, granted, denied, revoked, rotated, offline, and
logout/account-switch states. Verify foreground/background deduplication and click focus/open
routing. Then close device-only items with canary notifications on real iOS and Android
installs; record delivery and click receipts without notification contents or tokens.

Never request permission, register real endpoints, or send a production notification merely
to make an automated test pass without explicit authorization.
