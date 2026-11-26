# PAY.JP Webhooks Overview

## What Are PAY.JP Webhooks?

PAY.JP (Japanese payments) creates an `event` object whenever an API resource is created or changed. If you have registered a destination URL, PAY.JP sends that event to it as an HTTP `POST` with a JSON body. Webhooks are useful for asynchronous changes such as a subscription renewal, which PAY.JP's servers trigger rather than your client. Requests are not signed; each carries an `X-Payjp-Webhook-Token` header holding your account's token so you can confirm it came from PAY.JP.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `charge.succeeded` | A payment succeeds | Fulfil the order |
| `charge.failed` | A payment fails | Notify the customer, retry |
| `charge.updated` | A charge is updated | Sync metadata |
| `charge.refunded` | A charge is refunded | Reverse fulfilment |
| `charge.captured` | An authorized charge is captured | Confirm the sale |
| `dispute.created` | A chargeback occurs | Gather evidence |
| `token.created` | A token is created | Audit |
| `customer.created` | A customer is created | Sync the customer record |
| `customer.updated` | A customer is updated | Sync the customer record |
| `customer.deleted` | A customer is deleted | Remove the record |
| `customer.card.created` | A customer's card is added | Update payment methods |
| `customer.card.updated` | A customer's card is updated | Update payment methods |
| `customer.card.deleted` | A customer's card is deleted | Update payment methods |
| `plan.created` / `plan.updated` / `plan.deleted` | A plan changes | Sync the catalogue |
| `subscription.created` | A subscription is created | Activate access |
| `subscription.updated` | A subscription is updated | Sync the plan |
| `subscription.deleted` | A subscription is deleted | Revoke access |
| `subscription.paused` | A subscription is paused | Suspend access |
| `subscription.resumed` | A subscription is resumed | Restore access |
| `subscription.canceled` | A subscription is canceled | Schedule revocation |
| `subscription.renewed` | A subscription period renews | Extend access |
| `transfer.succeeded` | A payout is confirmed | Reconcile |
| `tenant.created` / `tenant.updated` / `tenant.deleted` | A tenant changes (PAY.JP Platform only) | Sync tenants |
| `tenant_transfer.succeeded` | A tenant payout is confirmed (PAY.JP Platform only) | Reconcile |
| `term.created` / `term.closed` | A settlement term is created or closed | Reconcile |
| `statement.created` | A statement is created | Archive |
| `balance.created` / `balance.fixed` / `balance.closed` / `balance.merged` | A balance changes | Reconcile |

## API v2 Event Types

Accounts on PAY.JP API v2 receive these types at the same URLs, with the same token header. The customer, dispute, term, statement and balance types above appear in both versions.

| Resource | Events |
|----------|--------|
| Payment flow | `payment_flow.created`, `payment_flow.succeeded`, `payment_flow.canceled`, `payment_flow.amount_capturable_updated`, `payment_flow.payment_failed`, `payment_flow.requires_action`, `payment_flow.processing` |
| Setup flow | `setup_flow.created`, `setup_flow.succeeded`, `setup_flow.canceled`, `setup_flow.requires_action`, `setup_flow.setup_failed` |
| Payment method | `payment_method.attached`, `payment_method.detached`, `payment_method.updated` |
| Checkout Session | `checkout.session.completed`, `checkout.session.expired` |
| Refund | `refund.created`, `refund.updated`, `refund.failed` |
| Catalog | `product.created`, `product.updated`, `product.deleted`, `price.created`, `price.updated`, `price.deleted`, `tax_rate.created`, `tax_rate.updated` |

PAY.JP's v2 guide shows the webhook body with `created` in Unix seconds, while the v2 Events API schema lists `created_at` and `updated_at` (ISO 8601). Accept either.

## Event Payload Structure

```json
{
  "id": "evnt_5328acdbdb5294d6fc9cc903f8c",
  "object": "event",
  "livemode": false,
  "type": "charge.succeeded",
  "created": 1442212986,
  "pending_webhooks": 1,
  "data": { "id": "ch_bcb7776459913c743c20e9f9351d4", "object": "charge", "amount": 5000, "currency": "jpy", "paid": true }
}
```

- `id` - the event ID (`evnt_...`); use it to dedupe, because the same webhook can arrive more than once
- `type` - the event type; dispatch on it
- `data` - the affected object, the same JSON the API returns
- `livemode` - `false` for test mode, `true` for live mode
- `pending_webhooks` - how many destination URLs have not yet received the event successfully

## Delivery

- Every webhook is a `POST` with a JSON body.
- Respond with HTTP `200`. PAY.JP ignores everything but the status code, so the response body can be empty.
- On a `4xx` or `5xx` response PAY.JP retries every 3 minutes, at most 3 times.
- Deliveries can be late (month-end and the top of the hour are busy) or duplicated; keep handlers idempotent.

## Full Event Reference

See [PAY.JP's webhook guide](https://docs.pay.jp/v1/webhook), the [event list in the API reference](https://docs.pay.jp/v1/api/) and the [v2 events and webhooks guide](https://docs.pay.jp/v2/guide/developers/event-webhook).
