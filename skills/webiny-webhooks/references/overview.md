# Webiny Webhooks Overview

## What Are Webiny Webhooks?

[Webiny](https://www.webiny.com) is an open-source serverless headless CMS. In Webiny 6.x you register webhooks in the admin: an endpoint URL, the events to subscribe to, and an optional signing secret. When a subscribed event fires, Webiny queues a background task that POSTs a JSON envelope to your URL and signs it with the [Standard Webhooks](https://www.standardwebhooks.com) scheme. The official verifier is `createVerifyWebhookPayload` from `@webiny/sdk/webhooks` ([docs](https://www.webiny.com/docs/reference/sdk/webhooks)).

## Which Events Does Webiny Send?

Webiny's docs list no events. The installed Webiny apps register them at runtime (through the `WebhookProvider` in `@webiny/api-core`), and the admin shows the full set for your install. In the 6.5.2 source:

| App | Event names | `data` |
|-----|-------------|--------|
| Headless CMS | `cms.entry.{modelId}.{action}` for each content model; actions `created`, `updated`, `deleted` (permanent deletes only), `published`, `unpublished`, `trashed`, `restored` | `{ entry }` |
| Website Builder | `wb.page.created`, `wb.page.updated`, `wb.page.published`, `wb.page.unpublished`, `wb.page.deleted`, `wb.page.trashed`, `wb.page.restored` | `{ page }`, plus `original` on update |
| Website Builder | `wb.redirect.created`, `wb.redirect.updated`, `wb.redirect.deleted` | `{ redirect }`, plus `original` on update |
| Admin Trigger Test | `webhook.test` | `{ "test": true }` |

Extensions can register more, so dispatch on the envelope's `event` string.

## What Does the Payload Look Like?

```json
{
  "id": "<task id>",
  "event": "<event name from the admin list>",
  "timestamp": "<ISO 8601 send time>",
  "webhookId": "<webhook id>",
  "deliveryId": "<delivery id>",
  "tenant": "<tenant id>",
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
- Redirects are not followed, and the endpoint must be HTTPS.
- Retries happen inside one background task and repeat `webhook-id`. A resend from the admin starts a new task, so it arrives with a new `webhook-id`, `deliveryId`, `timestamp` and signature. Dedupe retries on `webhook-id`, and make the work itself safe to repeat.

These details come from the 6.5.2 sender source (`@webiny/webhooks`), not the public docs.

## Full Reference

See [Webiny's webhook documentation](https://www.webiny.com/docs/reference/sdk/webhooks).
