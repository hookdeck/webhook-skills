# Worldline Webhooks Overview

## What Are Worldline Webhooks?

Worldline webhooks are HTTPS POSTs that Worldline sends when an object on your merchant account changes: a payment, refund, payout, token, dispute, capture or (Direct) payment link. **Worldline Connect** (formerly Ingenico Connect / GlobalCollect) and **Worldline Direct** (formerly Ingenico Direct / Ogone Direct) use the same envelope and the same `X-GCS-Signature` signing. Their event lists, endpoint activation and retry schedules differ, and this page keeps them separate.

## What Does a Worldline Webhook Payload Look Like?

Each request carries one JSON object. Event metadata sits at the top level, and the affected resource sits under a single sibling key.

| Field | Type | Meaning |
|---|---|---|
| `apiVersion` | string | "The version of the REST API that is used for the structure of the object." Currently `"v1"` |
| `id` | string (UUID) | "The unique id of this event." The idempotency key; retries carry the same value. Prefixed `TEST` for Connect Configuration Center test events |
| `created` | string | When the event occurred. Connect sample: `"2017-09-14T17:14:39.688+0200"`; Direct samples: `"2020-12-09T11:20:40.3744722+01:00"`. Parse leniently: precision and offset form vary |
| `merchantId` | string | Merchant the event occurred on. Numeric-looking on Connect (`"20000"`), alphanumeric on Direct (`"TESTCIMCREDITCARDS"`) |
| `type` | string | `object.event`, for example `payment.created` or `refund.captured` |

Canonical Connect example (from the event-structure page):

```json
{
  "apiVersion": "v1",
  "id": "97a4fcdf-9a08-4a59-a0c0-69bfd7e1d59d",
  "created": "2017-09-14T17:14:39.688+0200",
  "merchantId": "20000",
  "type": "payment.created",
  "payment": {
    "id": "000000200000000105460000100001",
    "paymentOutput": {
      "amountOfMoney": { "amount": 1000, "currencyCode": "EUR" },
      "references": { "paymentReference": "0" },
      "paymentMethod": "card"
    },
    "status": "CREATED",
    "statusOutput": {
      "isCancellable": true,
      "statusCategory": "CREATED",
      "statusCode": 0,
      "isAuthorized": false
    }
  }
}
```

### Which key holds the resource?

The resource object is "identical to the object returned by the GET … REST endpoint" for that object. The key names come from each SDK's `WebhooksEvent` model:

| Type prefix | Body key | Platform |
|---|---|---|
| `payment.` | `payment` | Both |
| `refund.` | `refund` | Both |
| `payout.` | `payout` | Connect (also in the Direct SDK model) |
| `token.` | `token` | Connect (also in the Direct SDK model) |
| `dispute.` | `dispute` | Connect |
| `capture.` | `capture` | Connect |
| `paymentlink.` | **`paymentLink`** | Direct |

- The Connect event-structure page says it supports "four object types" (payment, refund, payout, token). That sentence is out of date: the event-types page documents `dispute.*` and `capture.*`, and the SDK model has both keys. Read the key defensively.
- The event type is lower case (`paymentlink.created`) but the body key is camelCase (`paymentLink`). Splitting `type` on `.` and reading that key will miss it. Map the prefix to the key explicitly.
- The Direct SDK model also has a `directBatch` key (`GetBatchStatusResponse`). No `directbatch.*` event type was documented as of 2026-11-24.
- One Direct `SendTestWebhook` sample also shows `"apiFullVersion": "v1.1"`. That field is not in either SDK's model or on the event-structure page, so don't depend on it.
- Some worked examples on the Direct webhooks page render the body inside a one-element array (`[ { … } ]`). That is a rendering artefact. The wire format is a bare object: the SDKs `JSON.parse` straight into an object with `.type`. The examples unwrap a single-element array defensively anyway.

### Payment fields worth knowing

