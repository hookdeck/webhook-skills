# Setting Up Navattic Webhooks

## Prerequisites

- A Navattic workspace with access to Integrations
- A public HTTPS endpoint for your webhook receiver (use the Hookdeck CLI locally)

## Add the Webhook in Navattic

1. In Navattic, open **Integrations** and choose **Webhook**.
2. Enter your endpoint URL (for example `https://example.com/webhooks/navattic`).
3. To authenticate requests, configure an `Authorization` credential on the webhook:
   `Basic <credentials>` or `Bearer <token>`. Navattic sends the header **only when it is
   configured**; without it your endpoint has no authentication at all.
4. Store the full value, scheme prefix included, as `NAVATTIC_AUTHORIZATION`
   (for example `Bearer your-token`).

Navattic's documentation doesn't spell out every dashboard label, so confirm the exact field
names in the Webhook integration screen.

## Hookdeck Source Setup

Hookdeck's Navattic source type is labelled "Navattic". Paste the full Authorization value Navattic sends, including the "Basic " or "Bearer " prefix.

Hookdeck compares the whole `Authorization` header value to the configured key. Don't paste
only the token and don't base64-decode Basic credentials.

Navattic's page doesn't name the HTTP method. Hookdeck's Navattic source pre-selects `POST`
without managing the method, so if Navattic sends anything else (`GET`, `PUT`, `PATCH`,
`DELETE`), also allow that method on the source. The examples accept all five.

## Local Testing

```bash
npx hookdeck-cli listen 3000 navattic --path /webhooks/navattic
```

Use the printed URL as the webhook URL. For FastAPI, use port `8000`.

## Testing

Navattic suggests a free service such as webhook.site to inspect events. It is a public service,
so send test data only: a real event could expose customer data.

## Sending a Manual Test

```bash
curl -X POST http://localhost:3000/webhooks/navattic \
  -H "Content-Type: application/json" \
  -H "Authorization: $NAVATTIC_AUTHORIZATION" \
  -d '{"eventType":"session_closed","timestamp":"2026-07-14T18:32:05.000Z","data":{"session":{"type":"INTERACTIVE_DEMO","mostRecentDemoName":"Acme Product Tour"}}}'
```
