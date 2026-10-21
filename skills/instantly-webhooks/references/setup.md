# Setting Up Instantly Webhooks

## Prerequisites

- An Instantly workspace on the **Hyper Growth plan or above**
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI locally, below)
- For the API route: an API v2 key with `webhooks:create` (or `webhooks:all`)

## Choose Your Authentication Header

Instantly doesn't sign payloads, so you create the credential yourself.
Generate a long random value:

```bash
openssl rand -hex 32
```

Then pick one of:

| Option | Header in Instantly | `.env` |
|--------|--------------------|--------|
| Basic Auth | `Authorization: Basic <base64(user:pass)>` | `INSTANTLY_WEBHOOK_HEADER=Authorization`, `INSTANTLY_WEBHOOK_SECRET=Basic <base64>` |
| Custom secret header | `X-Instantly-Secret: <random>` | `INSTANTLY_WEBHOOK_HEADER=X-Instantly-Secret`, `INSTANTLY_WEBHOOK_SECRET=<random>` |

`INSTANTLY_WEBHOOK_SECRET` is the **exact** header value Instantly sends,
including any `Basic ` prefix. To build a Basic value:

```bash
printf 'instantly:%s' "$(openssl rand -hex 24)" | base64
```

## Register Your Endpoint (UI)

1. Open **Integrations** → **Webhooks**.
2. Click **Add Webhook**.
3. Enter the **Webhook URL** (e.g. `https://your-app.com/webhooks/instantly`).
4. Select **All events** or a specific event type.
5. Select **All campaigns** or a specific campaign.
6. Under **Add headers (optional)**, add your header name and value.
7. Click **Add Webhook**. You can edit it later.

## Register Your Endpoint (API v2)

```bash
curl -X POST https://api.instantly.ai/api/v2/webhooks \
  -H "Authorization: Bearer $INSTANTLY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My app",
    "target_hook_url": "https://your-app.com/webhooks/instantly",
    "event_type": "all_events",
    "headers": { "X-Instantly-Secret": "your-random-secret" }
  }'
```

- `event_type`: one value from the enum (e.g. `reply_received`), or
  `all_events` (includes custom labels). Use `null` plus
  `custom_interest_value` for a single custom label.
- `campaign`: a campaign UUID, or omit / `null` for all campaigns.
- `headers`: key/value pairs Instantly adds to every delivery.

Update headers later with `PATCH /api/v2/webhooks/{id}`.

## Test Your Endpoint

- `POST /api/v2/webhooks/{id}/test` sends a test payload and returns
  `success`, `status_code` and the response time.
- The help center links a request-bin page for checking test URLs.
- Delivery history: **Webhook Activity Monitoring** in the UI, or
  `GET /api/v2/webhook-events` (each record has `success`, `status_code`,
  `retry_count`, `will_retry`, `timestamp_next_retry`).

## Local Development

```bash
npx hookdeck-cli listen 3000 instantly --path /webhooks/instantly
```

Use port `8000` for the FastAPI example. Paste the printed HTTPS URL into the
Webhook URL field, add the same header you put in `.env`, and trigger an event
(or call the test endpoint).

## Retries and Disabled Webhooks

Instantly retries failed deliveries. After repeated failures it disables the
webhook (`status: -1`, with `timestamp_error` set). Fix the endpoint, then
resume it with `POST /api/v2/webhooks/{id}/resume` or from the UI. Return
`2xx` quickly and do slow work asynchronously.
