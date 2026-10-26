# Setting Up Schematic Webhooks

## Prerequisites

- Schematic account with access to the webhooks page
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

## Get Your Webhook Secret

Schematic shows the webhook secret in the dashboard when you create the webhook endpoint. Store it as `SCHEMATIC_WEBHOOK_SECRET`. Use it exactly as shown (UTF-8 text); do not hex- or base64-decode it.

## Register Your Endpoint

1. Open the **Webhooks** page in the Schematic dashboard.
2. Create a webhook endpoint pointing at your URL, e.g. `https://example.com/webhooks/schematic`.
3. Choose the events you want to receive (see [overview.md](overview.md) for all 39).
4. Copy the webhook secret.

Schematic's public documentation does not describe the individual dashboard fields, so check the dashboard UI for the exact labels.

## Local Development

```bash
npx hookdeck-cli listen 3000 schematic --path /webhooks/schematic   # Express, Next.js
npx hookdeck-cli listen 8000 schematic --path /webhooks/schematic   # FastAPI
```

Use the Hookdeck URL as the endpoint URL in Schematic.

## Testing

- Test sends from the dashboard go out once, stay out of the webhook log, and carry no `event_id` or `X-Schematic-Webhook-Id`.
- Exercise deduplication with a real event.
- The webhooks page keeps a log with one row per event and endpoint, showing attempts and status.
