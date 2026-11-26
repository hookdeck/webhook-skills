# Bridge API Webhooks Overview

## What Are Bridge API Webhooks?

[Bridge API](https://bridgeapi.io) (`bridgeapi.io`) is the open-banking /
account-aggregation and payment-initiation platform by Bridge, the business
sister brand of Bankin'. Webhooks let Bridge notify your backend when something happens
asynchronously — a bank connection ("item") finishes refreshing, an account
balance changes, a payment transaction updates, or a user is deleted — so you
don't have to poll the API.

> **Not bridge.xyz.** This is unrelated to [bridge.xyz](https://bridge.xyz),
> the stablecoin payments company. See the
> [bridge-xyz-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/bridge-xyz-webhooks)
> skill for that provider.

Each webhook is created in the Bridge dashboard with a callback URL, an optional
name, and a set of subscribed events. You can create up to **10 webhooks per
application**. Each webhook has its own auto-generated signing secret used to
verify deliveries.

## Common Event Types

The event name is carried in the `type` field of the JSON body — there is **no**
event header. Names are lowercase `resource.action` strings (the dashboard test
event is the exception).

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `item.created` | A user starts adding a bank connection (item) | Track onboarding progress |
| `item.refreshed` | An item was refreshed (`status_code`, `refresh_trigger`) | Check status, pull fresh accounts/transactions |
| `item.deleted` | An item is deleted | Clean up local records |
| `item.account.created` | A new account is detected on an item | Store the account, start reconciliation |
| `item.account.updated` | An account's transactions, balance or data access changed | Update cached balances |
| `item.account.deleted` | The bank no longer updates an account | Mark the account inactive |
| `provider.created` | A new provider (bank) is added | Refresh your provider list |
| `provider.updated` | A provider's details changed | Refresh your provider list |
| `payment.transaction.created` | A payment transaction is created | Record a pending payment |
| `payment.transaction.updated` | A payment transaction's status changed | Reconcile payment status |
| `payment.link.updated` | A payment link's status changed | Update checkout/payment-link state |
| `user.deleted` | A user is deleted | GDPR cleanup, revoke access |
| `guidance.health.ready` | A guidance is generated (Guidance product) | Fetch the guidance |
| `TEST_EVENT` | The dashboard "Send a test" button was clicked | Verify your endpoint is reachable |

## Event Payload Structure

All events share the same envelope:

```json
{
  "content": {
    "account_types": "payment",
    "full_refresh": false,
    "refresh_trigger": "scheduler",
    "item_id": 4568565,
    "status_code": 0,
    "status_code_info": "ok",
    "authentication_expires_at": "2025-09-04T10:25:35Z",
    "user_uuid": "766b2f5d-a942-492c-9ea7-2e5aa88cb672",
    "external_user_id": "external-id"
  },
  "timestamp": 1612783550980,
  "type": "item.refreshed"
}
```

- `type` — the event name (dispatch on this).
- `timestamp` — Unix timestamp of the event, in milliseconds.
- `content` — event-specific fields (e.g. `item_id`, `account_id`, `user_uuid`,
  `status_code`). The exact fields vary by event type. Fields Bridge marks
  "only if not null", such as `external_user_id`, may be absent.

The test event looks like:

```json
{
  "content": {
    "item_id": 1234567890,
    "status": 0,
    "user_uuid": "9a95b38f-f98b-417a-988b-9d0d584893e7"
  },
  "timestamp": 1611681789,
  "type": "TEST_EVENT"
}
```

## Delivery Behaviour

- **Retries:** Non-2xx responses (or responses that are too slow) are retried
  for **1–2 days** with an exponential back-off.
- **Respond fast, respond small:** Return `200` quickly and keep the response
  body under **10 KB**. Do heavy work asynchronously after acknowledging.
- **Expect ghosts:** You may receive webhooks for **already-deleted users or
  items**. Handle missing records defensively — a lookup miss is expected, not
  an error.
- **Source IPs:** Deliveries originate from fixed IPs `63.32.31.5`,
  `52.215.247.62`, `34.249.92.209` (read `X-Forwarded-For` behind a proxy).

## Full Event Reference

For the complete, authoritative list of events, see
[Bridge API's webhook documentation](https://docs.bridgeapi.io/docs/webhooks).
