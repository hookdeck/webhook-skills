# Segment Webhooks Overview

## What Are Segment Webhooks?

Twilio Segment is a customer data platform (CDP). Its webhook destinations forward the calls your sources collect (from `analytics.js`, mobile SDKs, server libraries, Engage) to your own HTTP endpoint in real time.

There are two destinations:

| Destination | Notes |
|-------------|-------|
| **Webhooks (Actions)** | Current version. Up to 5 mappings, each with its own URL, method (`POST`, `PUT`, `PATCH`), headers, **Data** mapping, and optional batching (default batch size 1000, max 4000). |
| **Webhooks (Classic)** | Older version, marked "under maintenance". Up to 5 URLs with static headers. Always `POST`. |

Both accept Page, Alias, Group, Identify, and Track calls, and both support an optional **Shared Secret** that adds the `X-Signature` header (see [verification.md](verification.md)).

## What Event Types Does Segment Send?

Segment does not have provider-specific event names. Each request body is a [Segment spec](https://segment.com/docs/connections/spec/) call and the `type` field says which one:

| `type` | Triggered When | Common Use Cases |
|--------|----------------|------------------|
| `track` | A user performs an action (`event` holds the name, e.g. `"Order Completed"`) | Trigger workflows, update usage counters, sync conversions |
| `identify` | A user is identified or their traits change | Upsert users in your DB or CRM; Engage audience/computed-trait updates arrive as `identify` |
| `page` | A web page is viewed | Content analytics, session tracking |
| `screen` | A mobile app screen is viewed | Mobile analytics |
| `group` | A user is associated with a group/account | B2B account sync |
| `alias` | Two user identities are merged (`previousId` → `userId`) | Merge user records |
| `delete` | (Classic destination only) a user deletion request was created | Start your own data-deletion automation |

The name of a `track` call (`event`) is free-form and defined by your tracking plan, so dispatch first on `type`, then on `event`.

## Event Payload Structure

Common fields across spec calls:

| Field | Description |
|-------|-------------|
| `type` | `track`, `identify`, `page`, `screen`, `group`, `alias` (or `delete`) |
| `messageId` | Unique ID per message: use it for idempotency |
| `userId` / `anonymousId` | User identifiers |
| `timestamp` | When the call happened (ISO 8601) |
| `context` | Device, OS, app, IP, library, etc. |
| `properties` | `track`, `page`, `screen` data |
| `traits` | `identify`, `group` data |
| `event` | `track` event name |

Example `track` call (from Segment's docs):

```json
{
  "version": 1,
  "type": "track",
  "userId": "019mr8mf4r",
  "event": "Purchased an Item",
  "properties": { "revenue": "39.95", "shippingMethod": "2-day" },
  "timestamp": "2012-12-02T00:30:08.276Z"
}
```

### How Does the Body Change With Webhooks (Actions)?

- The **Data** field of the Send action defaults to `$.`: the entire event. If you customize it, your endpoint receives the custom object, which may not include `type`.
- With **Enable Batching?** on, the body is a JSON **array** of those Data objects. Handle both a single object and an array.

## Delivery Behavior

- Respond within **5 seconds** (classic destination docs); otherwise Segment logs a timeout and retries later.
- Segment retries temporary failures (timeouts, 5xx) for up to **four hours**. Retries can cause duplicates, so de-duplicate on `messageId`.
- Self-signed TLS certificates are rejected.
- Classic: if delivery to any of the configured URLs succeeds, the message is not retried for the others.

## Full Event Reference

- [Webhooks (Actions) destination](https://www.twilio.com/docs/segment/connections/destinations/catalog/actions-webhook)
- [Webhooks (Classic) destination](https://www.twilio.com/docs/segment/connections/destinations/catalog/webhooks)
- [Segment Spec](https://segment.com/docs/connections/spec/)
