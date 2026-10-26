# Setting Up folk Webhooks

## Prerequisites

- A folk workspace with access to the API settings page, or a folk API key to use the API
- A public HTTPS URL for your webhook endpoint (for local development, use the Hookdeck CLI below)

## How Do I Create a folk Webhook in the Dashboard?

1. Go to your workspace **API settings** page and create a new webhook.
2. Fill in:
   - **Name**: any name
   - **URL**: your endpoint, for example `https://your-app.com/webhooks/folk`
   - **Events**: the events to subscribe to, for example `person.created`
3. Click **Create webhook**.

Subscribe only to the events you handle, to limit HTTP requests to your server.

## How Do I Create a folk Webhook With the API?

```bash
curl -X POST "https://api.folk.app/v1/webhooks" \
  -H "Authorization: Bearer $FOLK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "My webhook",
       "targetUrl": "https://your-app.com/webhooks/folk",
       "subscribedEvents": [{"eventType": "person.created"}]}'
```

`subscribedEvents` can also carry filters, which differ by event type. See the create and update webhook API references.

## Where Do I Get the folk Webhook Signing Secret?

folk generates a new signing secret for every webhook. **It is only visible once, at webhook creation.** If you lose it, you must create a new webhook. Store the full value, including `whsec_`, as `FOLK_WEBHOOK_SECRET`:

```bash
FOLK_WEBHOOK_SECRET=whsec_QWFSUzl1QUVoQW1kdWtpTnJRTUFpbXNlZmxLTg==
```

Each webhook has its own secret, so a staging webhook's secret won't verify production deliveries.

## Local Development

```bash
npx hookdeck-cli listen 3000 folk --path /webhooks/folk   # Express / Next.js
npx hookdeck-cli listen 8000 folk --path /webhooks/folk   # FastAPI
```

No account required. Create a webhook that targets the printed URL, then create a person in folk to trigger `person.created`. For a quick look at payloads without writing a receiver, folk's guide suggests [Webhook.site](https://webhook.site/) or RequestBin.

## What Happens When My Endpoint Fails?

folk retries for up to a day. If every retry fails, or the error rate is high, it deactivates the webhook and emails you. Fix the handler, then re-activate the webhook. Responding `410 Gone` deactivates it immediately, so don't return it by accident.

## Using Hookdeck in Front of Your Handler

Point the folk webhook at a Hookdeck source URL instead of your server. Hookdeck then handles retries, replay and rate limiting. Replays and retries resend the original timestamp, which matters if your handler uses a library that enforces a 5-minute window. See [verification.md](verification.md).
