# Setting Up Returnless Webhooks

## Prerequisites

- A Returnless account with access to the Integrations section of the panel
- A publicly reachable HTTPS endpoint (the certificate is validated). For local work, use the Hookdeck CLI tunnel below.

## Create the Webhook and Get Your Signing Secret

1. Log in to your Returnless panel.
2. Go to **Integrations** and open the **Webhooks** tab.
3. Click **Add endpoint** and fill in:
   - **Is enabled**: turn on to deliver events.
   - **Test mode**: when on, only events from return forms in test mode are sent; when off, only events from live return forms are sent.
   - **Endpoint**: your URL, e.g. `https://example.com/webhooks/returnless`.
   - **Webhook Signing Secret**: the secret used to sign requests. It is unique per webhook; store it securely.
   - **Webhook description**: an internal label.
   - **Events**: the events that should trigger this webhook.
4. Save, then put the signing secret in `RETURNLESS_WEBHOOK_SECRET`.

## Test Mode vs Live Mode

A webhook receives either test-mode or live events, not both. Create one webhook for each (each with its own secret and env var) if you need both.

## Local Development

```bash
npx hookdeck-cli listen 3000 returnless --path /webhooks/returnless
```

Use the URL the CLI prints as the webhook endpoint. For FastAPI use port `8000`.

## Re-enabling a Disabled Webhook

If a webhook was disabled after repeated failures, fix your endpoint, then open Settings -> Integrations -> Webhooks, edit the webhook and set Enabled to true. This resets the failed-events counter.
