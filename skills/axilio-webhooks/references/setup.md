# Setting Up Axilio Webhooks

## Prerequisites

- An Axilio organization with access to **Settings > Webhooks** in the [dashboard](https://app.axilio.ai)
- A public `https://` URL for your endpoint (use `npx hookdeck-cli listen` locally, see below)

## How Do I Get My Axilio Signing Secret?

Each destination has its own signing secret. It starts with `whsec_` and is **shown once**, when you register the destination, so copy it straight into `AXILIO_WEBHOOK_SECRET`. Use the full `whsec_...` value; the Standard Webhooks library strips the prefix and base64-decodes the rest.

## Register Your Endpoint

1. Open **Settings** > **Webhooks** in the dashboard.
2. Click **Register Destination** and enter a public `https://` URL.
3. Choose the event types to receive, or subscribe to all of them. Subscribe narrowly: an endpoint that only handles `run.failed` should not receive `session.started`.
4. Copy the signing secret.

Event types are grouped by area: runs, sessions, billing, files and phones.

## How Do I Test an Axilio Webhook?

On a destination's page, click **Test** and pick an event type. Axilio delivers that type's example payload to that destination only, with `"test": true`. Every documented event type can be tested this way before the real event fires. The docs describe no challenge or handshake when you register a destination.

## Local Development

```bash
# Express / Next.js
npx hookdeck-cli listen 3000 axilio --path /webhooks/axilio

# FastAPI
npx hookdeck-cli listen 8000 axilio --path /webhooks/axilio
```

Register the printed URL as the destination, send a **Test**, and check the delivery log in the dashboard.

## Handler Requirements

- Verify the signature against the raw body, then parse it.
- Return a `2xx` as soon as the event is stored or queued. Anything else is retried (30 s, 2 min, 5 min, 15 min, 1 h).
- Dedupe on the event `id`.
