# Neon Auth Webhooks Overview

## What Are Neon Webhooks?

[Neon Auth](https://neon.com/docs/auth) (Managed Better Auth) can send **webhooks** to your application when
authentication events happen — a user is created, a phone number is verified, or a
one-time passcode / magic link needs delivering. This lets you sync users to your own
database, notify a CRM or analytics pipeline, run custom signup validation, or take over
OTP / magic-link delivery.

Unlike most providers, Neon Auth signs webhooks with **asymmetric EdDSA (Ed25519) as a
detached JWS**. There is **no shared secret** — you verify each request with the
**public key** published at your project's JWKS endpoint. See
[verification.md](verification.md) for details.

## Blocking vs Non-Blocking Events

Neon Auth events come in two flavors:

- **Blocking**: the authentication flow **pauses** until your endpoint responds (or the
  request times out). Respond as fast as possible and defer any heavy work. These let you
  influence the flow (e.g. reject a signup, deliver a custom OTP). `send.otp` and
  `send.magic_link` accept any `2xx` and ignore the body; `user.before_create` needs a
  `2xx` with a JSON body carrying `allowed`, and a failed delivery or any other response
  rejects the signup.
- **Non-blocking** — fired after the fact for synchronization. Your response does not
  change the auth flow.

## Common Event Types

| Event | Type | Triggered When | Common Use Cases |
|-------|------|----------------|------------------|
| `send.otp` | **Blocking** | A one-time passcode needs to be delivered | Send OTP via your own SMS/email provider |
| `send.magic_link` | **Blocking** | A magic link needs to be delivered | Send the login link through your own channel |
| `user.before_create` | **Blocking** | Just before a user record is written | Validate/reject signups, enforce allowlists |
| `user.created` | Non-blocking | A user account has been created | Sync to your DB, CRM, analytics; welcome email |
| `phone_number.verified` | Non-blocking | A user verified their phone number | Unlock features, update profile state |
| `organization.invitation.created` | Non-blocking | An organization invitation is created | Custom invitation emails, audit logging |
| `organization.invitation.accepted` | Non-blocking | A user accepts an invitation and becomes a member | Provision resources, update permissions |

Event names are exact, lowercase, and dot-delimited — match them verbatim.

## Event Payload Structure

Every delivery carries metadata in headers (see the table below) and a JSON envelope:
`event_id`, `event_type`, `timestamp`, `context` (`endpoint_id`, `project_name`), `user`
and `event_data`, which holds the event-specific fields. The event type is in both the
body's `event_type` and the `X-Neon-Event-Type` header.

### Request Headers

| Header | Description |
|--------|-------------|
| `X-Neon-Signature` | Detached JWS signature, format `header..signature` (empty middle section) |
| `X-Neon-Signature-Kid` | Key ID used to select the correct public key from the JWKS |
| `X-Neon-Timestamp` | Unix timestamp in **milliseconds** — enforce a tolerance to block replays |
| `X-Neon-Event-Type` | Event type identifier, e.g. `user.created` |
| `X-Neon-Event-Id` | Unique event UUID — use for **idempotency** |
| `X-Neon-Delivery-Attempt` | Delivery attempt number (`1`, `2`, or `3`); up to 3 attempts in total |

Each header is also sent with a `Neon-Better-Auth-` prefix, which is what reaches an
endpoint hosted on Neon Functions.

## Full Event Reference

For the complete, authoritative list of events and payload fields, see
[Neon Auth webhooks documentation](https://neon.com/docs/auth/guides/webhooks).
