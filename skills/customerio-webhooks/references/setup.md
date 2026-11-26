# Setting Up Customer.io Webhooks

## Prerequisites

- A Customer.io workspace with access to **Data & Integrations**
- Your application's publicly reachable webhook endpoint URL (e.g.
  `https://your-app.com/webhooks/customerio`)

## Create a Reporting Webhook

1. In Customer.io, go to **Data & Integrations → Integrations**.
2. Find and select **Reporting Webhooks** → **Add Reporting Webhook** (or **Edit** an existing one).
3. Enter your **Endpoint URL** (the route your app exposes, e.g. `/webhooks/customerio`).
4. **Select the events you want** — events are **opt-in per subscription**. Toggle the
   `object_type` + `metric` combinations you care about (e.g. Email → `delivered`, `opened`,
   `clicked`, `bounced`; Customer → `unsubscribed`). Nothing is delivered unless enabled.
5. Save the webhook.

## Get Your Signing Key

The **webhook signing key** used to compute `X-CIO-Signature` is shown on the
**Reporting Webhooks** integration page in your account settings (the same screen where you
configure the endpoint and events). Copy it into your app's environment:

```bash
CUSTOMERIO_WEBHOOK_SIGNING_KEY=your_signing_key
```

Keep this value secret — anyone with it can forge valid signatures.

## Verify Your Endpoint Works

- Customer.io sends real events once your webhook is active and matching activity occurs.
  Trigger a test send (e.g. send yourself a campaign/broadcast email and open it) to see
  `email` `sent` / `delivered` / `opened` events arrive.
- Watch your server logs for incoming `POST /webhooks/customerio` requests and confirm the
  signature verifies.

## Local Development

Expose your local server with the Hookdeck CLI (no account required):

```bash
# Express / Next.js (port 3000)
npx hookdeck-cli listen 3000 customerio --path /webhooks/customerio

# FastAPI (port 8000)
npx hookdeck-cli listen 8000 customerio --path /webhooks/customerio
```

The CLI prints a public URL — use it as the **Endpoint URL** in the Reporting Webhook config.

## Retry & Timeout Notes

- Endpoints must return a `2xx` response **within 4 seconds**. Do heavy work asynchronously.
- Failed deliveries are retried with exponential backoff for **7 days**; a persistently failing
  endpoint backlogs later events. Error responses (`400/401/402/403/404/405/410/422/429/500/502/521`)
  put the call in a batch retried after an hour.
