# Google Cloud Pub/Sub Webhooks Overview

## What Are Pub/Sub "Webhooks"?

Google Cloud Pub/Sub is a message bus, not a webhook product. It becomes a
webhook source through a **push subscription**: a subscription configured with a
`pushEndpoint` URL. Pub/Sub then delivers each message on the topic as an
`HTTPS POST` to that URL, instead of waiting for your client to pull.

```
publisher → topic → push subscription → HTTPS POST → your endpoint
```

The consequence that trips people up: **Pub/Sub defines no events.** It is a
transport. Whatever your publisher put into the message is what you receive.
There is no `invoice.paid` or `order.created` event catalog owned by Google —
if you see event names, some *other* Google service (Cloud Storage
notifications, Cloud Build, Eventarc, Firebase) chose them and published them
through Pub/Sub.

## Push vs Pull

| | Pull | Push |
|---|---|---|
| Who initiates | Your subscriber client | Pub/Sub |
| Endpoint needed | No | Yes, publicly reachable HTTPS |
| Flow control | Your client | Pub/Sub's slow-start push window |
| Ack | Explicit `acknowledge` call | HTTP response status code |

This skill covers **push** only. Pull subscriptions do not involve webhooks.

## The Push Envelope

Default ("wrapped") delivery sends `Content-Type: application/json` with this
body:

Google's documented maximum example:

```json
{
  "deliveryAttempt": 5,
  "message": {
    "attributes": {
      "key": "value"
    },
    "data": "SGVsbG8gQ2xvdWQgUHViL1N1YiEgSGVyZSBpcyBteSBtZXNzYWdlIQ==",
    "messageId": "2070443601311540",
    "message_id": "2070443601311540",
    "orderingKey": "key",
    "publishTime": "2021-02-26T19:13:55.749Z",
    "publish_time": "2021-02-26T19:13:55.749Z"
  },
  "subscription": "projects/myproject/subscriptions/mysubscription"
}
```

| Field | Always present | Notes |
|-------|----------------|-------|
| `message.messageId` | Yes | Server-assigned ID. **Stable across redeliveries** — use it to de-duplicate |
| `message.publishTime` | Yes | RFC 3339 timestamp of when the message was published |
| `message.data` | **No** | Base64-encoded payload. Absent when a message is published with attributes only |
| `message.attributes` | No | Optional string→string map set by the publisher |
| `message.orderingKey` | No | Present only when the publisher set one and ordering is enabled |
| `subscription` | Yes | Full resource name; useful as a coarse allowlist |
| `deliveryAttempt` | No | Present only when a dead letter topic is configured |

The camelCase fields above are the documented ones. Some payloads also carry
snake_case duplicates (`message_id`, `publish_time`) for legacy clients — prefer
the camelCase forms.

### Decoding `data`

`data` is base64 of arbitrary bytes. It is frequently, but not necessarily,
JSON:

```javascript
const raw = message.data ? Buffer.from(message.data, 'base64').toString('utf8') : null;
```

```python
raw = base64.b64decode(message["data"]).decode("utf-8") if message.get("data") else None
```

Always handle the absent case. An attribute-only message is valid and common
for lightweight signals.

### Unwrapped delivery

A subscription can be configured for **payload unwrapping** (`--push-no-wrapper`),
in which case the decoded message data is the whole HTTP body and Pub/Sub sets
no `Content-Type`. Message metadata and attributes are dropped unless you also
enable **write metadata** (`--push-no-wrapper-write-metadata`): then the
metadata arrives as `x-goog-pubsub-*` headers (`x-goog-pubsub-message-id`,
`x-goog-pubsub-publish-time`, `x-goog-pubsub-subscription-name`,
`x-goog-pubsub-ordering-key`) and each attribute as a header named after its
own key. The examples in this skill assume the default wrapped format. If you
enable unwrapping, there is no `message` object to parse. See
[Payload unwrapping](https://cloud.google.com/pubsub/docs/payload-unwrapping).

## "Event Types" Come From Your Publisher

Because Pub/Sub owns no event catalog, route on something the **publisher**
controls:

1. **An attribute** — the common convention. The publisher sets
   `attributes.eventType` (or `type`, `event`, whatever you agree on) and your
   handler switches on it. Cheap: you can route without decoding `data`.
2. **A field inside the decoded payload** — e.g. `payload.type`. Requires
   decoding first.
3. **The subscription itself** — one topic and subscription per event kind, so
   the URL path or `subscription` field is the discriminator.

Do not hardcode event names you have not agreed with your publisher; there is no
authoritative list to check them against.

## Delivery Semantics

- **At-least-once.** Duplicates are expected, not exceptional. Make handlers
  idempotent and de-duplicate on `messageId`.
- **Acknowledgement is the HTTP status code.** `200`, `201`, `202`, `204`, and
  `102` ack. Everything else — including a timeout — nacks and schedules a retry.
- **Ack deadline** defaults to **10 seconds** and is configurable up to 600
  seconds. Push subscriptions cannot extend the deadline per message, so return
  quickly and process asynchronously.
- **Push backoff.** Sustained nacks slow delivery for the entire subscription
  with an exponential backoff between 100 ms and 60 s, then recover via a
  slow-start push window.
- **Ordering** is only guaranteed within an `orderingKey`, and only when message
  ordering is enabled on the subscription.
- **Dead letter topics** move messages aside after N delivery attempts; enable
  one so a poison message cannot retry forever.

## Authentication

Push requests carry no proof of origin unless the subscription is configured
with a push auth service account. When it is, every request has an
`Authorization: Bearer <OIDC JWT>` header signed by Google.

See [verification.md](verification.md) for the claims and how to validate them,
and [setup.md](setup.md) for creating the subscription with authentication
enabled.

## Full Reference

- [Push subscriptions](https://cloud.google.com/pubsub/docs/push)
- [Authentication for push subscriptions](https://cloud.google.com/pubsub/docs/authenticate-push-subscriptions)
- [Subscription properties](https://cloud.google.com/pubsub/docs/subscription-properties)
- [Handling message failures / dead letter topics](https://cloud.google.com/pubsub/docs/handling-failures)
