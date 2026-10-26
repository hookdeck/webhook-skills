# HitPay Webhooks Overview

## What Are HitPay Webhooks?

HitPay event webhooks are HTTP POST requests sent after key events on the HitPay platform (payments, orders, invoices, payouts, transfers). You register a URL under Developers > Webhooks. The URL must use HTTPS and resolve to a public destination; loopback and private network addresses are rejected.

These are distinct from the **legacy callbacks** (payment-request webhooks, redirect callbacks, recurring payment callbacks, order/checkout callbacks and plugin validation for Shopify, Wix and Xero). Those are form-encoded, carry an `hmac` field in the payload and are keyed with the API-key salt. They are **not covered** by this skill.

## Headers

| Header | Details |
|--------|---------|
| `Hitpay-Signature` | HMAC-SHA256 of the raw JSON body, using that webhook endpoint's salt (hex) |
| `Hitpay-Event-Object` | The object type: `charge`, `payout`, `invoice`, `order` or `transfer` |
| `Hitpay-Event-Type` | `created` / `updated` and similar, depending on the event |
| `User-Agent` | `HitPay v2.0` |

The body is a JSON object whose structure depends on `Hitpay-Event-Object`. It carries **no event name**, so dispatch on `{Hitpay-Event-Object}.{Hitpay-Event-Type}`.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `charge.created` | A payment is successfully completed | Fulfil the order, send a receipt |
| `charge.updated` | A payment is refunded or partially refunded | Record the refund |
| `payout.created` | A payout is successfully completed | Reconcile payouts |
| `order.created` | An order is created successfully | Create the order in your system |
| `order.updated` | An order status is updated | Sync order status |
| `invoice.created` | An invoice is created | Store the invoice |
| `transfer.created` / `transfer.updated` | A transfer is created or updated | Track transfers |
| `transfer.processing` / `transfer.scheduled` | A transfer is processed or scheduled | Track transfers |
| `transfer.paid` | A transfer is paid | Mark settled |
| `transfer.failed` | A transfer fails | Alert finance |
| `transfer.canceled` | A transfer is canceled | Update status |

HitPay's event list also includes `payment_request.completed`, `payment_request.failed`, `recurring_billing.method_attached`, `recurring_billing.method_detached` and `recurring_billing.subscription_updated`. The docs' header table lists only the five objects above for `Hitpay-Event-Object`, so check what a real delivery of those events carries (the Hookdeck or HitPay delivery log shows the headers) before relying on them. Platform accounts also see `charge.failed`.

## Event Payload Structure

A `charge` payload includes `id`, `business_id`, `channel`, `customer_id`, `status` (for example `succeeded`), `customer`, `currency` (lowercase, for example `sgd`), `amount`, `refunded_amount`, `refunded_at`, `fixed_fee`, `failed_reason` and the nested `order`. Order, invoice, payout and transfer payloads have their own shapes; see the docs.

## Platform Accounts

Converting to a Platform Account does not automatically send webhooks: the platform must register its own endpoints. Charge events for sub-account payments created through the Platform APIs go to the **platform** account's endpoints (use `business_id` in the payload to find the sub-account); payment-request events go to the sub-account's endpoints.

## Full Event Reference

See [HitPay's webhook documentation](https://docs.hitpayapp.com/apis/guide/events).
