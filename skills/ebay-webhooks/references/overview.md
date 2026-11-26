# eBay Webhooks Overview

## What Are eBay Webhooks?

eBay delivers server-to-server event notifications through the **Notification
API** (part of eBay's Commerce APIs). You register a **destination** (an HTTPS
endpoint), **subscribe** it to one or more **topics**, and eBay POSTs a JSON
notification to your endpoint whenever a matching event occurs.

The most widely used topic is **`MARKETPLACE_ACCOUNT_DELETION`** (marketplace
account deletion / closure). eBay requires **every** third-party developer using
its APIs to either subscribe to this notification or complete the opt-out
process — it exists so developers can delete a user's personal data when the
user closes their eBay account.

eBay webhooks differ from most providers in two important ways:

- **No shared HMAC secret.** Each notification is signed with eBay's private key
  using **ECDSA**, and you verify it with a public key fetched from eBay.
- **A one-time endpoint challenge.** Before eBay will send notifications, it
  validates your endpoint with a `challenge_code` GET request.

They do **not** follow the Standard Webhooks specification (`webhook-id`,
`webhook-timestamp`, `webhook-signature`).

## Common Topics

| Topic | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `MARKETPLACE_ACCOUNT_DELETION` | An eBay user closed their account or requested personal-data deletion | Delete/anonymize the user's data to comply with eBay policy and privacy law |
| `AUTHORIZATION_REVOCATION` | A user revoked your app's authorization | Stop API calls for that user and purge stored OAuth tokens |
| `ITEM_AVAILABILITY` | Availability of a subscribed item changed | Keep an external catalog in sync |
| `ITEM_PRICE_REVISION` | The price of a subscribed item was revised | Reprice / re-sync listings |
| `PRIORITY_LISTING_REVISION` | A priority listing was revised | Track listing changes |

Topic names are **UPPER_SNAKE_CASE** and appear verbatim in the payload at
`metadata.topic`. The authoritative, current list (with the OAuth scopes needed
to subscribe) comes from the
[`getTopics`](https://developer.ebay.com/api-docs/commerce/notification/resources/topic/methods/getTopics)
method — call it rather than hard-coding topics you cannot verify.

## Event Payload Structure

Notifications share a common envelope. The `metadata.topic` field tells you
which topic fired; the event-specific data is under `notification.data`.

```json
{
  "metadata": {
    "topic": "MARKETPLACE_ACCOUNT_DELETION",
    "schemaVersion": "1.0",
    "deprecated": false
  },
  "notification": {
    "notificationId": "49feeaeb-1b60-4c...",
    "eventDate": "2021-03-19T20:43:59.462Z",
    "publishDate": "2021-03-19T20:43:59.679Z",
    "publishAttemptCount": 1,
    "data": {
      "username": "test_user",
      "userId": "ma8vp1jySJC",
      "eiasToken": "nY+sHZ2PrBmdj6wVnH4..."
    }
  }
}
```

Key fields:

- `metadata.topic` — the topic (dispatch on this).
- `notification.notificationId` — unique per notification; use it for
  **idempotency** (eBay may retry).
- `notification.data` — topic-specific payload (e.g. `userId`, `username`,
  `eiasToken` for account deletion).

## Delivery and Retries

- Acknowledge immediately with `200`, `201`, `202` or `204` (the SDK and
  examples return **204 No Content**). eBay publishes no timeout.
- For Marketplace Account Deletion, eBay resends an unacknowledged notification
  until it is acknowledged. After 24 hours of unacknowledged notifications it
  marks the callback URL down and emails your alert address; you then have 30
  days to fix it before eBay marks you non-compliant. For other topics eBay
  documents only that a destination can be `MARKED_DOWN` after failures.
- Resends mean a notification can arrive **more than once**
  (`notification.publishAttemptCount` counts the sends). eBay documents no
  ordering. Process idempotently, keyed on `notification.notificationId`, and
  compare `notification.eventDate` when order matters.

## Full Event Reference

- [Notification events (all topics)](https://developer.ebay.com/develop/api/sell/notification_events)
- [Notification API reference](https://developer.ebay.com/develop/api/sell/notification_api)
- [Marketplace Account Deletion guide](https://developer.ebay.com/marketplace-account-deletion)
- [getTopics](https://developer.ebay.com/api-docs/commerce/notification/resources/topic/methods/getTopics)
