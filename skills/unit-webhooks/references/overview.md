# Unit Webhooks Overview

## What Are Unit Webhooks?

Unit sends an HTTP POST to your webhook URL when an event occurs in your org
(an application is approved, a customer or account is created, a transaction
posts, a payment changes state). You create webhooks in the Unit Dashboard or
with `POST /webhooks`. Unit says new event types are added continuously, so your
handler must ignore types it does not know.

## Payload Structure

The body is a JSON:API document. `data` is an **array** of event resources:

```json
{
  "data": [
    {
      "id": "269",
      "type": "account.created",
      "attributes": { "createdAt": "2021-04-13T07:40:43.813Z", "tags": { "tag": "value" } },
      "relationships": {
        "account": { "data": { "id": "10004", "type": "account" } },
        "customer": { "data": { "id": "10000", "type": "customer" } }
      }
    }
  ]
}
```

With `includeResources: true` the full related resource is included as well.

## Delivery Modes and Retries

| `deliveryMode` | Behavior |
|----------------|----------|
| `AtMostOnce` | One event per request. Any timeout or non-200 response means no retry. |
| `AtLeastOnce` | Up to 64 events batched per request. Retried on timeout or non-success with Fibonacci backoff, up to 1 hour between tries. |

Use the event `id` as an idempotency key, especially with `AtLeastOnce`.

`contentType` is `Json` or `JsonAPI`. `subscriptionType` is `All`,
`OnlyAuthorizationRequest` or `NotAuthorizationRequest`.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `application.approved` | Application approved | Start onboarding, create accounts |
| `application.denied` | Application denied | Notify the applicant |
| `customer.created` | Customer created | Sync customer records |
| `account.created` | Account created | Store the account id |
| `transaction.created` | Transaction posted | Update ledger, notify user |
| `payment.clearing` | Payment is clearing | Update payment status |
| `payment.returned` | Payment returned | Reverse and alert |

## Other Events

`account.closed|frozen|reopened|unfrozen|updated`, `accountHold.created|released`,
`application.awaitingDocuments|canceled|created|pendingReview`,
`authorization.amountChanged|canceled|created|declined|updated`,
`authorizationRequest.approved|declined|pending`,
`card.activated|created|pinChanged|reissuing|replacing|statusChanged`,
`checkDeposit.*`, `checkPayment.*`, `creditApplication.*`, `creditDecision.*`,
`customer.archived|updated`, `dispute.created|statusChanged`,
`document.approved|rejected`, `payment.canceled|created|pendingReview|rejected|sent`,
`receivedPayment.*`, `recurringPayment.*`, `repayment.*`, `statement.created`,
`stopPayment.*`, `transaction.updated`, `wireDrawdown.created`, and more.

## Full Event Reference

See [Unit's webhook events documentation](https://www.unit.co/docs/api/events/).
