# Setting Up Layerswap Webhooks

## Prerequisites

- A Layerswap Partner Dashboard account with an organization and an app
- A publicly reachable **HTTPS** endpoint (use the Hookdeck CLI tunnel for local work)

## How Do I Register a Layerswap Webhook Endpoint?

Webhooks are configured per app in the Partner Dashboard:

1. Open the [Partner Dashboard](https://layerswap.io/dashboard).
2. Select the organization and app.
3. Open **Webhooks**, add the endpoint URL, and create the webhook.
4. Copy the webhook secret and store it in your server's secret manager.

One or more endpoint URLs can be added per app. No per-event selection, challenge or validation
request is documented, so the endpoint simply receives swap status updates. Return a `2xx` only
after the event is durably accepted, and process slow work asynchronously.

## Where Do I Find the Webhook Secret?

In the Partner Dashboard's Webhooks section for the app. The docs don't print its format, but
Layerswap delivers through Svix, whose secrets start with `whsec_`. Store the full value,
prefix included:

```bash
LAYERSWAP_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

If the value doesn't start with `whsec_`, the examples reject it with a 500 instead of verifying
with the wrong key. Each app has its own secret.

## Testing Locally

```bash
npx hookdeck-cli listen 3000 layerswap --path /webhooks/layerswap
```

Add the tunnel URL as the endpoint in the Partner Dashboard. For FastAPI use port `8000`.
Webhooks arrive as swaps progress, so create a swap with your API key to generate deliveries.

## Verification Behind Hookdeck

If the endpoint URL points at a Hookdeck source, Hookdeck verifies the signature and
forwards to your handler. Retries and replays resend the original `svix-timestamp`; see
[verification.md](verification.md) for how that interacts with the library's 5-minute window.
