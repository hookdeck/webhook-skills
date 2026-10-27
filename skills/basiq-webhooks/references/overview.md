# Basiq Webhooks Overview

## What Are Basiq Webhooks?

Basiq is an Australian open-banking (CDR) data API. Webhooks tell your application when something changes in Basiq, so you don't have to poll. You create a subscription with a URL and a list of event types, and Basiq sends an HTTP POST with a JSON body to that URL whenever a subscribed event occurs.

The body is a **thin notification**. It names the event and links to it, and you fetch the data from the Basiq API.

## Event Payload Structure

```json
{
  "eventTypeId": "user.created",
  "eventId": "f2f567b6bbb213c40a2875105327bb37b44a38ab8861b64074e2978b98d1f7c7",
  "links": {
    "event": "https://au-api.basiq.io/events/f2f567b6bbb213c40a2875105327bb37b44a38ab8861b64074e2978b98d1f7c7",
    "eventEntity": "https://au-api.basiq.io/users/88a85f64-5717-4562-b3fc-2c963f66af88"
  }
}
```

| Field | Meaning |
|-------|---------|
| `eventTypeId` | Event type, for example `user.created`. This is the field to switch on |
| `eventId` | ID of the event |
| `links.event` | URL of the event resource |
| `links.eventEntity` | URL of the affected object (user, connection, consent, account, ...) |

No resource data is inlined. Fetch `links.eventEntity` with your Basiq API token to get the current state.

## Common Event Types

Basiq documents these 15 event types. The list may not be exhaustive: `GET /events/types` returns the full current list with descriptions.

| Event | Group |
|-------|-------|
| `user.created`, `user.updated`, `user.deleted` | User lifecycle |
| `connection.created`, `connection.activated`, `connection.invalidated`, `connection.deleted` | Bank connection lifecycle |
| `consent.created`, `consent.updated`, `consent.revoked`, `consent.expired`, `consent.reminder`, `consent.warning` | CDR consent lifecycle |
| `account.updated` | Account data changed |
| `transactions.updated` | Transaction data changed |

Event names are lowercase, dot-separated, and `transactions.updated` is **plural** while the others are singular.

## Delivery Notes

- **Transport:** JSON `POST` to the subscribed URL.
- **Messages:** Every webhook message is kept and can be listed with `GET /notifications/webhooks/{webhookId}/messages` and fetched with `.../messages/{messageId}`.
- **Resends:** `webhook-id` stays the same if the same message is resent, so use it to dedupe.
- **Start-up delay:** A new subscription can take up to 15 minutes before deliveries start.
- **Gaps:** Basiq's docs don't state a retry schedule, response timeout or ordering guarantee. Return a `2xx` fast, queue slow work, and treat events as possibly duplicated or out of order. Fetching the entity gives you current state either way.
- **Source IPs:** `13.238.192.210`, `3.24.252.173`, `3.104.17.39`.

## Full Event Reference

See [Basiq's webhook documentation](https://api.basiq.io/docs/webhooks), the [List event types](https://api.basiq.io/reference/listeventtypes) API reference, and [webhook security](https://api.basiq.io/docs/webhooks-security).
