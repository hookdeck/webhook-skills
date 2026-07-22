# Facebook (Meta Graph API) Webhooks Overview

## What Are Facebook Webhooks?

Facebook webhooks are delivered through the **Meta Graph API** webhooks system.
A single webhook product is shared across Facebook Pages, Instagram, Messenger,
WhatsApp Business, and other Meta objects. You configure one HTTPS **Callback
URL** per app, then subscribe to one or more **objects** (e.g. `page`,
`instagram`, `user`) and the **fields** you care about within each object.

Facebook webhooks do **not** follow the Standard Webhooks spec. There are no
`webhook-id` / `webhook-timestamp` / `webhook-signature` headers.

## How Delivery Works

1. **GET verification handshake (once, on registration).** When you save the
   Callback URL, Meta sends a `GET` request with `hub.mode=subscribe`,
   `hub.verify_token`, and `hub.challenge`. Your endpoint must confirm the
   `hub.verify_token` matches the Verify Token you configured and echo back the
   `hub.challenge` value as a `200` plain-text response.
2. **POST event delivery.** Meta sends a `POST` with a JSON body and an
   `X-Hub-Signature-256` header for verification.

## Event Model: (object, field) Pairs

Facebook events are **not** dotted strings like `payment.succeeded`. Each event
is an **(object, field) pair**:

- The top-level `object` names the Meta product (`page`, `instagram`, `user`,
  `permissions`, `whatsapp_business_account`, …).
- Each item in `entry[].changes[]` has a `field` (e.g. `feed`, `mention`,
  `comments`) and a `value` object with the change details.

## Common Event Types

| Object | Field | Triggered When | Common Use Cases |
|--------|-------|----------------|------------------|
| `page` | `feed` | Post, comment, like, or reaction on the Page | Moderate comments, sync posts, reply |
| `page` | `mention` | The Page is mentioned in a post/comment | Social listening, alerts |
| `page` | `messages` | A person messages the Page (Messenger) | Chatbots, support routing |
| `instagram` | `comments` | A comment is added to an IG media object | Comment moderation, auto-reply |
| `instagram` | `mentions` | The IG account is @mentioned | Engagement tracking |
| `user` | `feed` | An update is posted to a user's feed | Personal timeline sync |
| `permissions` | — | A user grants or revokes a permission | Revoke handling, re-auth prompts |

For the complete list of objects and fields, see the
[Meta Webhooks Reference](https://developers.facebook.com/docs/graph-api/webhooks/reference).

## Event Payload Structure

Standard change delivery (`changes` array):

```json
{
  "object": "page",
  "entry": [
    {
      "id": "<page-id>",
      "time": 1458692752,
      "changes": [
        {
          "field": "feed",
          "value": {
            "item": "comment",
            "verb": "add",
            "comment_id": "..."
          }
        }
      ]
    }
  ]
}
```

Messenger delivery (`messaging` array instead of `changes`):

```json
{
  "object": "page",
  "entry": [
    {
      "id": "<page-id>",
      "time": 1458692752,
      "messaging": [
        {
          "sender": { "id": "<psid>" },
          "recipient": { "id": "<page-id>" },
          "message": { "mid": "...", "text": "Hello" }
        }
      ]
    }
  ]
}
```

### Key Points

- **Always iterate `entry[]`.** A single POST can **batch up to 1000 updates**.
- **Respond `200 OK` quickly**, then process asynchronously. Meta retries failed
  deliveries immediately, then with decreasing frequency for up to **36 hours**,
  after which they are dropped.
- **Development mode apps only receive test notifications.** Move the app to Live
  mode to receive real user events.

## Full Event Reference

For the complete list of objects, fields, and payload shapes, see
[Meta's Webhooks documentation](https://developers.facebook.com/docs/graph-api/webhooks)
and the [Webhooks Reference](https://developers.facebook.com/docs/graph-api/webhooks/reference).
