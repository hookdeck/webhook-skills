# Tabby Webhooks Overview

## What Are Tabby Webhooks?

Tabby (buy now, pay later, MENA) sends HTTPS `POST` callbacks with a JSON body when something
happens to a payment, even if the customer never returns to your site. This makes webhooks the
most reliable way to catch authorized payments. There are two families:

- **Payment webhooks**, registered at `POST /api/v1/webhooks`.
- **Dispute webhooks**, registered at `POST /api/v1/dispute-webhooks` with a live secret key.

Requests are not signed. If you set `header.title` / `header.value` at registration, Tabby adds
that header to every notification, and that is the only thing to verify.

## Common Event Types

Payment payloads have no `event` field. The event is what changed:

| Event | Webhook payment `status` | Payload change | Common Use Cases |
|-------|--------------------------|----------------|------------------|
| Authorize | `authorized` | `status: "authorized"` | Process the order, then send the Capture Request |
| Capture | `authorized` | entry added to `captures[]` | Confirmation of your capture; no action |
| Close | `closed` | `status: "closed"`, `closed_at` set | Payment completed |
| Reject | `rejected` | `status: "rejected"` | Cancel the order |
| Expire (optional) | `expired` | `status`, `expired_at`, `is_expired` updated | Cancel the order; ask Tabby to enable it |
| Refund | `closed` | entry added to `refunds[]` | Record the refund |
| Update | unchanged | `order.reference_id` updated | Sync the reference |

Dispute payloads carry the dispute `status`:

| `status` | Meaning |
|----------|---------|
| `pending` | The customer opened a dispute on your payment |
| `arbitration` | You challenged it or provided evidence and it moved to arbitration |
| `evidence_merchant` | Tabby support requested supporting evidence from you |
| `approved` | The dispute was approved and the amount refunded to the customer |
| `declined` | The dispute was declined by Tabby support |
| `cancelled` | The dispute was cancelled by the customer |

## Event Payload Structure

Payment (lowercase statuses, unlike the Retrieve Request which returns uppercase):

```json
{
  "id": "string", "created_at": "2021-09-14T13:08:54Z", "expires_at": "2022-09-14T13:08:54Z",
  "closed_at": "2021-09-14T13:09:45Z", "status": "closed", "is_test": false, "is_expired": false,
  "amount": "100", "currency": "SAR", "order": { "reference_id": "string" },
  "captures": [{ "id": "string", "amount": "100", "created_at": "...", "reference_id": "string" }],
  "refunds": [{ "id": "string", "amount": "100", "created_at": "...", "reference_id": "string", "reason": "string" }],
  "meta": { "order_id": null, "customer": null }, "token": "string"
}
```

Dispute:

```json
{ "status": "pending", "dispute_id": "string", "payment_id": "string", "currency": "SAR", "created_at": "2026-06-15T13:08:54Z" }
```

## Delivery

Acknowledge with exactly `200`; Tabby times out after 1 minute and resends up to 4 more times.
Order is not guaranteed and duplicates happen (deduplicate disputes by `dispute_id` + `status`).

## Full Event Reference

See [Tabby's payment webhooks documentation](https://docs.tabby.ai/pay-in-4-custom-integration/webhooks)
and [dispute webhooks](https://docs.tabby.ai/pay-in-4-custom-integration/dispute-webhooks).
