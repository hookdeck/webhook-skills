# Swan Webhooks Overview

## What Are Swan Webhooks?

Swan is an embedded banking platform. When something happens to a resource in your Swan project
that you did not trigger yourself (a transaction is booked, an onboarding changes status, a card is
created), Swan sends an HTTP `POST` to the endpoint of each matching webhook subscription.
Notifications are deliberately thin: they say what happened and to which resource, and you query
the Swan GraphQL API for the details.

Webhooks are **not signed**. If the subscription has a webhook secret, Swan sends it as plain text
in the `x-swan-secret` header of every request. See [verification.md](verification.md).

## Common Event Types

`eventType` is `<Resource>.<Action>`. Swan documents many more than these; subscribe only to the ones you need.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `Transaction.Booked` | A transaction is booked on an account | Update your ledger |
| `Transaction.Pending` | A transaction is pending (for example a card authorization) | Show a pending balance movement |
| `Transaction.Rejected` | A transaction is rejected | Notify the account holder |
| `Account.Created` | An account is created | Provision the account in your system |
| `AccountHolder.Updated` | An account holder changes (for example verification status) | Refresh KYC state |
| `Card.Created` | A card is created | Store the card reference |
| `Onboarding.Updated` | An onboarding changes | Advance your onboarding flow |

Other documented events include `Transaction.Released`, `Transaction.Canceled`, `Transaction.Upcoming`,
`Account.Closing`, `Account.Closed`, `AccountMembership.Suspended`, `Consent.Granted`, `Consent.Refused`,
`MerchantPayment.Captured`, `AccountStatement.Generated` and `AccountInvoice.Generated`.

## Event Payload Structure

```json
{
  "eventType": "Transaction.Booked",
  "eventId": "$YOUR_EVENT_ID",
  "eventDate": "2021-08-18T09:35:46.673Z",
  "projectId": "$YOUR_PROJECT_ID",
  "resourceId": "$YOUR_RESOURCE_ID"
}
```

- `eventType`: the action performed on a resource type
- `eventId`: unique per event; use it to deduplicate
- `resourceId`: the resource the event is about; use it to query the API
- `projectId`: your Swan project

## Delivery Behavior

- Respond with `200 OK` within **10 seconds**; do the real work asynchronously.
- Errors and timeouts are retried **every 30 seconds, up to 7 times**. After that, retry manually from
  Dashboard > Developers > Webhooks (events are kept 90 days) or with the `replayWebhookEvent` mutation.
- **At-least-once**: the same `eventId` can arrive more than once. Deduplicate on `eventId`.
- **Unordered**: events can arrive out of order (a card payment produces `Transaction.Pending`, then
  `Transaction.Booked`, then `Transaction.Released`). Query the API for the current state.
- Swan sends from `52.210.172.90`, `52.51.125.72` and `54.194.47.212` (Sandbox and Live).

## Full Event Reference

See [Swan's webhook documentation](https://docs.swan.io/developers/using-api/webhooks).
