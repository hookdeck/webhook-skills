# Setting Up Metronome Webhooks

## Prerequisites

- A Metronome account with permission to manage webhooks
- A public HTTPS endpoint for your handler (for local development, run `npx hookdeck-cli listen 3000 metronome --path /webhooks/metronome`; use port `8000` for FastAPI)

## Get Your Secret Key

Each webhook configured on a Metronome account has its own secret key, set up when you configure the webhook. Store it as `METRONOME_WEBHOOK_SECRET`. It is used as-is: its UTF-8 bytes are the HMAC key (don't hex- or base64-decode it). If you have several webhooks, use the matching secret for each endpoint.

## Register Your Endpoint

Follow the [Metronome webhook guide](https://docs.metronome.com/guides/platform-configuration/setup-webhooks) to add your endpoint URL (for example `https://your-app.example.com/webhooks/metronome`) and choose the notifications to receive. Check the guide for the current location of the setting in the Metronome UI or API, since the menu names change.

## Source IP Allowlist (Optional)

Metronome publishes the IP addresses its webhooks come from and announces changes at least 30 days ahead. If you allowlist them, keep the list in sync with the guide above. Signature verification is the primary check: don't rely on IPs alone. If a gateway such as Hookdeck sits in front of your endpoint, allowlist the gateway's addresses instead.

## Test Your Handler

Trigger an event from your Metronome environment (for example create a contract or fire a threshold notification) and watch the Hookdeck CLI or your logs. Confirm the response is `200`: any status above `299` is retried.

## Responding to Metronome

Return a `2xx` quickly after verifying and recording the event; do slow work asynchronously. Return `401` for a signature failure and `400` for a signed body that isn't valid JSON.
