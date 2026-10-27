# Setting Up Pinata Webhooks

## Prerequisites

- A Pinata account with access to the Pinata App
- A publicly reachable endpoint URL (use the Hookdeck CLI tunnel for local work)

## How Do I Register a Pinata Webhook Endpoint?

1. In the Pinata App, open the **Webhooks** tab and click **Add Endpoint** (top right).
2. On the New Endpoint page, enter the URL of your server endpoint, e.g.
   `https://example.com/webhooks/pinata`.
3. Optionally add a description, choose the events to subscribe to, and set advanced options such
   as rate limiting. The available events are listed in Pinata's
   [event catalog](https://event-types.pinata.cloud/).
4. Click **Create**. You land on the webhook's dashboard, where incoming logs and fired events
   appear.

No endpoint yet? Click the **Svix Play** link under the URL input to create a throwaway test
endpoint. Pinata documents no challenge or validation request, so a freshly registered endpoint
just needs to answer `2xx` to real deliveries. Return `200` for events you don't handle.

## Where Do I Find the Signing Secret?

Open the webhook's dashboard and look at the right sidebar. Click the reveal icon to show the
secret, then copy it. Each endpoint has its own secret. It starts with `whsec_`; store the full
value, prefix included:

```bash
PINATA_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

The examples read it from `PINATA_WEBHOOK_SECRET`, reject values that don't start with `whsec_`
with a `500`, and never accept a request when it is unset.

## How Do I Test It?

Trigger one of the events you subscribed to, either from the Pinata App or from the Pinata API
(for example, upload or delete a file). Then check the webhook's dashboard for the delivery log.
For local development:

```bash
npx hookdeck-cli listen 3000 pinata --path /webhooks/pinata
```

Use the Hookdeck URL as the endpoint URL (use port `8000` for the FastAPI example).

## Watching Deliveries

The webhook's dashboard shows every delivery and its response. Pinata's docs don't state a
timeout, retry schedule or ordering guarantee, so acknowledge quickly, make handlers idempotent,
and deduplicate on the `webhook-id` header (the body has no event id).
