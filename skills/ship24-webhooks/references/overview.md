# Ship24 Webhooks Overview

## What Are Ship24 Webhooks?

Ship24 is a multi-carrier parcel tracking API. When you follow shipments with Trackers, Ship24
pushes a webhook message to your Webhook URL whenever it finds new tracking events. Each message
carries the whole event, so you can process it without calling the API again. If you subscribe to
the Proof of Delivery add-on, proofs of delivery arrive by webhook too.

Webhooks are POST requests with a JSON body. They are not signed; each request carries your
account's Webhook Secret as `Authorization: Bearer <secret>`.

## Topics

| `metadata.topic` | Triggered When | Common Use Cases |
|------------------|----------------|------------------|
| `tracking/events` | A tracker has a new tracking event | Update order status, notify customers |
| `tracking/pod` | A proof of delivery is retrieved (`data.status` is `found`) or the courier returned none (`unavailable`) | Store the signature or delivery photo |

Proof of delivery messages go to the separate Proof of Delivery Webhook URL (which may point at
the same endpoint) and are never grouped.

## Message Structure

```json
{
  "trackings": [
    {
      "metadata": {
        "generatedAt": "2025-03-04T17:13:35.000Z",
        "messageId": "356a7f93-3ce5-4b49-b560-156537283df9",
        "topic": "tracking/events"
      },
      "tracker": {
        "trackerId": "26148317-7502-d3ac-44a9-546d240ac0dd",
        "trackingNumber": "9400115901047177598206",
        "shipmentReference": "c6e4fef4-a816-b68f-4024-3b7e4c5a9f81",
        "clientTrackerId": "3fa99515-3ca0-4901-85bb-056ee016799b",
        "isSubscribed": true,
        "createdAt": "2025-03-01T03:16:22.000Z"
      },
      "shipment": { "shipmentId": "f4f888d7-d140-423f-9a48-e0689d27e098" },
      "events": [
        {
          "eventId": "ee8ebe96-4eae-4a91-9a99-8f3afa6a0f46",
          "status": "Delivered to the addressee",
          "occurrenceDatetime": "2025-03-04T17:12:57"
        }
      ],
      "statistics": {}
    }
  ]
}
```

- `trackings` holds one item by default. If you raise "Maximum number of updates per webhook
  message" in the dashboard, Ship24 groups updates (after about 15 minutes) and the array may hold
  several, so always loop over it.
- With default settings `events` holds one event per message.
- Some fields belong to add-on options and are absent when you aren't subscribed; tolerate that.
- A `tracking/pod` item has `metadata`, `tracker` and `data` (`status`, `courier`, `content`).
  `content.type` is `text/plain` or `text/html` (text in `content.text`) or `application/pdf`,
  `image/png`, `image/jpeg` (file at `content.downloadUrl`, valid for 7 days).

## Delivery Behavior

- Any `2xx` response counts as delivered; the body doesn't matter.
- Otherwise Ship24 retries up to 20 times with exponential backoff, from a few seconds to a few hours.
- Messages can arrive out of order. Compare `occurrenceDatetime` with the latest event you hold.
- The same `metadata.messageId` can arrive more than once, so dedupe on it.
- The resend webhooks API endpoint replays all messages for a tracker.

## Full Reference

See [Ship24's webhook documentation](https://docs.ship24.com/webhooks/overview).
