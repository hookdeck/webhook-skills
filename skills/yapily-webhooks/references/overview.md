# Yapily Webhooks Overview

## What Are Yapily Webhooks?

Yapily is an open banking API. Its webhooks push real-time HTTP POST notifications to your server when something changes on the platform, such as a payment changing status or an async data request becoming ready to collect, so you don't have to poll the API. Webhooks is currently a Private Beta product; ask your Yapily Customer Success Manager for access.

You register a webhook for one or more **event categories**. Each notification carries a `type` describing the triggered event and an `event` object whose structure depends on that type.

## Common Event Types

| Event (`type`) | Triggered When | Common Use Cases |
|----------------|----------------|------------------|
| `single_payment.status.completed` | A single payment's status transitions to COMPLETED | Mark an order paid |
| `single_payment.status.updated` | A single payment's status transitions to COMPLETED or FAILED | Generic terminal-state handler |
| `single_payment.iso_status.updated` | A single payment's ISO 20022 status (`statusDetails.isoStatus`) changes; can fire several times | Detailed status tracking (e.g. `ACSC`, `RJCT`) |
| `hosted_pis.payment_status.completed.v1` | A Hosted Pages payment completed successfully | Fulfil an order |
| `hosted_pis.payment_status.failed.v1` | A Hosted Pages payment failed to execute | Notify customer, offer retry |

Other categories exist (for example async data-access processing). List the categories enabled for your application with `GET /webhook/events/categories`. Treat any `type` you don't handle as a no-op and return 200.

Notes from Yapily's docs: payment webhooks are for single payments only; the payment status has one transition while the ISO status can have several; some institutions don't provide status updates; and Yapily gives up delivering a payment webhook after 24 hours without a status update.

## Event Payload Structure

```json
{
  "id": "41285f64-5717-4562-b3fc-2c961236afa6",
  "applicationId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "type": "single_payment.status.completed",
  "event": { "id": "PDC_...", "status": "COMPLETED", "statusDetails": { "isoStatus": { "code": "ACSC", "name": "AcceptedSettlementCompleted" } } },
  "metadata": { "tracingId": "6cf5ef06-9f96-4f24-8bab-32ab09128010", "user": { "key": "value" } }
}
```

- `id` - the webhook/delivery ID (Yapily's introduction calls it the Webhook ID; the hosted payments page calls it the delivery ID). Log it, but don't rely on it alone for idempotency; also key on a stable identifier inside `event` such as the payment ID plus status.
- `applicationId` - the application that registered the webhook
- `type` - the triggered event type
- `event` - type-specific contents
- `metadata.tracingId` - Yapily tracing ID, useful in support requests
- `metadata.user` - the metadata you supplied at registration (under 10kB)

## Delivery Rules

- Delivered over HTTPS to a public URL with a valid certificate (self-signed is not supported)
- Respond `200 OK` within 1 second
- You can register a backup callback URL that is used when the main one isn't responding

## Full Event Reference

- [Webhooks introduction](https://docs.yapily.com/tools-and-services/webhooks/introduction)
- [Payment notifications](https://docs.yapily.com/payments/payment-resources/payment-notifications)
- [Hosted payment webhooks](https://docs.yapily.com/tools-and-services/hosted-pages/payment-webhooks)
