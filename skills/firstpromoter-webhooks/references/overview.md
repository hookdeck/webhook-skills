# FirstPromoter Webhooks Overview

## What Are FirstPromoter Webhooks?

FirstPromoter (affiliate and referral management) Webhooks v2 is a rewrite of its webhook
system. Instead of three fixed URLs per campaign you create any number of **subscriptions**
(Settings > Integrations > Webhooks), each with its own URL, event types, optional campaign
filter and optional custom headers. When a matching event occurs, FirstPromoter sends a `POST`
with a JSON payload. Requests are not signed; you authenticate them with a custom header you
add to the subscription.

Covers Webhooks v2 only: add a custom header to the subscription and enter it here. Legacy webhooks cannot send custom headers.

## Common Event Types

Event types follow `{entity}.{action}` and you subscribe to exact strings.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `promoter.created` | A promoter signed up or was created via the API | Create a CRM contact, send onboarding |
| `promoter.updated` | A promoter's account details changed | Sync profile |
| `promoter.deleted` | A promoter was deleted | Deprovision |
| `promoter.balance.updated` | A promoter's earnings, current or paid balance changed | Update balance in your app |
| `referral.created` | A new referral (lead or customer) was tracked | Attribute a signup |
| `referral.updated` | A referral's details changed (state, plan, cancellation) | Sync state |
| `referral.converted` | A referral (lead) became a customer | Credit the promoter, notify |
| `referral.cancelled` | A referral was cancelled | Reverse benefits |
| `referral.deleted` | A referral was deleted | Clean up |
| `referral.moved` | A referral moved to another campaign (upgrade/downgrade threshold) | Re-tier |
| `commission.created` | A commission was created | Record a liability |
| `commission.updated` | A commission changed; `changes` has the fields | Sync status |
| `commission.approved` | A commission was approved | Queue for payout |
| `commission.pending` | A commission was set to pending | Hold |
| `commission.denied` | A commission was denied | Notify promoter |
| `commission.deleted` | A commission was deleted | Remove the liability |
| `payout.created` | A payout was created | Open a payout record |
| `payout.completed` | A payout completed successfully | Mark as paid |
| `payout.failed` | A payout failed | Alert finance |
| `contract_document.signed` | A promoter signed a contract document | Unlock the program |

Also documented: `promoter_campaign.created|updated|deleted|accepted|pending|rejected|blocked|inactive`,
`payout.updated|deleted|pending|processing|cancelled|commissions.added|commissions.removed`,
`payout_method.created|updated|deleted`, and
`payments_batch.created|updated|deleted|initiated|processing|completed|failed`.

## Event Payload Structure

Every request is a `POST` with `Content-Type: application/json`. The top-level shape is the same
for all events:

| Field | Meaning |
|-------|---------|
| `event_id` | UUID for the event; dedupe on it |
| `event_type` | e.g. `referral.updated`; dispatch on it |
| `action` | `created`, `updated` or `deleted` |
| `entity_type` | `promoter`, `referral`, `commission`, ... |
| `entity_id` | Numeric ID of the resource |
| `changes` | For updates: `{field: [old, new]}`; empty for created and deleted |
| `data` | Full serialized resource at the time of the event |
| `timestamp` | ISO 8601 time of the event |

Headers `X-Event-Id` and `X-Event-Type` repeat `event_id` and `event_type`.

```json
{
  "event_id": "c3d4e5f6-a7b8-9012-cdef-012345678902",
  "event_type": "commission.updated",
  "action": "updated",
  "entity_type": "commission",
  "entity_id": 88901,
  "changes": { "status": ["pending", "approved"] },
  "data": {
    "id": 88901,
    "status": "approved",
    "amount": 2500,
    "unit": "cash",
    "referral": { "id": 55678, "email": "user@example.com", "uid": "user_ext_id" },
    "created_at": "2025-01-18T09:00:00Z"
  },
  "timestamp": "2025-01-21T11:15:00Z"
}
```

A dashboard **Send test** delivery has `"data": { "test": true }`.

## Delivery and Retries

Respond with any `2xx` to acknowledge. A non-2xx response, timeout (30 s by default) or network
error is retried with exponential backoff (about 2 minutes, then 4, 8, ...). The docs disagree
on the budget: the overview comparison table says 3 retries by default, while the delivery page
says `max_retries` defaults to 10 (configurable 0 to 10). Check your subscription. Because
retries and duplicates happen, dedupe on `event_id`.

## Full Event Reference

See [Event Types](https://docs.firstpromoter.com/webhooks-v2/event-types),
[Payload Structure](https://docs.firstpromoter.com/webhooks-v2/payload) and the
[Webhooks v2 overview](https://docs.firstpromoter.com/webhooks-v2/overview).
