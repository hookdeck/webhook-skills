# Basiq Webhooks Overview

## What Are Basiq Webhooks?

[Basiq](https://basiq.io) is an Australian open-banking (CDR) data API covering users, consents, connections, accounts and transactions. Its webhooks notify you when those objects change. Subscriptions are created through the API (`POST /notifications/webhooks`), and the current list of event types is served by `GET /events/types`.

Deliveries are a JSON `POST` to your subscribed URL, signed with [Standard Webhooks](https://www.standardwebhooks.com/) headers (`webhook-id`, `webhook-timestamp`, `webhook-signature`).

## Which Basiq Webhook Events Are There?

Basiq documents these 15 event types (the list may not be exhaustive; call `GET /events/types` for the current set):

| Event | Triggered when | Common use cases |
|-------|----------------|------------------|
| `user.created` | A user is created | Provision records for the new user |
| `user.updated` | A user is updated | Refresh your copy of the user |
| `user.deleted` | A user is deleted | Remove the user's data on your side |
| `connection.created` | A connection is created | Track onboarding progress |
| `connection.activated` | A connection becomes active | Start the first data fetch |
| `connection.invalidated` | A connection is invalidated | Ask the user to reconnect |
| `connection.deleted` | A connection is deleted | Clean up |
| `consent.created` | A consent is created | Record the consent |
| `consent.updated` | A consent is updated | Refresh consent details |
| `consent.warning` | A consent warning is raised | Warn the user |
| `consent.reminder` | A consent reminder is due | Prompt the user to renew |
| `consent.expired` | A consent has expired | Stop fetching data |
| `consent.revoked` | A consent was revoked | Stop fetching data, delete as required |
| `account.updated` | An account is updated | Re-fetch the account |
| `transactions.updated` | Transactions are updated | Re-fetch transactions |

## What Does a Basiq Webhook Payload Look Like?

A thin notification. No resource data is inlined:

```json
{
  "eventTypeId": "transactions.updated",
  "eventId": "evt-123",
  "links": {
    "event": "https://au-api.basiq.io/events/evt-123",
    "eventEntity": "https://au-api.basiq.io/users/usr-456/transactions"
  }
}
```

- `eventTypeId` is the event type (the discriminator).
- `eventId` identifies the event.
- `links.event` points at the event, and `links.eventEntity` at the affected object. Fetch them with your Basiq API token to get the data.

The URLs above are illustrative; use the links you receive.

## Delivery Semantics

- Messages are kept and can be listed with `GET /notifications/webhooks/{webhookId}/messages`.
- A new subscription may take up to 15 minutes to start delivering.
- Basiq's docs state no retry schedule, timeout or ordering guarantee. Treat delivery as at-least-once and unordered.
- Dedupe on `webhook-id` (and `eventId`), return a `2xx` quickly, and fetch the data asynchronously.

## Full Event Reference

- [Basiq webhooks](https://api.basiq.io/docs/webhooks)
- [Webhook security](https://api.basiq.io/docs/webhooks-security)
