# Setting Up Nitrosend Webhooks

## Prerequisites

- A Nitrosend account and brand
- Permission to manage API keys (webhooks appear in Settings only for people who can)
- Your application's public HTTPS webhook URL (use the Hookdeck CLI for local development)

## How Do I Register a Webhook Endpoint?

**Dashboard:** open **Settings > Webhooks** ([app.nitrosend.com/my/settings/webhooks](https://app.nitrosend.com/my/settings/webhooks)), choose **New Webhook**, enter the endpoint URL and pick the events it should receive. The dashboard lists the email events only.

**API:** create it with an API key. This is also how you subscribe to account events (`campaign.*`, `flow.paused`, `sending.*`, `import.*`, `domain.*`, `webhook.disabled`):

```bash
curl -X POST https://api.nitrosend.com/v1/my/webhooks \
  -H "Authorization: Bearer $NITROSEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/webhooks/nitrosend",
    "events": ["email.delivered", "email.bounced", "email.complained", "email.failed"]
  }'
```

The URL must use HTTPS, resolve to a public internet address, and carry no credentials. A brand can have up to 10 webhooks. Redirects are not followed. Nitrosend does not send a challenge request when you create an endpoint.

Other calls: `GET /v1/my/webhooks` (list), `PATCH /v1/my/webhooks/{id}` (change URL, events, or turn it on or off), `DELETE /v1/my/webhooks/{id}`, `GET /v1/my/webhooks/{id}/deliveries` (last 7 days of deliveries).

## Where Is My Signing Secret?

Each webhook has its own secret, starting with `whsec_`. The create response includes it in full. Later reads mask it; reveal it again from the dashboard or with `GET /v1/my/webhooks/{id}?reveal=true`. Store the full value, prefix included, in `NITROSEND_WEBHOOK_SECRET`. Keep it out of client-side code and version control.

## How Do I Test an Endpoint?

Choose **Send test event** from the webhook's menu, or call `POST /v1/my/webhooks/{id}/test`. The event goes through the same signed delivery path. It carries `"test": true` in `data` and null ids. The API sends `email.delivered` by default; pass `{"type": "email.received"}` (or any other event) to test that event's shape.

To reach a handler on your machine, start a tunnel and register its URL as a normal endpoint:

```bash
# Express / Next.js (use 8000 for FastAPI). No install or account required.
npx hookdeck-cli listen 3000 nitrosend --path /webhooks/nitrosend
```

Each webhook keeps the last 7 days of deliveries with status, response code and attempt count, in its edit dialog or from the deliveries endpoint.

## What Happens When My Endpoint Is Down?

Return any `2xx` within 10 seconds. Failed attempts are retried after 1 minute, 5 minutes, 30 minutes, 2 hours, 8 hours and 24 hours, then marked failed. When deliveries have failed continuously for 3 days, the next failed attempt turns the endpoint off and emails the account owner (and a `webhook.disabled` event is sent). Events that occur while an endpoint is off are not sent, including after you turn it back on, so reconcile through the API after an outage.
