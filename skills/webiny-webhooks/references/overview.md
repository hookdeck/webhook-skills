# Webiny Webhooks Overview

## What Are Webiny Webhooks?

[Webiny](https://www.webiny.com) is an open-source serverless headless CMS. In Webiny 6.x you register webhooks in the admin: an endpoint URL, the events to subscribe to, and an optional signing secret. When a subscribed event fires, Webiny queues a background task that POSTs a JSON envelope to your URL and signs it with the [Standard Webhooks](https://www.standardwebhooks.com) scheme. The official verifier is `createVerifyWebhookPayload` from `@webiny/sdk/webhooks` ([docs](https://www.webiny.com/docs/reference/sdk/webhooks)).

## Which Events Does Webiny Send?

Webiny does not publish a fixed event list. Events are registered at runtime by the installed Webiny apps (through the `WebhookProvider` in `@webiny/api-core`) and appear in the admin when you create or edit a webhook. No public documentation page names them, so this skill does not hard-code event names: read them from the admin and dispatch on the envelope's `event` string.

| Where it comes from | Example use |
|---------------------|-------------|
| Headless CMS apps (entry lifecycle events) | Rebuild a static site, purge a CDN, sync to search |
| Other installed apps | Whatever the app registers |

## What Does the Payload Look Like?

```json
{
  "id": "6720c1f0e4b0a1d2c3b4a5f6",
  "event": "<event name from the admin list>",
  "timestamp": "2026-10-26T10:00:00.000Z",
  "webhookId": "<webhook id>",
  "deliveryId": "<delivery id>",
  "tenant": "root",
  "data": {}
}
```

| Field | Meaning |
|-------|---------|
| `id` | Background task ID. Also sent as the `webhook-id` header |
| `event` | Event name |
| `timestamp` | When the envelope was built |
| `webhookId` / `deliveryId` | The webhook configuration and this delivery |
| `tenant` | Webiny tenant the event belongs to |
| `data` | The event payload |

Deliveries are `POST` requests with `Content-Type: application/json`.

## How Are Deliveries Retried?

- The sender allows 10 minutes per request.
- Network errors, `429` and `5xx` responses are retried up to 3 times, after 1 s, 2 s and 4 s.
- Any other status ends the attempt, and any HTTP status at all marks the delivery "delivered" in the Webiny log. Returning a `4xx` for a bad signature therefore does not trigger a retry.
- You can resend a delivery from the admin. The `webhook-id` stays the same, so dedupe on it.

These details come from the 6.5.0 sender source (`@webiny/webhooks`), not the public docs.

## Full Reference

See [Webiny's webhook documentation](https://www.webiny.com/docs/reference/sdk/webhooks).
