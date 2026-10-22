# Setting Up Duffel Webhooks

## Prerequisites

- A Duffel account and an access token (start with a **test mode** token)
- A public HTTPS URL for your receiver (use the Hookdeck CLI locally)

## Create a Webhook and Get Your Secret

Webhooks are created through the API, not the dashboard:

```bash
curl -X POST "https://api.duffel.com/air/webhooks" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -H "Duffel-Version: v2" \
  -H "Authorization: Bearer $DUFFEL_ACCESS_TOKEN" \
  -d '{ "data": { "url": "https://example.com/webhooks/duffel", "events": ["order.created", "order.airline_initiated_change_detected"] } }'
```

The response includes `id`, `live_mode`, `events`, `active`, and `secret` (for example `54vFWvaSbbzYpxXPeB4YEw==`).

**The secret is only returned by this call and can never be shown again.** Store it as `DUFFEL_WEBHOOK_SECRET`. Use it exactly as returned: do not base64-decode it.

## Test vs Live Mode

The access token decides the mode: a test token creates a test webhook (`live_mode: false`), a live token creates a live one. They have separate secrets, so create both and configure each environment with its own secret.

## Send a Test Event

```bash
curl -X POST "https://api.duffel.com/air/webhooks/id/$WEBHOOK_ID/actions/ping" \
  -H "Accept: application/json" -H "Content-Type: application/json" \
  -H "Duffel-Version: v2" -H "Authorization: Bearer $DUFFEL_ACCESS_TOKEN" -d '{}'
```

Your endpoint receives a `ping.triggered` event.

## Local Development

```bash
npx hookdeck-cli listen 3000 duffel --path /webhooks/duffel
```

Use the Hookdeck URL as the webhook `url`. For FastAPI use port `8000`.

## Updating

Use the update-webhook endpoint to change the URL or deactivate the webhook (`active`).