- `payment.paymentOutput.amountOfMoney.{amount, currencyCode}`: **integer minor units**. `1000` EUR is €10.00. Never a decimal.
- `payment.paymentOutput.references.paymentReference`. Direct also has `merchantReference`.
- `payment.status` (for example `"CREATED"`) and `payment.statusOutput.{isCancellable, statusCategory, statusCode, statusCodeChangeDateTime, isAuthorized}`. Direct adds `isRefundable`.
- Direct card payments add `paymentOutput.cardPaymentMethodSpecificOutput.{paymentProductId, card.cardNumber (masked), card.expiryDate, fraudResults, threeDSecureResults}`.
- `statusCode` is a numeric Worldline status code. The codes differ by platform and product, and these pages don't define them. **Route on `type` and `status`, not `statusCode`.**

**Sensitive data:** masked PAN, expiry, BIN, country, 3-D Secure CAVV/XID, fraud results and device IP country can all appear. Don't log raw bodies, and keep them out of error traces.

## Worldline Connect Event Types

All 56 events from the Connect event-types page (fetched 2026-11-24), plus `payment.paid_increment`.

| Object | Events |
|---|---|
| payment | `payment.created`, `payment.redirected`, `payment.pending_payment`, `payment.account_verified`, `payment.pending_fraud_approval`, `payment.authorization_requested`, `payment.pending_approval`, `payment.pending_completion`, `payment.pending_capture`, `payment.capture_requested`, `payment.captured`, `payment.paid`, `payment.completed`, `payment.capture_in_progress`, `payment.reversed`, `payment.chargeback_notification`, `payment.chargebacked`, `payment.rejected`, `payment.rejected_capture`, `payment.cancelled`, `payment.refunded` |
| refund | `refund.created`, `refund.pending_approval`, `refund.rejected`, `refund.refund_requested`, `refund.captured`, `refund.refunded`, `refund.cancelled` |
| payout | `payout.created`, `payout.pending_approval`, `payout.rejected`, `payout.payout_requested`, `payout.account_credited`, `payout.rejected_credit`, `payout.cancelled`, `payout.reversed` |
| token | `token.created`, `token.updated`, `token.expired`, `token.expiring_soon`, `token.deleted` |
| dispute | `dispute.draft`, `dispute.created`, `dispute.invalid_representment`, `dispute.send_to_bank`, `dispute.success`, `dispute.expired`, `dispute.cancelled` |
| capture | `capture.created`, `capture.rejected`, `capture.cancelled`, `capture.captured`, `capture.paid`, `capture.chargebacked`, `capture.chargeback_notification`, `capture.requested` |

Per-event notes from the table:

- **`payment.paid_increment`**: the `payment.paid` row says "This subscription will also deliver payment.paid_increment for additional matched funds after first payment." It is a real delivered `type`, but it has no table row or description of its own.
- **`payment.authorization_requested`**: "(This is only applicable to Union Pay and Braspag.)"
- **`payment.completed`**: "this is the final state. No additional actions are possible, except for refunds."
- **`token.deleted`**: "The event's token payload will contain only an id." Don't read other token fields.
- **`dispute.draft`**: disputes created through the API aren't processed until you submit them through the API.
- The page warns: "We will add more events in the future, so make sure you check this page". Handlers must return 2xx for unknown types.

Common uses:

| Event | Use |
|---|---|
| `payment.pending_approval` / `payment.pending_capture` | Payment authorised and awaiting your approval or capture |
| `payment.captured` / `payment.paid` | Funds captured or matched: fulfil the order |
| `payment.rejected` / `payment.cancelled` | Release stock, notify the customer |
| `payment.chargebacked` / `dispute.created` | Start dispute handling |
| `refund.refunded` | Mark the refund complete |
| `token.expiring_soon` / `token.expired` | Ask the customer to update a stored card |

## Worldline Direct Event Types

From the Direct webhooks page. Direct has no `token`, `dispute` or `capture` events, and adds `paymentlink.*`.

