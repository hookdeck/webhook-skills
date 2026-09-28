# Snipcart Webhooks Overview

## What Are Snipcart Webhooks?

[Snipcart](https://snipcart.com) is an HTML/JS shopping cart you embed in any
site. Its webhooks push order and subscription activity from Snipcart's servers
(`app.snipcart.com`) to an HTTPS endpoint you configure in the dashboard.

Two families exist, and they behave very differently:

| Family | Events | Response |
|--------|--------|----------|
| **Asynchronous** (general webhook URL) | `order.*`, `v3/subscription.*` | Just acknowledge: `200` + JSON body |
| **Synchronous** (separate dashboard settings) | `shippingrates.fetch`, `taxes.calculate` | Your **response body is consumed at checkout** |

Both families carry the same `X-Snipcart-RequestToken` header, and neither is
signed — see [verification.md](verification.md).

## Event Envelope

Every payload shares this envelope:

| Field | Type | Notes |
|-------|------|-------|
| `eventName` | string | e.g. `order.completed`, `v3/subscription.state.cancelled` |
| `mode` | string | `"Live"` or `"Test"` |
| `createdOn` | datetime | ISO 8601 (the cart payload of `taxes.calculate` is the exception — its inner dates are Unix timestamps) |
| `content` | object | Event-specific payload |

Some events add extra **top-level** fields alongside `content` (see the table below).

> **Snipcart may add new fields to webhook payloads at any time, without notice
> or a new version. Existing fields are not renamed or removed.** Handlers must
> ignore unknown fields — strict schema validation will break on a silent addition.

There is **no event id and no delivery id** in the envelope. For idempotency,
key on the order token (`content.token`, or `content.orderToken` on refund /
notification / withdrawal payloads) combined with `eventName`, and optionally
`createdOn`.

## Order Events

Source: [Order events](https://docs.snipcart.com/v3/webhooks/order-events)

| Event | Triggered when | Extra top-level fields | `content` |
|-------|----------------|------------------------|-----------|
| `order.completed` | A new order is successfully completed | — | Order |
| `order.status.changed` | Order status changes | `from`, `to` (order status) | Order |
| `order.paymentStatus.changed` | Payment status changes | `from`, `to` (payment status) | Order |
| `order.trackingNumber.changed` | Tracking number is set or changed | `trackingNumber`, `trackingUrl` | Order |
| `order.refund.created` | An order is refunded | — | Refund |
| `order.notification.created` | A notification is added to an order | — | Notification |
| `order.withdrawal.created` | An EU withdrawal request is submitted | — | Withdrawal |

### Order object (key fields)

`token`, `invoiceNumber`, `email`, `status`, `paymentStatus`, `currency`
(lowercase ISO), `items[]`, `total`, `grandTotal`, `finalGrandTotal`,
`billingAddress`, `shippingAddress`, `mode`, `completionDate`, `subscriptionId`,
`isRecurringOrder`. The full object carries 50+ fields.

**Order statuses:** `InProgress`, `Processed`, `Disputed`, `Shipped`,
`Delivered`, `Pending`, `Cancelled`, `Dispatched`

**Payment statuses:** `Paid`, `Deferred`, `PaidDeferred`, `ChargedBack`,
`Refunded`, `Paidout`, `Pending`, `Failed`, `Expired`, `Cancelled`, `Open`,
`Authorized`

### Refund content

`orderToken`, `amount`, `comment`, `notifiedCustomerByEmail`, `currency`

### Notification content

`orderToken`, `notificationType`, `sentByEmail`, `sentByEmailOn`, `subject`, `message`

### Withdrawal content

`id`, `orderToken`, `orderInvoiceNumber`, `customerName`, `requestedAt`,
`isPartial`, `isOutsideWithdrawalPeriod`, `refundAmount`, `resolution`,
`confirmationNumber`, `items[]`

## Subscription Events

Source: [Subscription events](https://docs.snipcart.com/v3/webhooks/subscription-event)

**The `v3/` prefix is part of the event name string. Do not strip it.**

| Event | Triggered when | `content` |
|-------|----------------|-----------|
| `v3/subscription.invoice.payment.succeeded` | A recurring subscription payment succeeds | `{ order, subscription }` |
| `v3/subscription.invoice.payment.failed` | A recurring subscription payment fails | `{ order, subscription }` |
| `v3/subscription.state.cancellationRequested` | Cancellation is requested (stays in this state until the end of the billing cycle) | `{ subscription }` |
| `v3/subscription.state.cancelled` | A subscription is cancelled | `{ subscription }` |

> The **first** payment does not trigger `v3/subscription.invoice.payment.succeeded`
> or `.failed` — only recurring payments do. Capture the initial charge from
> `order.completed` instead.

### Subscription object

`id`, `selectedPlan` (`id`, `userDefinedId`, `name`, `interval`, `count`,
`frequency`, `trialPeriodInDays`), `initialOrder`, `items[]`, `nextBillingDate`,
`finalBillingDate`, `state`, `customerDetailsId`, `card` (`last4`, `brand`)

## Synchronous Webhooks

These are configured in **their own dashboard settings**, not in the general
webhook URL field, and Snipcart consumes the response body during checkout.
They still carry `X-Snipcart-RequestToken`, so validate it first.

### `shippingrates.fetch`

Source: [Shipping](https://docs.snipcart.com/v3/webhooks/shipping) ·
Configure at **Store configurations → Shipping → Webhooks**

Request `content` is the current order. Respond `2XX`,
`Content-Type: application/json`:

```json
{
  "rates": [
    {
      "cost": 10,
      "description": "10$ shipping",
      "userDefinedId": "shipping_10",
      "guaranteedDaysToDelivery": 5
    }
  ]
}
```

`cost` and `description` are required. `userDefinedId` must be unique across the
returned rates and ends up on the order as `shippingRateUserDefinedId`.

To show the customer an error instead, still respond `2XX`:

```json
{ "errors": [{ "key": "invalid_postal_code", "message": "The postal code is invalid." }] }
```

### `taxes.calculate`

Source: [Taxes](https://docs.snipcart.com/v3/webhooks/taxes) ·
Configure at **Store configurations → Taxes → Providers → Webhooks**

Request `content` is the **live cart** (not an order). Watch out: dates inside
the cart payload are **Unix timestamps**, not ISO strings, and `paymentMethod`
is a number. Respond `2XX` JSON:

```json
{
  "taxes": [
    { "name": "Tax1", "amount": 10.00, "rate": 0.05, "numberForInvoice": "TAX-001" }
  ]
}
```

`name` and `amount` are required; `amount` is in the cart's currency units
(**not** cents), rounded to 2 decimals. Optional: `rate`, `numberForInvoice`,
`includedInPrice`, `appliesOnShipping`, `category`, `exemptionReason`,
`taxableBase`.

> Because a synchronous response is required, these two endpoints must point
> **directly** at your app. Hookdeck (and any other store-and-forward gateway)
> cannot synchronously return a destination's response to the client.

## Responding to Webhooks

> "Your designated endpoint must respond with data in `Content-Type
> application/json` format and a status code `200`."

Return a JSON body (e.g. `{"received": true}`), not an empty or `text/plain`
200. Snipcart's own [examples](https://docs.snipcart.com/v3/webhooks/examples)
(PHP, ASP.NET, Rails) return `400` for an unparsable body or a missing
`eventName`.

## What Snipcart Does Not Document

Do not assume these exist — the v3 docs describe none of them:

- A retry policy or retry schedule (the dashboard has a manual **"Send this hook
  again"** button and a per-request log instead)
- A delivery timeout
- A source-IP allowlist
- Event ids or delivery ids
- Any HMAC or signature scheme

## Full Event Reference

- [Webhooks introduction](https://docs.snipcart.com/v3/webhooks/introduction)
- [Order events](https://docs.snipcart.com/v3/webhooks/order-events)
- [Subscription events](https://docs.snipcart.com/v3/webhooks/subscription-event)
- [Shipping webhook](https://docs.snipcart.com/v3/webhooks/shipping)
- [Taxes webhook](https://docs.snipcart.com/v3/webhooks/taxes)
