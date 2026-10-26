# Nomod Webhooks Overview

## What Are Nomod Webhooks?

[Nomod](https://nomod.com) is a UAE payment-links and card-acceptance platform for SMEs. When a
payment event happens on your Nomod account (a charge is created, authorised, completed, refunded
and so on), Nomod sends an HTTPS `POST` with a signed JSON body to the URL you configured, so you
can automate order fulfilment, reconciliation and customer communication without polling the API.
Deliveries go through Svix and are signed (see [verification.md](verification.md)).

Each webhook is tied to one **integration type**: **Nomod API** (transactions processed through
the Nomod API directly) or **Nomod Hosted Checkout** (transactions processed through Nomod's
hosted checkout page). Create a separate webhook for each if you use both.

| Aspect | Value |
|--------|-------|
| Method | `POST`, JSON body (Nomod prints no `Content-Type`, so read the raw bytes whatever it is) |
| Signature headers | `svix-id`, `svix-timestamp`, `svix-signature` (Standard Webhooks) |
| Success | `200 OK`, returned as quickly as possible. A slow response counts as a failure and is retried |
| Deduplication | `eventId`, to ignore repeated deliveries |
| Event logs | Kept for 90 days |

Nomod's docs don't print a retry schedule or a response timeout, so don't hard-code either.

## Event Payload Structure

Every notification has the same four top-level fields:

```json
{
  "type": "charge.completed",
  "eventId": "ab088ef8-7597-475c-aacd-001555fb8bd3",
  "objectId": "ch_5674c95a4fd04e439e6e53f5f6b97323",
  "data": {
    "id": "5674c95a-4fd0-4e43-9e6e-53f5f6b97323",
    "currency": "AED",
    "total": "78.860",
    "status": "paid",
    "refundTotal": "0.000",
    "refunds": [],
    "events": [{ "type": "completed", "message": "Paid" }]
  }
}
```

| Field | Meaning |
|-------|---------|
| `type` | The event name. Branch on this |
| `eventId` | Id of this event. Use it to detect and ignore repeated deliveries |
| `objectId` | The charge the event is about (`ch_...`) |
| `data` | The full charge: `total`, `currency`, `status`, `customer`, `items`, `fee`, `net`, `paymentMethod`, `refundTotal`, `refunds`, `referenceId`, `error` and more |

`data.events[].type` (for example `completed`) is the charge's own history, **not** the webhook
event type. Amounts are decimal strings. The example above is trimmed; Nomod's
[payload example](https://nomod.com/docs/webhooks/how-webhooks-work) shows every field.

## Common Event Types

Eight events are documented (the list may not be exhaustive). You choose which ones each webhook
receives, and the examples handle all of them:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `charge.created` | A payment object has been created and is awaiting customer action | Track pending payments |
| `charge.authorised` | Funds are reserved on the customer's card and awaiting capture | Hold stock, capture later |
| `charge.completed` | Funds are captured and settled to your balance | Fulfil the order, reconcile |
| `charge.failed` | The payment was declined at authorisation or capture | Read `data.error`, notify the customer |
| `charge.cancelled` | The authorisation was voided before capture | Release held stock |
| `charge.refunded` | A full refund has been issued | Refund bookkeeping |
| `charge.partially_refunded` | A partial refund has been issued; the remaining amount stays settled | Adjust the order total |
| `charge.dispute.created` | A chargeback or dispute was opened by the customer | Gather evidence, flag the order |

The examples acknowledge any other `type` with `200`.

## Source IP Addresses

Nomod sends webhooks from `52.215.16.239`, `54.216.8.72`, `63.33.109.123` and the IPv6 range
`2a05:d028:17:8000::/56`. If a firewall sits in front of your endpoint, allow TCP 443 from these.
Nomod says it gives at least 14 days' notice before changing them. The signature, not the source
address, is what proves a delivery is authentic.

## Full Event Reference

See Nomod's [How Webhooks Work](https://nomod.com/docs/webhooks/how-webhooks-work) page for the
event list and a full payload example.