| Object | Events |
|---|---|
| payment | `payment.created`, `payment.redirected`, `payment.authorization_requested`, `payment.pending_approval`, `payment.pending_completion`, `payment.pending_capture`, `payment.capture_requested`, `payment.captured`, `payment.rejected`, `payment.rejected_capture`, `payment.cancelled`, `payment.refunded` |
| refund | `refund.refund_requested` |
| paymentlink | `paymentlink.created`, `paymentlink.clicked`, `paymentlink.paid`, `paymentlink.cancelled`, `paymentlink.expired`, `paymentlink.payment.rejected`, `paymentlink.payment.cancelled` |

- `paymentlink.payment.rejected` and `paymentlink.payment.cancelled` have **three** segments. "Everything before the first dot" (`paymentlink`) is the right object, but `split('.')[1]` is the wrong event name. Match on the prefix or on the full string.
- The Direct page documents `payment.cancelled` **twice**: once in the event table (`statusOutput.statusCode=6`), and again in a subsection below it (`statusCode=1`: the customer cancelled on the Hosted Checkout page, or the session expired). It is one event name.
- The Direct test message from `SendTestWebhook` has type `payment.test`, which is not in the table. Treat it like any other unknown type: acknowledge it with 2xx.
- **Online vs offline events (Direct):** the Direct page defines these two ways. Its "Messages" section calls online events third-party authorisation results and offline events captures and refunds. A later section says online events are maintenance operations (capture, refund) that **change the `payment.id`**, while platform-driven status changes keep it. The page also says "we strongly recommend not building your business operations around it", so don't. What matters in practice is that a capture or refund can carry a different `payment.id` from its authorisation. If you correlate on `payment.id` alone, you can attach a capture or refund to the wrong record. Correlate on `paymentOutput.references.merchantReference` as well.

## How Does Worldline Deliver and Retry Webhooks?

### Worldline Connect

- **Timeout: 10 seconds.** Any non-2xx is a failure, including redirects: "HTTP redirects, which are 3xx codes, will also fail."
- **Blacklisting:** "If five consecutive messages cannot be delivered to an endpoint, we'll temporarily stop sending messages to that endpoint for 5 minutes."
- **Retries, relative to the first attempt:** 1 immediately, 2 at 5 min, 3 at 1 h, 4 at 2 h, 5 at 4 h, 6 at 6 h, 7 at 8 h, 8 at 16 h, 9 at 24 h, 10 at 48 h. "After 10 retry attempts, which equates to 48 hours from our initial try, we classify an event as undeliverable."
- **No manual resend.** "You can use our REST API to check the status of the specific objects you're concerned about."
- **Latency:** "The first delivery attempt will occur within 24 hours of the event's creation time". The FAQ adds: "Delivery times can range from seconds to hours."
- **Prioritisation:** critical flow events (`payment.pending_fraud_approval`, `payment.pending_approval`, `payment.pending_completion`) go ahead of informational ones like `payment.paid`, which "may experience slightly longer delivery times".
- **Ordering:** "The sequence of events we send may not always match the order in which they happened."
- **Duplicates:** "An event may be sent multiple times."
- "Please respond with a 2xx HTTP status code immediately after receiving the message and handle all other tasks afterward."

### Worldline Direct

- **Retries, relative to the previous attempt:** 10 min, 1 h, 2 h, 8 h, 24 h (five retries).
- **`retry-count` header:** "The first attempt will have a retry-count of 0, and each retry will increase this number." It is unsigned and easy to spoof, so use it for observability only and never for authentication or deduplication. Connect doesn't document this header.
- **Duplicates:** "Receiving duplicate webhook events is a feature of our reliable delivery architecture and not indicative of a system error."

### On both platforms

Respond 2xx at once. Dedupe on the top-level `id` in persistent storage; there is no timestamp, so this is your replay protection. Derive state from the resource's own `status` or a REST re-read, not from arrival order.

## Full Event Reference

- Connect event types: https://docs.connect.worldline-solutions.com/documentation/webhooks/event-types/
- Connect webhooks guide: https://docs.connect.worldline-solutions.com/documentation/webhooks/
- Direct webhooks guide: https://docs.direct.worldline-solutions.com/en/integration/api-developer-guide/webhooks
