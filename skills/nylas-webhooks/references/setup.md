# Setting Up Nylas Webhooks

## Prerequisites

- A [Nylas](https://developer.nylas.com/) account and application (v3).
- Your Nylas **API key** (from the Dashboard) if you create webhooks via the API.
- A publicly reachable HTTPS endpoint (use the [Hookdeck CLI](https://hookdeck.com/docs/cli)
  or a tunnel for local development).

## The Challenge Handshake (required)

Before Nylas activates a webhook — whether you create it in the **Dashboard** or via
`POST /v3/webhooks` — it verifies your endpoint owns the URL:

1. Nylas sends a **GET** request to your webhook URL with a `challenge` query parameter:
   `GET https://your-app.com/webhooks/nylas?challenge=abc123`
2. Your endpoint must respond within **20 seconds** with:
   - HTTP status **200**
   - A body containing **only the exact challenge value** (`abc123`) — plain text, no
     quotes, no JSON, no trailing newline added by your framework.
   - **No chunked transfer encoding.**
3. If the echo is correct, Nylas activates the webhook and returns the **`webhook_secret`**.

If verification fails, fix the endpoint and recreate/re-verify the webhook
(don't count on Nylas retrying the handshake).

```javascript
// Minimal challenge handler (Express)
app.get('/webhooks/nylas', (req, res) => {
  res.status(200).send(req.query.challenge);
});
```

## Create a Webhook in the Dashboard

1. Go to the [Nylas Dashboard](https://dashboard.nylas.com/) → your application → **Notifications** → **Webhooks**.
2. Click **Create Webhook**.
3. Enter your **Webhook URL** (e.g. `https://your-app.com/webhooks/nylas`).
4. Select the **Triggers** you want (e.g. `message.created`, `event.created`, `grant.expired`).
5. Save. Nylas runs the challenge handshake against your URL.
6. On success, **copy the `webhook_secret`** shown — it is displayed once. Store it as
   `NYLAS_WEBHOOK_SECRET`.

## Create a Webhook via the API

```bash
curl -X POST "https://api.us.nylas.com/v3/webhooks" \
  -H "Authorization: Bearer $NYLAS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "trigger_types": ["message.created", "event.created", "grant.expired"],
    "webhook_url": "https://your-app.com/webhooks/nylas",
    "description": "Email + calendar notifications",
    "notification_email_addresses": ["ops@example.com"]
  }'
```

The response includes the `webhook_secret`. Your endpoint must already be serving the
challenge handshake when you make this call, or creation fails.

> Use `https://api.eu.nylas.com` instead if your application is in the EU region.

## Get / Rotate the Secret

- The **`webhook_secret` is returned only on creation** and when you **rotate** it — it is
  unique per destination and is **not** shown again in listings.
- Rotate with the SDK (`nylas.webhooks.rotateSecret(webhookId)`) or
  `POST /v3/webhooks/rotate-secret/{id}`. Nylas stops using the old secret immediately, so
  update `NYLAS_WEBHOOK_SECRET` straight after.

## IP Allowlisting (optional)

The Nylas SDKs have an `ipAddresses()` method (`GET /v3/webhooks/ip-addresses`) for the
source IPs, but the current webhook docs don't describe that endpoint. Treat any allowlist
as a complement to signature verification, never a replacement.

## Environment Variables

```bash
NYLAS_WEBHOOK_SECRET=your_webhook_secret   # returned on webhook creation / secret rotation
# NYLAS_API_KEY=your_api_key               # only needed to create/manage webhooks via the API/SDK
```

## Testing

- Use `npx hookdeck-cli listen 3000 nylas --path /webhooks/nylas` to receive live
  notifications on your local machine.
- Trigger real events (send yourself an email on a connected grant, create a calendar
  event) to see `message.created` / `event.created` fire.
- The bundled example tests generate valid `x-nylas-signature` values locally so you can
  verify handler logic without live traffic.
