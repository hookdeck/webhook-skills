# Setting Up Top.gg Webhooks

## Prerequisites

- A Top.gg project (Discord bot or server) you manage
- A public HTTPS URL for your handler (e.g. `https://your-app.com/webhooks/top-gg`)

Only v1 webhooks, whose secret starts with whs_, are supported. Legacy v0 webhooks aren't signed and fail verification.

## Get Your Webhook Secret

1. Open your project's dashboard on Top.gg and go to **Webhooks**.
2. Paste the full URL of your endpoint (for example `https://your.bot/webhooks/votes`) and save.
3. After saving, Top.gg generates a webhook secret prefixed with `whs_`. Copy it and store the whole string, prefix included, as `TOP_GG_WEBHOOK_SECRET`.

Don't confuse this with the legacy v0 setup, where you enter your own shared secret in the bot edit form and Top.gg sends it in the `Authorization` header. That secret doesn't sign anything.

## Send a Test

Send a test from your project's **Webhooks** page. It delivers a `webhook.test` event signed like a real vote, so you can confirm your endpoint and secret before any votes arrive.

## Acknowledge Deliveries

Return a `2xx` within 5 seconds. Timeouts and `5xx` responses are retried (v1: up to 3 times with 2^N second backoff). Do slow work (rewarding the voter) after responding, and deduplicate on `data.id`.

## Using Hookdeck

In Hookdeck, create a source of type **Top.gg**, enter the `whs_` secret when asked, and set the Top.gg webhook URL to the source URL. Hookdeck's source verifies the signature before forwarding to your destination.

## Local Development

```bash
npx hookdeck-cli listen 3000 top-gg --path /webhooks/top-gg
```

Paste the tunnel URL into the project's **Webhooks** page.
