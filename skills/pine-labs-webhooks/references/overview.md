# Pine Labs Webhooks Overview

## What Are Pine Labs Webhooks?

Pine Labs Online (Plural by Pine Labs) notifies your server about changes to orders, payments, refunds, customers, card tokens, subscriptions, payouts and cross-border settlements. Each notification is an HTTP `POST` with a JSON body to the URL Pine Labs registered for you during onboarding. Webhooks are asynchronous, so for time-sensitive decisions Pine Labs recommends polling the Get Order API.

Every delivery carries three Standard Webhooks headers (`webhook-id`, `webhook-timestamp`, `webhook-signature`). Verifying them is mandatory per Pine Labs' docs. See [verification.md](verification.md).

## Event Types

Names are exact and case-sensitive. Pine Labs documents 30 (the list may not be exhaustive).

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `CUSTOMER_ACTIVATED` | The customer is activated on Pine Labs Online | Mark the customer active |
| `CUSTOMER_DELETED` | The customer is removed from Pine Labs Online | Clean up customer records |
| `CUSTOMER_SUSPENDED` | The customer is temporarily suspended through the portal | Block new charges |
| `CUSTOMER_CREATION_FAILED` | Customer creation fails | Retry or alert |
| `ORDER_AUTHORIZED` | The order is ready for authorization | Pre-auth flows |
| `ORDER_PROCESSED` | The payment is successfully received | Fulfil the order |
| `ORDER_CANCELLED` | The order is cancelled | Release inventory |
| `PAYMENT_FAILED` | A payment against an order fails | Prompt the customer to retry |
| `ORDER_FAILED` | The order fails | Mark the order failed |
| `REFUND_PROCESSED` | A refund succeeds | Update the order, notify the customer |
| `REFUND_FAILED` | A refund against an order fails | Alert support |
| `TOKEN_ACTIVATED` | A card token is activated via the network | Enable saved-card payments |
| `TOKEN_DEACTIVATED` | The token is deactivated | Remove the saved card |
| `TOKEN_SUSPENDED` | The token is suspended | Disable the saved card |
| `TOKEN_PROVISION_FAILED` | Token provisioning fails | Fall back to a full card entry |
| `SUBSCRIPTION_ACTIVATED` | The subscription is activated | Grant access |
| `SUBSCRIPTION_PENDING` | The subscription is pending | Show a pending state |
| `SUBSCRIPTION_PAUSED` | The subscription is paused | Pause access |
| `SUBSCRIPTION_RESUMED` | The subscription is resumed | Restore access |
| `SUBSCRIPTION_COMPLETED` | The subscription is completed | Close it out |
| `SUBSCRIPTION_CHARGED` | A successful charge is made | Record the payment |
| `SUBSCRIPTION_HALTED` | All retries are exhausted and it moves from Pending to Halted | Dunning, suspend access |
| `SUBSCRIPTION_CANCELLED` | The subscription is cancelled | Revoke access |
| `SUBSCRIPTION_REVOKE_FAILED` | An attempt to revoke the subscription fails | Alert support |
| `SUBSCRIPTION_UPDATED` | The subscription is updated | Sync plan details |
| `SUBSCRIPTION_UPDATE_FAILED` | An attempt to update the subscription fails | Alert support |
| `payout-transaction-success` | The payout is processed | Mark the payout paid |
| `payout-transaction-failed` | The payout fails | Retry or alert |
| `ORDER_SETTLED` | Cross-border import payments: the order is settled | Reconcile |
| `ORDER_SETTLEMENT_REJECTED` | Cross-border import payments: settlement is rejected | Investigate |

## Payload Structure

Most events are `{ "event_type": "<EVENT>", "data": { ... } }`:

| Group | `data` holds |
|-------|--------------|
| Orders, payments, refunds, settlement | `order_id`, `merchant_order_reference`, `type` (`CHARGE` / `REFUND`), `status`, `order_amount { value, currency }`, `purchase_details`, and `parent_order_id` on refunds |
| Customers | `customer { customer_id, status, ... }` |
| Tokens | `token { token_id, customer_id, status, payment_method, ... }` |
| Subscriptions | `subscription { subscription_id, status, plan_details, ... }`. These payloads also carry top-level `event_id` and `merchant_id` |
| Payouts | See below |

**Payout events use a different envelope.** The key is camelCase `eventType`, with `eventId`, `eventSource: "PAYOUT"`, `eventVersion`, `sentAt` and `eventTimeStamp` beside `data`, and camelCase `data` fields (`clientReferenceId`, `paymentReferenceId`, `status`, `bankTransactionReferenceId`, `amount`). The Pay by Points order examples use `eventType` as well. Read `event_type ?? eventType`.

## Delivery, Retries and Ordering

- A `2XX` within 5 seconds counts as delivered. Anything else is retried immediately, then after 5 seconds, 5 minutes, 30 minutes, 2 hours, 5 hours and two more times at 10 hours.
- The overview page instead says Pine Labs sends "up to three times" and to wait 5 seconds. The retry policy page has the longer schedule, so plan for the longer one.
- Order is not guaranteed: `ORDER_PROCESSED` can arrive before `ORDER_AUTHORIZED`.
- `webhook-id` stays the same when an event is resent. Deduplicate on it.

## Full Event Reference

See Pine Labs' [Webhook Available Events](https://www.pinelabs.com/docs/online-payments/developer-tools/webhooks/available-events) for sample payloads, and the [webhooks overview](https://www.pinelabs.com/docs/online-payments/developer-tools/webhooks) for the NAT gateway IP ranges to allowlist.
