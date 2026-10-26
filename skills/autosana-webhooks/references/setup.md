# Setting Up Autosana Webhooks

## Prerequisites

- An Autosana account with access to Settings > Integrations
- A public HTTPS endpoint (or a Hookdeck source URL)

## Get Your Signing Secret

You choose the signing secret yourself when you create the webhook (it is optional in Autosana, but you should set it):

1. Go to Settings > Integrations > Webhooks.
2. Click **Add Webhook**.
3. Enter your HTTPS endpoint URL.
4. Enter a signing secret (use a long random string) and store it as `AUTOSANA_WEBHOOK_SECRET`.

**Without a signing secret, deliveries are unsigned** and fail signature verification, including in Hookdeck.

## Register Your Endpoint

Use your server's URL, or the Hookdeck source URL when you route through the Event Gateway. In the Hookdeck dashboard create a source of the Autosana type and paste the **same signing secret** into its verification settings. The sample handlers in `examples/` listen on `/webhooks/autosana`.

If your endpoint sits behind a firewall, allowlist the `flow_runners.virtual_runners.web_browsers` IPs from Autosana's Network Allowlist. Run-result webhooks come from those IPs for every platform, mobile included. The Test button sends from Autosana's API, which is not on that list.

## Test Mode vs Live Mode

Autosana has no separate test environment for webhooks. Use the webhook's Test button, or run a suite and wait for `batch.completed`.

## Local Development

```bash
npx hookdeck-cli listen 3000 autosana --path /webhooks/autosana
```

Use port `8000` for FastAPI. Put the Hookdeck URL in your Autosana webhook.
