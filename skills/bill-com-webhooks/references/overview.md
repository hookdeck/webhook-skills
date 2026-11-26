# BILL Webhooks Overview

## What BILL Sends

Each event notification is a JSON `POST` to the subscription's `notificationUrl` (HTTPS only), signed with `x-bill-sha-signature`.

## Payload

```json
{
  "metadata": {
    "eventId": "963507c4-...",
    "subscriptionId": "f6d06930-...",
    "organizationId": "00802...",
    "eventType": "bill.created",
    "version": "1"
  },
  "payload": { }
}
```

BILL stores each notification's payload as a JSON string ("JSON-escaped and presented as a string" in its API responses) and delivers it compact. The per-event payload pages pretty-print it only for readability.

## Events

`GET /v3/events/catalog` lists every event you can subscribe to, with versions. BILL's examples use `bill.created`, `bill.updated` and `bill.archived`. Payload documentation covers vendors, vendor auto-pay, AP bills, AP payments, bank accounts, card accounts, AR invoices and risk verification. Subscribing to Spend & Expense events needs an `apiToken` header.

## Notification Rules

From [BILL's notification rules](https://developer.bill.com/docs/bill-webhook-api-notification-rules):

- **Organization-specific.** BILL sends notifications only for the organization the subscription was created in. A partner-level subscription covers every organization the partner created.
- **Unique event ID.** Save it and skip duplicates. In the body it's `metadata.eventId`.
- **Order.** Notifications can arrive out of order. Order them by timestamp.
- **History.** BILL keeps 180 days of notifications per subscription: `GET /v3/events/subscription/{subscriptionId}`. Resend one with `POST /v3/events/subscription/{subscriptionId}/event/{eventId}`.

## Delivery and Retries

- BILL needs HTTP **200** within **10 seconds**. Anything else is a failure.
- It retries with exponential backoff (2, 4, 8 and 16 seconds), five attempts in all.
- When the retries run out, BILL sets the subscription's `status.enabled` to `false` and stops sending until you set it back to `true`.

## Limits

- Up to 10 subscriptions per organization.
- No duplicate subscriptions for the same set of events and the same notification URL.
