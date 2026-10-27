# Setting Up Purchasely Webhooks

## Prerequisites

- A Purchasely account with an app configured in the Console
- A public HTTPS endpoint (use `npx hookdeck-cli listen 3000 purchasely --path /webhooks/purchasely` for local development)

## Get Your Webhook Shared Secret

Purchasely signs each delivery with a webhook shared secret and its verification example calls it
`webhookSharedSecret`. The docs don't say where in the Console it is shown, so look in
**[YOUR APP] > Settings > Webhooks** or ask Purchasely support. Store it as `PURCHASELY_WEBHOOK_SECRET`
and use it exactly as shown (UTF-8, no decoding).

## Register Your Endpoint

In the Purchasely Console, open **[YOUR APP] > Settings > Webhooks**:

1. Enter your **Client webhook URL**, the HTTPS endpoint that receives events (for example
   `https://example.com/webhooks/purchasely`).
2. In the **Subscription events** section, toggle the events you want. They are grouped by category
   (activation / plan change, cancellation / refund / pause, billing issue, renewal / recovery,
   transfer, trial / offer, transaction revenue).

Once a URL is configured, Purchasely expects an acknowledgement for every event: answer exactly
`200`. For entitlements (`ACTIVATE` / `DEACTIVATE`), see Purchasely's Backend Entitlements guide.

## Sandbox vs Production

Events carry an `environment` field (`SANDBOX` or `PRODUCTION`). Use it to keep test purchases out
of production data.

## Using Hookdeck

Point the Client webhook URL at your Hookdeck source URL. Hookdeck verifies the signature, retries
delivery to your server and lets you replay events. Replays resend the original headers, so leave the
optional tolerance off.
