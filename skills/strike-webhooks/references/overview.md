# Strike Webhooks Overview

## What Are Strike Webhooks?

[Strike](https://strike.me) (operated by Zap Solutions, Inc.) is the Bitcoin **Lightning Network payments** platform: invoices, Lightning and onchain receives, payments, payouts to bank accounts and currency exchange, all through `https://api.strike.me/v1/*`. Strike webhooks notify your server when one of those resources is created or changes state.

Not to be confused with **Stripe** (`Stripe-Signature`, `t=,v1=`; see `stripe-webhooks`), **Strike Graph** (SOC 2 compliance), the pentest and fintech brands also called Strike, or **Strikedeck** (customer success). None of them share anything with strike.me.

## Webhooks Are Thin: No Entity Data

This is the single most important thing to know. Strike's docs:

> Please note that webhooks do not contain the data of the trigger-event, rather they simply notify that the trigger-event has occurred. To retrieve specific details for the trigger-event, you must make a corresponding API request to retrieve that information.

Every handler follows the same pattern: verify, respond `2xx`, then call the Strike API for `data.entityId` and act on what it returns.

## Event Payload Structure

The body is a `WebhookEvent` (Strike's documented example):

```json
{
  "id": "245e40d8-f197-411c-8f20-a326d08da402",
  "eventType": "invoice.updated",
  "webhookVersion": "v1",
  "data": {
    "entityId": "602cc206-6b4a-42dd-bc89-9a534bb04034",
    "changes": ["state"]
  },
  "created": "2009-01-03T18:15:00+01:00",
  "deliverySuccess": true
}
```

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) | The event ID. **Use it as your idempotency key.** |
| `eventType` | string | See the table below. Free-form `string` in the OpenAPI (no enum), so unknown values are possible. |
| `webhookVersion` | string | `v1` or `v2` per the OpenAPI, fixed by the subscription. |
| `data.entityId` | string (uuid) | The resource the event is about. Fetch it. |
| `data.changes` | string[] | Names of the properties that changed. Present on `*.updated` events only. |
| `data.receiveId` | string (uuid) | **`receive-request.*` events only.** The ID of the incoming payment. Strike's receiving-payments walkthrough: "The `entityId` corresponds to the `receiveRequestId`, while the `receiveId` is the ID of the incoming payment." Read it defensively — it is not in the OpenAPI schema. |
| `created` | string (RFC 3339) | Offset-aware. The setup page shows `+01:00`, the API reference `+00:00`, the recovery page adds milliseconds, and the receive-request examples use **7 fractional digits** (`2024-10-14T10:24:47.0326505+00:00`), which Python's `datetime.fromisoformat` rejects before 3.11. Parse it with a tolerant parser; don't assume UTC or a fixed format. |
| `deliverySuccess` | boolean, nullable | Strike's own bookkeeping: `true` when all delivery attempts succeeded, `false` if any is pending or failed, `null` with no attempts. It is also **absent entirely** from several of Strike's own per-event examples, so treat it as optional as well as nullable. Don't branch on it in a receiver. It's mostly useful on the `GET /v1/events` recovery path. |

`id`, `eventType`, `webhookVersion`, `data` and `created` are required in the OpenAPI. `data` has no sub-schema at all, so read everything inside it defensively (`data?.changes ?? []`).

### `webhookVersion`: v1 vs v2

The OpenAPI accepts `v1` and `v2` on subscriptions and events, but the documentation only shows and describes the **v1** payload, and the API itself is served only under `/v1/*`. As of 2026-11-20, how a v2 payload differs is not documented. Don't assume v1 and v2 are the same. Pin `webhookVersion: "v1"` when you create the subscription (it is a required field) and check `webhookVersion` in the handler so a change shows up in your logs instead of silently breaking parsing. The examples acknowledge a non-v1 event with `200`, log an error and skip it. It stays retrievable from `GET /v1/events` for 30 days.

## Supported Event Types

The 14 events in Strike's API reference ("Supported Events"), with Strike's descriptions, and the endpoint that resolves `data.entityId`:

| Event | Strike's description | Fetch with |
|---|---|---|
| `invoice.created` | New invoice has been created. | `GET /v1/invoices/{invoiceId}` |
| `invoice.updated` | State of the invoice changed. | `GET /v1/invoices/{invoiceId}` |
| `payment-method.bank.created` | New bank payment method has been created. | `GET /v1/payment-methods/bank/{id}` |
| `payment-method.bank.updated` | State of the bank payment method changed. | `GET /v1/payment-methods/bank/{id}` |
| `payout.created` | New payout has been created. | `GET /v1/payouts/{payoutId}` |
| `payout.updated` | State of the payout has changed. | `GET /v1/payouts/{payoutId}` |
| `payout-originator.created` | New payout originator has been created. | `GET /v1/payout-originators/{originatorId}` |
| `payout-originator.updated` | State of the payout originator has changed. | `GET /v1/payout-originators/{originatorId}` |
| `currency-exchange-quote.updated` | State of the currency exchange quote has changed. | `GET /v1/currency-exchange-quotes/{quoteId}` |
| `payment.created` | New payment has been created. | `GET /v1/payments/{paymentId}` |
| `payment.updated` | State of the payment has changed. | `GET /v1/payments/{paymentId}` |
| `deposit.updated` | State of the deposit has changed. | `GET /v1/deposits/{depositId}` |
| `receive-request.receive-pending` | Receive for the receive request has been detected. | `GET /v1/receive-requests/{receiveRequestId}` (and `/receives`) |
| `receive-request.receive-completed` | Receive for the receive request has been completed. | `GET /v1/receive-requests/{receiveRequestId}` (and `/receives`) |

### `receive-request.*` carries a second ID

These two events are the one place `data` holds more than `entityId`. Strike's documented example:

```json
{
  "id": "2aa19d2a-22eb-4868-8fad-8ad765491c3b",
  "eventType": "receive-request.receive-completed",
  "webhookVersion": "v1",
  "data": {
    "entityId": "0191382f-387c-4eec-bc74-980872bfc5e5",
    "receiveId": "24180fae-a62d-4583-a960-759d605d252b"
  },
  "created": "2024-10-14T10:25:18.8850861+00:00"
}
```

`entityId` is the receive request; `receiveId` is the individual payment against it. A receive request can be reusable — an onchain address keeps accepting payments — so `entityId` alone does not tell you *which* receive fired the event. Use `GET /v1/receive-requests/{entityId}/receives` and match on `receiveId` (the endpoint supports filtering by `$receiveId`) to get the description, Lightning pre-image, onchain confirmation count and the paying Strike username.

Note that this example also omits `deliverySuccess` and uses seven fractional-second digits.

Things to notice:

- **Naming.** Dot-separated, lowercase, hyphens inside segments. `payment-method.bank.created` and `payment-method.bank.updated` have three segments: code that splits on `.` and expects two parts will mis-route them. Match the full string, as the examples do.
- **Asymmetry is real.** There is no `deposit.created`, no `currency-exchange-quote.created`, no `invoice.cancelled`, no `receive-request.created`. Don't subscribe to or handle names that don't exist.
- **The list can grow.** Strike's API versioning page lists "Adding a new webhook event type" as a non-breaking change, so new events can appear within v1. Your default branch must return `2xx` for an unknown `eventType`, not `4xx`.
- **Scopes are not events.** Strike OAuth Connect uses similar dotted strings (`invoice.read`, `payout.create`, `account.profile.read`, `quote.execute`, `deposit.manage`, `receive-request.read`, ...). Those are OAuth scopes and appear next to the events in the docs. They are not webhook event types.

## The Fetch-Back Pattern

On `invoice.updated` with `changes: ["state"]`, call `GET /v1/invoices/{entityId}` with `Authorization: Bearer <STRIKE_API_KEY>` and read the invoice's current state (an invoice might move to a paid state, for example; check the API reference for the exact values). Do this **after** responding.

Deliveries can repeat and Strike doesn't promise ordering. Treat the fetched resource as the source of truth rather than reconstructing state from the order events arrived in. An `invoice.updated` processed late simply re-reads the current invoice.

## Delivery, Timeouts and Retries

- **5-second timeout.** "if the response takes longer than 5 seconds, the webhook request will be canceled, treated as failed, and scheduled for retry". Respond `2xx` first, then do the API call.
- **Failure** is a timeout or any non-`2xx` response.
- **Retries:** "An exponential backoff retry policy set to 3 is used... The 1st retry attempt for the webhook will occur 3 seconds after the original webhook was deemed a failure. A 2nd attempt will follow suit 9 seconds after the 1st retry failure, a 3rd attempt 27 seconds after 2nd retry failure, and so on... The Strike API will retry up to 12 attempts, with the 12th attempt being sent approximately 9 days after the original webhook failure."
- **Opting out of retries:** "Your application can opt out of the retry mechanism by responding to the webhook request with a `410` "Gone" or `501` "Not Implemented" HTTP response code." Useful on purpose; dangerous by accident. A framework or proxy that answers `501` for an unimplemented route or method cancels every retry for that delivery.
- **Duplicates:** "the Strike API may deliver a webhook more than once, so your application must be able to accommodate redundant webhooks for the same event occurrence." Dedupe on the top-level `id`.
- **Endpoints:** one URL can receive many event types, or you can create "up to 50 individual endpoints for specific events".

## Recovering Missed Events: `GET /v1/events`

If your endpoint was down long enough for all retries to fail, Strike keeps the events. `GET /v1/events` returns all events for your account for the **past 30 days**, including events with no active webhook subscription. It supports OData filtering, ordering and paging (`$filter`, `$orderby`, `$top`, `$skip`), and returns `{ "items": [WebhookEvent, ...], "count": N, "isCountUnknown": false }`. `count` is the total number of matching events, but when `isCountUnknown` is `true` it must be ignored, so page until you get a short or empty page instead. `$top` defaults to 50 and is capped at 100. `GET /v1/events/{eventId}` fetches one. The API key needs the `partner.webhooks.manage` scope, the same scope the `/v1/subscriptions` endpoints require.

Strike's documented example filter is `eventType eq 'invoice.created' or eventType eq 'invoice.updated' and created lt ... and created gt ...`. As written, its date bounds are inverted (it would match nothing for the outage it describes), and because OData `and` binds tighter than `or`, the window only applies to `invoice.updated`. Parenthesise the event types and put `gt` on the start:

```javascript
// Backfill events between two timestamps, through the same idempotent handler.
async function replayStrikeEvents({ since, until, eventTypes, handle }) {
  const types = eventTypes.map((t) => `eventType eq '${t}'`).join(' or ');
  const filter = `(${types}) and created gt ${since} and created lt ${until}`;
  const top = 100; // maximum page size
  for (let skip = 0; ; ) {
    const qs = new URLSearchParams({ $filter: filter, $orderby: 'created asc', $top: String(top), $skip: String(skip) });
    const base = process.env.STRIKE_API_BASE || 'https://api.strike.me';
    const res = await fetch(`${base}/v1/events?${qs}`, {
      headers: { Authorization: `Bearer ${process.env.STRIKE_API_KEY}`, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`GET /v1/events failed: ${res.status}`);
    const { items, count, isCountUnknown } = await res.json();
    for (const event of items) await handle(event); // same dedupe on event.id as the webhook path
    skip += items.length;
    if (items.length < top) break; // short or empty page: no more results
    if (!isCountUnknown && skip >= count) break; // count is only meaningful when known
  }
}

// replayStrikeEvents({ since: '2026-11-19T13:00:00+00:00', until: '2026-11-19T17:00:00+00:00',
//   eventTypes: ['invoice.created', 'invoice.updated'], handle: processEventOnce });
```

`URLSearchParams` encodes the `+` in `+00:00` as `%2B`. If you build the query string by hand, encode it yourself, or a literal `+` arrives as a space.

## Full Event Reference

- Webhooks overview: https://docs.strike.me/webhooks/overview
- Signature verification: https://docs.strike.me/webhooks/signature-verification
- Failure recovery: https://docs.strike.me/webhooks/failure-recovery
- Supported events: https://docs.strike.me/api/ (Supported Events)
