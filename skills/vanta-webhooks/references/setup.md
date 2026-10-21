# Setting Up Vanta Webhooks

## Prerequisites

- A Vanta account with access to **Settings → Webhooks**
- A publicly reachable **HTTPS** endpoint (use the Hookdeck CLI tunnel for local work)

## How Do I Register a Vanta Webhook Endpoint?

1. In the Vanta dashboard, go to **Settings → Webhooks**.
2. Click **Add Endpoint**.
3. Enter your endpoint URL (must be HTTPS), e.g. `https://example.com/webhooks/vanta`.
4. Select the event types you want (for example `v1.questionnaire.status-changed`,
   `v1.vendor.decision.created`, `v1.trust-center.access-request.received`).
   Leave the selection blank to receive **all** events.
5. Click **Create**.

## Where Do I Find the Signing Secret?

Open the endpoint you just created and copy the value in the **Signing Secret**
section. It starts with `whsec_`. Store it as `VANTA_WEBHOOK_SECRET`:

```bash
VANTA_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

Each endpoint has its own secret. If you register several endpoints, each one needs
the matching secret.

## How Do I Test Locally?

Start a tunnel with the Hookdeck CLI (no account required):

```bash
# Express / Next.js
npx hookdeck-cli listen 3000 vanta --path /webhooks/vanta

# FastAPI
npx hookdeck-cli listen 8000 vanta --path /webhooks/vanta
```

Use the printed URL as the endpoint URL in Vanta.

## How Do I Send a Test Event?

1. Go to **Settings → Webhooks** and select your endpoint.
2. Open the **Testing** tab.
3. Choose an event type and click **Send Example**.

Vanta sends a signed example payload, so this checks verification end to end.

## Endpoint Requirements

- Return `2xx` within **15 seconds** or the delivery is retried. Acknowledge first,
  then process in a background job.
- Disable CSRF protection on the webhook route.
- Keep the **raw** request body for signature verification.

## How Do I Recover Missed Events?

In **Settings → Webhooks**, select the endpoint, browse the message history, and click
**Retry** on a message or use **Bulk Retry** for all failed messages in a time range.
