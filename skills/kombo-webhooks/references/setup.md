# Setting Up Kombo Webhooks

## Prerequisites

- Kombo account with dashboard access
- A publicly reachable HTTPS endpoint (use a tunnel for local development)

## Get Your Webhook Secret

1. Open the Kombo dashboard, [Configuration > Webhooks](https://app.kombo.dev/configuration/webhooks)
2. Create your first webhook. Kombo then generates a random **Kombo Webhook Secret** and shows it
3. Store it as `KOMBO_WEBHOOK_SECRET`

The secret is per Kombo environment (for example production vs development), so use the one that matches the environment sending the webhook.

## Register Your Endpoint

1. In the Webhooks tab, add your endpoint URL (for example `https://example.com/webhooks/kombo`)
2. Recommended events: `data-changed`, `integration-created`, `integration-deleted`, `integration-state-changed`, `issue-status-changed`
3. `sync-finished` is deprecated; don't use it in new setups

## Test Your Endpoint

Each webhook in the dashboard list has a button to send a test request. It carries dummy data in the correct schema and a valid signature. Be careful in production: it sends invalid data to your webhook.

For local development:

```bash
npx hookdeck-cli listen 3000 kombo --path /webhooks/kombo
```

## Delivery Behavior

- Respond with a 2xx quickly and process asynchronously if needed
- Kombo retries up to 5 times with exponential backoff (1s, 2s, 4s, 8s, 16s) on 429, 5xx, and connection errors. It honors `Retry-After`
- Other 4xx responses are **not** retried
- If the endpoint returns 404 or 410 for more than 7 days, Kombo disables the webhook automatically; re-enable it in the dashboard
- Webhooks can be delivered more than once, so make handlers idempotent (use the event `id`)
