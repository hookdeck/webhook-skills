# Recurrente Webhooks Overview

## What Are Recurrente Webhooks?

[Recurrente](https://recurrente.com) is a Guatemalan payments platform: card, bank transfer,
crypto, balance and cash payments, subscriptions, p2p transfers, withdrawals, and connected
accounts for platforms. It sends an HTTPS `POST` to every endpoint you register when something
happens in your account. Deliveries go through Svix and are signed. The official docs are in
Spanish ([guía de webhooks](https://docs.recurrente.com/guias-espanol/comenzar/webhooks)).

| Aspect | Value |
|--------|-------|
| Method | `POST`, JSON body |
| Signature headers | `svix-id`, `svix-timestamp`, `svix-signature` (Standard Webhooks) |
| Success | Any `2xx` |
| Delivery | At-least-once; duplicates are possible. No timeout or ordering guarantee is documented |
| Filtering | None documented: every endpoint receives every event, and each registered URL gets each event |

## Event Payload Structure

Payment events (`intent.*`) use one unified payload for every payment method. It has three layers:

- **Envelope:** `type` (the payment method: `payment`, `bank_transfer`, `crypto`, `balance`,
  `cash`), `event_type` (the event), `status` (`pending`, `succeeded`, `failed`, `canceled`,
  `paid`), `raw_status` (the processor's exact value), `id`, `legacy_id`, `receipt_number`,
  `api_version`, `created_at`.
- **Payment data:** `amount_in_cents`, `currency`, `customer`, `product`, `tax_invoice_url`,
  `checkout`, `payment`.
- **`details`:** method-specific fields. For `payment`: fees, installments, channel. For
  `bank_transfer`: `bank_reference` and `sender_comment`.

```json
{
  "type": "payment",
  "event_type": "intent.succeeded",
  "api_version": "2026-06-01",
  "id": "in_id123",
  "legacy_id": "pa_id123",
  "receipt_number": 100482,
  "status": "succeeded",
  "raw_status": "succeeded",
  "created_at": "2026-06-01T14:03:21Z",
  "customer": { "id": "cus_id123", "email": "cliente@example.com", "full_name": "Ana Lopez" },
  "amount_in_cents": 25000,
  "currency": "GTQ",
  "product": { "id": "prod_id123" },
  "checkout": { "id": "ch_id123", "status": "paid" },
  "payment": { "id": "pa_id123" },
  "details": { "fee": 875, "installments": 1, "channel": "Tarjeta" }
}
```

`id` is the canonical id. `legacy_id` is the id of the same charge in the legacy per-method event,
so use it to link historical records during a migration. Subscription, transfer, and other
non-intent events have their own flat shapes, each with `event_type` and `api_version`. You can
fetch any payment with `GET /api/intents/{id}`, which returns the same shape as the webhook.
Connected-account events (`verification.*`, `tax_invoice_settings.enabled`) reach the platform with
`connected: true` and the child's `account_id`.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `intent.succeeded` | A charge succeeds (any method); funds are in your balance | Fulfil the order |
| `intent.pending` | A charge starts or is pending (bank transfer, crypto) | Show "awaiting payment" |
| `intent.failed` | A charge fails | Notify the customer |
| `intent.canceled` | An intent is canceled | Release stock |
| `intent.paid` | Balance payments only, sent to the **paying** account | Reconcile outgoing balance payments |
| `subscription.create` | A subscription is created (also emitted with `intent.succeeded` for recurring products) | Provision access |
| `subscription.past_due` | The first automatic charge fails | Start dunning |
| `subscription.pause` / `subscription.unpause` | A subscription is paused / resumed | Suspend or restore access |
| `subscription.reactivate` | A canceled subscription is reactivated within the allowed period | Restore access |
| `subscription.update` | General info changes, such as the payment method | Sync records |
| `subscription.item_added` / `subscription.item_removed` | A recurring product is added or removed (`item` is the changed item, `items` the current list) | Change entitlements |
| `subscription.invoice_item_added` | A one-off charge is added to the next invoice | Update billing preview |
| `subscription.cancel` | The subscription is canceled, including after 15 failed charge attempts | Deprovision |
| `setup_intent.succeeded` | A trial subscription starts, or a card is tokenized without a charge | Save the payment method |
| `setup_intent.cancelled` | A card can't be tokenized | Ask for another card |
| `refund.create` | A refund is processed | Reverse fulfilment |
| `dispute.create` / `dispute.update` | A chargeback is opened or changes | Submit evidence |
| `verification.completed` | A connected account's verification is accepted | Enable the account |
| `verification.rejected` | Documents were rejected | Read `document_errors` and re-collect |
| `tax_invoice_settings.enabled` | FEL tax invoicing finished activating | Start issuing invoices |
| `account_connection.create` | A child account connects to a platform | Onboard the account |
| `transfer.sent` / `transfer.received` | A p2p transfer is sent / received | Reconcile |
| `withdrawal.create` / `withdrawal.update` | A bank withdrawal is created / changes status | Track payouts |

The examples handle exactly these events and acknowledge anything else with `200`.

## Other Documented Events

- **Legacy per-method payment events:** `payment_intent.*`, `bank_transfer_intent.*`,
  `automated_bank_transfer_intent.succeeded`, `balance_intent.*`, `crypto_intent.*`,
  `cash_intent.succeeded`. Accounts created after the unified-format change receive only
  `intent.*` for these methods. Older accounts keep both formats, even for a new endpoint. Each
  Sandbox uses the unified format.
- **Partner commissions:** `partner_commission_invoice.issued`, `partner_commission_invoice.failed`
  (the daily commission DTE was issued, or reached a terminal failure).
- **Transfers:** `transfer.pending`, `transfer.in_review`, `transfer.cancelled` (p2p in automatic
  evaluation, in human review, or rejected after review; the amount returns to the sender).
- **Stablecoin sends:** `swap.create`, `swap.update`.

`withdrawal.*` and `swap.*` carry a `transfer` key in the same shape as `GET /api/transfers/{id}`.
For withdrawals read `withdrawal.status` (or `transfer.status`); `withdrawal.update` with
`status: "sent"` is terminal success for local withdrawals, so don't wait for `completed`.

This is the list on the guide page. Recurrente's
[event catalog](https://docs.recurrente.com/referencia-api/api-reference/webhook-events/intent-succeeded-webhook)
documents more, so treat unknown `event_type` values as expected and return `200`.

## Retries

If your endpoint doesn't return a `2xx`, Recurrente retries: immediately after the first failure,
then after 1 minute, 5 minutes, 30 minutes, 2 hours, and 6 hours. The page doesn't say whether each
delay counts from the previous attempt. This is separate from subscription charge retries (daily,
up to 15 attempts per period). Deduplicate on `svix-id`, which stays the same across retries,
return `2xx` quickly, and process on a queue.
