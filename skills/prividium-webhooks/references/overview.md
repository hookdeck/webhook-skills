# Prividium Webhooks Overview

## What Are Prividium Webhooks?

Prividium is ZKsync's private (permissioned) chain product. Its webhook service is an HTTPS callback that notifies your service about on-chain activity: when a monitored event or address matches a subscription, a signed HTTP request is delivered to your endpoint. The service says it aims to follow the [Standard Webhooks](https://standardwebhooks.com/) specification.

The sender is your own deployment's webhook service, managed through its permissions API (for example `http://localhost:8000/api/v1` in the docs' examples), so the host differs per deployment. All management routes require authentication.

## What Webhook Types Exist?

| Type | Subscribes to | Fields |
|------|---------------|--------|
| Event webhook | One contract event | `contract` (required), `topic0` (required), `decode_events`, `from_block` (optional) |
| Address webhook | One or more addresses | `addresses` (one or more, required), `from_block` (optional) |

Each event webhook is one event subscription; each address webhook is one address subscription group. Internal transaction monitoring is not currently supported. With `decode_events: true` on an event webhook, deliveries include decoded event data; the selected contract must already exist in the Contracts section of the admin UI.

## What Event Types Does Prividium Send?

The documentation defines no event type names and does not print the delivery body, so this skill doesn't list any. Treat the two webhook types above as the categories, give each webhook its own endpoint URL, and inspect a real delivery to see the body your deployment sends.

## What Headers Does Each Delivery Carry?

| Header | Meaning |
|--------|---------|
| `webhook-id` | Unique per event, stable across retries; use it for idempotency |
| `webhook-timestamp` | Unix timestamp in seconds, for replay checks |
| `webhook-signature` | One or more space-delimited `v1,<base64>` signatures (several during rotation) |

Header names are case-insensitive. See [verification.md](verification.md).

## What Is the Signing Key?

Each webhook has one signing key, starting with `whsec_`. It is returned once, as `signing_key`, when the webhook is created (and once again when you rotate it). Reads do not return it; if it is lost, rotate. The docs also call it the signing secret. Rotation runs an overlap window (`retire_after_secs`, default `86400`) during which deliveries carry signatures from both keys.

## How Should I Handle Deliveries?

1. Read the raw request body bytes.
2. Verify the signature and timestamp before doing anything else.
3. Deduplicate on `webhook-id`, persisting it before applying side effects.
4. Process, then return a success response.

If verification fails, return a 4xx (typically `401` or `400`), don't process the payload and don't retry internally. The docs don't describe the retry schedule. A webhook can be **Suspended** by the service after repeated delivery failures, an HTTP `410 Gone`, or revoked chain permission; **Paused** is an admin action. Activate it again once the cause is fixed.

## Full Reference

- [Webhooks overview](https://docs.prividium.zksync.io/developers/webhooks/overview)
- [Verifying signatures](https://docs.prividium.zksync.io/developers/webhooks/verifying-signatures)
- [Event webhooks API](https://docs.prividium.zksync.io/developers/webhooks/event-webhooks-api)
- [Address webhooks API](https://docs.prividium.zksync.io/developers/webhooks/address-webhooks-api)
- [Webhook delivery handling](https://docs.prividium.zksync.io/developers/webhooks/webhook-delivery-handling)
- [Rotating signing keys](https://docs.prividium.zksync.io/developers/webhooks/rotating-signing-keys)
