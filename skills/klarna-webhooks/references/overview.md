# Klarna Webhooks Overview

## What Klarna Sends

Klarna sends a `POST` with a JSON body to the configured endpoint, signed with the signing key attached to the webhook. One endpoint can take many event types, or you can use one endpoint per type.

Endpoint requirements from the [setup guide](https://docs.klarna.com/klarna-network-distribution/setup-your-integration/connection-configuration/setup-your-webhooks/):

- HTTPS with a valid certificate
- **Port 443 or 8443 only.** Webhook traffic goes through a proxy, and requests to other ports aren't delivered.

## Payload

| Field | Meaning |
|---|---|
| `metadata.event_id` | Unique event ID, stable across retries |
| `metadata.event_type` | For example `payment.request.state-change.completed` |
| `metadata.event_version` | For example `v2` |
| `metadata.occurred_at` | When the event happened |
| `metadata.subject_account_id`, `metadata.recipient_account_id` | Partner account IDs (where relevant) |
| `metadata.product_instance_id`, `metadata.webhook_id` | Product instance and webhook |
| `metadata.live` | `false` in the test environment |
| `payload` | The event data. Its shape depends on the event type |

## Acknowledgement

Klarna's order of operations:

1. Verify the HMAC signature and reject anything that fails.
2. Persist the event durably, keyed on `metadata.event_id`.
3. Respond `200`, `201`, `202` or `204` as soon as it's persisted (`204 No Content` fits).
4. Run authorization and other business logic asynchronously.

A delivery with an `event_id` you've already recorded is a duplicate: acknowledge it with a 2xx and discard it. Don't answer `409`, because Klarna treats every non-2xx as a failure.

Synchronous callbacks, where Klarna expects a response body, are different: they have no `metadata` envelope.

## Retries

Timeouts and 4xx/5xx responses are retried with the same body: after 10 seconds, 2 minutes, 15 minutes, 3 hours, 6 hours and finally 12 hours. After that the notification is permanently failed; contact Klarna support to have it sent again. Changing webhook settings during retries only affects new notifications.

## Event Categories

Payment Request, Payment Transaction, Payment dispute, Partner Account, Klarna Partner Portal and Settlements. See the [Notifications API reference](https://docs.klarna.com/klarna-network-distribution/api/klarna-notifications-api/) for event types and payload schemas.
