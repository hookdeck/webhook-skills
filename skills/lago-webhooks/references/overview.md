# Lago Webhooks Overview

## What Are Lago Webhooks?

Lago (open-source usage billing, cloud and self-hosted) sends an HTTP `POST` to every webhook endpoint configured for your organization whenever something happens: an invoice is finalized, a subscription starts, a wallet runs out of credits. You can register up to 10 endpoints and choose which events each one receives.

This skill covers endpoints created with the **`hmac`** signature algorithm. Lago's default is `jwt`, which is not covered here; see [setup.md](setup.md) for how to choose HMAC.

## Common Event Types

The event name is in `webhook_type`.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `invoice.created` | An invoice is finalized | Record receivable, send invoice |
| `invoice.payment_status_updated` | The payment provider reports a new payment status | Mark invoice paid/failed internally |
| `subscription.started` | A subscription starts (`previous_plan_code` set on upgrade/downgrade) | Provision access |
| `subscription.terminated` | A subscription is terminated (`next_plan_code` set on plan change) | Revoke access |
| `customer.created` | A customer is created | Sync to CRM |
| `wallet.depleted_ongoing_balance` | A wallet's ongoing balance is 0 or negative | Prompt a top-up |

Other documented events include `invoice.drafted`, `invoice.generated`, `invoice.payment_failure`, `invoice.payment_overdue`, `invoice.voided`, `credit_note.created`, `subscription.trial_ended`, `subscription.usage_threshold_reached`, `wallet.created`, `wallet_transaction.created`, `payment.succeeded`, `payment_request.created`, `plan.created`, `billable_metric.created`, `alert.triggered` and `events.errors`.

## Event Payload Structure

```json
{
  "webhook_type": "invoice.created",
  "object_type": "invoice",
  "organization_id": "...",
  "invoice": { "lago_id": "...", "status": "finalized" }
}
```

`object_type` names the key that carries the object.

## Headers

| Header | Value |
|--------|-------|
| `X-Lago-Signature` | Base64 HMAC-SHA256 of the raw body (in `hmac` mode) |
| `X-Lago-Signature-Algorithm` | `hmac` |
| `X-Lago-Unique-Key` | Idempotency key for the message |

## Delivery and Retries

Respond `200`, `201`, `202` or `204` to acknowledge. Anything else (or a network error) is a failure; Lago makes up to 3 attempts per event, with growing waits. Self-hosted: `LAGO_WEBHOOK_ATTEMPTS` (default 3) and `LAGO_WEBHOOK_TIMEOUT_SECONDS` (default 30).

## Full Event Reference

See [Lago's webhook messages reference](https://docs.getlago.com/api-reference/webhooks/messages) and the [webhooks guide](https://docs.getlago.com/guide/webhooks).
