# Okta Event Hooks Overview

## What Are Okta Event Hooks?

Okta Event Hooks are outbound calls from Okta that notify your service when
specific events happen in your Okta org — a user signs in, an account is locked,
a user joins a group, and so on. Okta sends an HTTPS **POST** with a JSON payload
to an endpoint you own.

Event hooks are asynchronous "fire-and-forget" notifications (unlike Inline Hooks,
which are synchronous and can modify an Okta flow). Your endpoint should verify
the request, do minimal work, and return a `2xx` quickly.

## How Verification and Auth Work

Okta Event Hooks do **not** sign the payload with an HMAC. Instead:

1. **One-time verification challenge** — When the hook is registered (or when you
   click "Verify" in the Admin Console), Okta sends a **GET** request with an
   `x-okta-verification-challenge` header. Your endpoint must respond `200` with
   `{"verification": "<challenge value>"}`. This proves you control the endpoint.
2. **Per-request authentication** — You define a secret when creating the hook.
   Okta sends it in the `Authorization` header on every event delivery. Your
   endpoint compares it (timing-safe) against the secret you stored.

See [verification.md](verification.md) for implementation details.

## Common Event Types

Event hooks deliver [System Log](https://developer.okta.com/docs/reference/api/system-log/)
events. The System Log event type is at `data.events[].eventType`.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `user.lifecycle.create` | A new user is created | Provision downstream accounts, send welcome flows |
| `user.lifecycle.activate` | A user is activated | Grant access, notify onboarding systems |
| `user.session.start` | A user signs in to Okta | Audit logging, anomaly detection |
| `user.account.lock` | A user account is locked | Security alerting, notify the user |
| `user.account.unlock` | A user account is unlocked | Restore access, audit trail |
| `group.user_membership.add` | A user is added to a group | Sync entitlements, update downstream roles |
| `group.user_membership.remove` | A user is removed from a group | Revoke entitlements |

Only events flagged **event-hook eligible** can be subscribed to. Filter the
catalog with the `event-hook-eligible=true` parameter (see full reference below).

## Event Payload Structure

```json
{
  "eventType": "com.okta.event_hook",
  "eventTypeVersion": "1.0",
  "cloudEventsVersion": "0.1",
  "eventId": "3OQEZQ...",
  "eventTime": "2026-07-02T12:00:00.000Z",
  "contentType": "application/json",
  "source": "https://{yourOktaDomain}/api/v1/eventHooks/who...",
  "data": {
    "events": [
      {
        "uuid": "d6f5...",
        "published": "2026-07-02T12:00:00.000Z",
        "eventType": "user.session.start",
        "version": "0",
        "displayMessage": "User login to Okta",
        "severity": "INFO",
        "actor": {
          "id": "00u...",
          "type": "User",
          "alternateId": "jane@example.com",
          "displayName": "Jane Doe"
        },
        "target": [
          {
            "id": "00u...",
            "type": "User",
            "alternateId": "jane@example.com",
            "displayName": "Jane Doe"
          }
        ]
      }
    ]
  }
}
```

Key fields:

- **`eventType`** (outer) — always `com.okta.event_hook`.
- **`data.events`** — an array; a single POST can carry multiple events. Iterate it.
- **`data.events[].eventType`** — the System Log event type you dispatch on.
- **`data.events[].actor`** — who performed the action.
- **`data.events[].target`** — the object(s) acted on.

## Full Event Reference

For the complete list of event-hook-eligible events, see
[Okta event types](https://developer.okta.com/docs/reference/api/event-types/?event-hook-eligible=true)
and the [Event Hooks concept guide](https://developer.okta.com/docs/concepts/event-hooks/).
