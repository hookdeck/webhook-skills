# Setting Up Twenty Webhooks

## Prerequisites

- A Twenty workspace (cloud or self-hosted) where you can open **Settings > Developers**
- A public HTTPS endpoint for your receiver (use the Hookdeck CLI for local development)

## Get Your Signing Secret

> Set a secret on the Twenty webhook (Settings > Developers > Webhooks). Twenty signs deliveries only when the webhook has a secret.

1. In Twenty go to **Settings > Developers > Webhooks**.
2. Create the webhook (or open an existing one) and set its **secret**.
3. Store the same value as `TWENTY_WEBHOOK_SECRET` in your app's environment. It is used as-is, as UTF-8 bytes, for the HMAC key (do not hex- or base64-decode it).

Without a secret Twenty sends deliveries unsigned, and a verifier like the examples will reject them with 401.

## Register Your Endpoint

1. Go to **Settings > Developers > Webhooks**.
2. Click **+ Create webhook**.
3. Enter your webhook URL. It must be publicly accessible (e.g. `https://your-app.example.com/webhooks/twenty`).
4. Click **Save**. The webhook activates immediately.

To change the URL, open the webhook, update it and save; to remove it, open it and delete it.

There is no event selection: every record create, update and delete for every object (custom objects included) is sent, so filter on `eventName` in your handler.

## Local Development

Twenty can't reach `localhost` (unless your Twenty instance runs on the same machine), so tunnel to it with the Hookdeck CLI (no account required):

```bash
# Express or Next.js (port 3000)
npx hookdeck-cli listen 3000 twenty --path /webhooks/twenty

# FastAPI (port 8000)
npx hookdeck-cli listen 8000 twenty --path /webhooks/twenty
```

Paste the public URL the CLI prints into the webhook URL field, then create or edit a record in Twenty to trigger an event.

## Self-Hosted vs Cloud

Webhooks behave the same on Twenty Cloud and self-hosted instances. For self-hosted, make sure the Twenty server can make outbound requests to your endpoint.
