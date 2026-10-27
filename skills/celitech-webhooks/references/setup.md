# Setting Up Celitech Webhooks

## Prerequisites

- A Celitech account with webhooks enabled. Celitech enables webhooks per account on
  request, so ask them first if **Developers → Webhooks** isn't available.
- A publicly reachable **HTTPS** endpoint (use the Hookdeck CLI tunnel for local work)

## How Do I Register a Celitech Webhook Endpoint?

1. In the Celitech dashboard, go to **Developers → Webhooks**.
2. Add an endpoint and enter its URL (HTTPS), e.g. `https://example.com/webhooks/celitech`.
3. Add a description.
4. Select the event types you want (`consumption.threshold.reached`, `esim.downloaded`,
   `esim.installed`, `esim.enabled`, `esim.disabled`, `esim.deleted`).
5. Save. There is no verification challenge.

## Where Do I Find the Signing Secret?

Each endpoint has its own secret, shown under **Developers → Webhooks** for that endpoint
and rotatable there. Celitech's docs don't show the literal value. Svix endpoint secrets
look like `whsec_<base64>`. If yours doesn't start with `whsec_`, confirm the format with
Celitech or a dashboard test event: the `svix` library would base64-decode it, while
Hookdeck (and the manual verifier) use a secret without `whsec_` as its raw UTF-8 bytes.
Store the full value as `CELITECH_WEBHOOK_SECRET`:

```bash
CELITECH_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

## How Do I Test Locally?

```bash
# Express / Next.js
npx hookdeck-cli listen 3000 celitech --path /webhooks/celitech

# FastAPI
npx hookdeck-cli listen 8000 celitech --path /webhooks/celitech
```

Use the printed URL as the endpoint URL in Celitech.

## Endpoint Requirements

- Return `2xx` within about **15 seconds** or the delivery is retried. Acknowledge first,
  then process in a background job.
- Keep the **raw** request body for signature verification.
- Dashboard example events are not retried, so a failed test must be re-sent by hand.
