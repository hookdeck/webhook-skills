# Auth0 Webhooks Overview

## What Are Auth0 Webhooks?

Auth0 (an Okta company) doesn't ship a traditional per-event webhook product.
Instead, it exposes tenant activity through **Log Streams**. A **Custom Log
Stream (Webhook / HTTP)** streams your tenant's log events to an HTTPS endpoint
you control by sending HTTP `POST` requests.

Key characteristics:

- **Batched delivery** — each request body is a **JSON array** of one or more
  log records (Auth0 buffers events and delivers them in batches).
- **Near real-time** — events are streamed shortly after they occur.
- **No signature** — requests are not HMAC-signed. You authenticate them with a
  static **Authorization** token you configure on the stream (see
  [verification.md](verification.md)).
- **At-least-once with retries** — Auth0 **retries** delivery on any non-`2xx`
  response, so your handler must be fast and idempotent.

## Common Event Types

The event type is a short **log event type code** found at `event.data.type`
inside each record.

| Code | Triggered When | Common Use Cases |
|------|----------------|------------------|
| `s` | A user logs in successfully | Audit trails, "new login" notifications, sync last-login |
| `f` | A login attempt fails | Fraud/brute-force detection, alerting |
| `ss` | A user signs up successfully | Provisioning, welcome emails, CRM sync |
| `fs` | A signup attempt fails | Debugging registration flows |
| `sepft` | Successful exchange of Password for Access Token | Token issuance auditing |
| `seacft` | Successful exchange of Authorization Code for Access Token | OAuth flow auditing |
| `feacft` | Failed exchange of Authorization Code for Access Token | OAuth error monitoring |
| `slo` | A user logs out successfully | Session accounting |

Auth0 also emits MFA, password-change, breached-password, and rate-limit codes.
See the full list under "Full Event Reference" below.

## Event Payload Structure

The request body is an array. Each element is a log record shaped like:

```json
[
  {
    "log_id": "90020210714154213417000000000000000000000000000000",
    "data": {
      "date": "2021-07-14T15:42:13.410Z",
      "type": "s",
      "description": "Successful login",
      "connection": "Username-Password-Authentication",
      "connection_id": "con_abc123",
      "client_id": "AbC123ClientId",
      "client_name": "My App",
      "ip": "203.0.113.10",
      "user_agent": "Mozilla/5.0 ...",
      "user_id": "auth0|64f...",
      "user_name": "user@example.com",
      "strategy": "auth0",
      "strategy_type": "database"
    }
  }
]
```

Key fields (under `data`):

- `type` — the log event type code (dispatch on this).
- `date` — ISO 8601 timestamp of the event.
- `description` — human-readable summary.
- `user_id` / `user_name` — the affected user, when applicable.
- `client_id` / `client_name` — the application involved.
- `ip` / `user_agent` — request origin metadata.
- `log_id` — unique id for the record (useful for idempotency).

> Field availability varies by event `type` — failed events may omit
> `user_id`, and non-interactive events may omit `user_agent`. Always read
> defensively.

## Full Event Reference

- [Auth0 Log Event Type Codes](https://auth0.com/docs/deploy-monitor/logs/log-event-type-codes)
- [Custom Log Streams (Webhooks)](https://auth0.com/docs/customize/log-streams/custom-log-streams)
