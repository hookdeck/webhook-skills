# Dwolla Webhooks Overview

## What Are Dwolla Webhooks?

Dwolla creates an Event each time a resource (Customer, funding source, transfer, and so on) is created or updated. If you have an active webhook subscription, each Event triggers an HTTP `POST` to your subscribed URL. A single API request can fire several webhooks, for example initiating a transfer can create both `transfer_created` and `customer_transfer_created`.

Webhooks are asynchronous, are not guaranteed to arrive in order, and can be delivered more than once. You can have up to five subscriptions in Production and ten in Sandbox.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `customer_created` | A Customer is created | Provision the user in your system |
| `customer_verified` | A Customer is verified | Enable sending and receiving funds |
| `customer_funding_source_added` | A funding source is added | Prompt for bank verification |
| `customer_funding_source_verified` | A funding source is verified | Allow transfers from that bank |
| `customer_transfer_created` | A transfer is created for a Customer | Show a pending payment |
| `customer_transfer_completed` | A Customer transfer succeeds | Mark an order paid |
| `customer_transfer_failed` | A Customer transfer fails | Notify the user, retry |
| `customer_bank_transfer_completed` | A bank transfer for a Customer succeeds | Reconcile bank settlement |

## Event Payload Structure

```json
{
  "id": "80d8ff7d-7e5a-4975-ade8-9e97306d6c15",
  "resourceId": "36E9DCB2-889B-4873-8E52-0C9404EA002A",
  "topic": "customer_created",
  "timestamp": "2015-10-22T14:44:11.407Z",
  "_links": {
    "self": { "href": "https://api-sandbox.dwolla.com/events/80d8ff7d-..." },
    "account": { "href": "https://api-sandbox.dwolla.com/accounts/b4cdac07-..." },
    "resource": { "href": "https://api-sandbox.dwolla.com/customers/36E9DCB2-..." },
    "customer": { "href": "https://api-sandbox.dwolla.com/customers/36E9DCB2-..." }
  }
}
```

Requests also carry `X-Dwolla-Topic` and `X-Request-Signature-SHA-256` headers.

## Delivery Rules

- Respond with a 2xx within 10 seconds.
- Failed attempts are retried up to 8 times over 72 hours.
- After 400 consecutive failures and 24 hours since the last success, the subscription is paused and the account admin is emailed.
- Dedupe on the event `id`. Two events can share a `resourceId` and `topic` (sender and receiver both get `customer_transfer_created`). Return 200 for duplicates; a 409 can get the subscription paused.
- Webhooks can arrive slightly before the API reflects the new status. Retry API reads with backoff for up to about 5 minutes.

## Full Event Reference

See [Dwolla's webhook events documentation](https://developers.dwolla.com/docs/webhook-events) and [Working with Webhooks](https://developers.dwolla.com/docs/balance/webhooks).
