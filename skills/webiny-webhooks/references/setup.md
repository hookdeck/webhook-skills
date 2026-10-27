# Setting Up Webiny Webhooks

## Prerequisites

- A Webiny 6.x project with the Webhooks feature available in the admin
- A public HTTPS URL for your endpoint (for local development use the Hookdeck CLI below)

## How Do I Choose the Signing Secret?

The secret is **free text that you enter** in the Webiny admin. It is not generated, and it is not a `whsec_` value. Webiny signs each delivery with:

1. the webhook's own signing secret, else
2. the global signing secret in **Webhook settings**, else
3. an empty string.

With no secret at all, Webiny signs with an empty key and deliveries fail verification. Hookdeck's configuration alert for this source reads exactly:

> "Paste the signing secret exactly as entered: the Webiny webhook's own secret (Webiny 6), or the global webhook secret if the webhook has none. With neither set, Webiny signs with an empty key and deliveries fail verification."

So set a secret on the webhook or in Webhook settings, then copy **the same string** into `WEBINY_WEBHOOK_SECRET`. Do not add a `whsec_` prefix and do not base64-encode it.

## How Do I Register an Endpoint?

1. In the Webiny admin, open the webhooks settings and create a new webhook.
2. Enter your endpoint URL, for example `https://your-app.com/webhooks/webiny`.
3. Choose the events to subscribe to from the list the admin shows.
4. Optionally enter a signing secret for this webhook. If you leave it empty, the global secret is used.
5. Save. There is no challenge or handshake step.

Deliveries can be resent from the admin, which is the easiest way to test.

## Local Development

```bash
# Express / Next.js (use 8000 for FastAPI). No install or account required.
npx hookdeck-cli listen 3000 webiny --path /webhooks/webiny
```

Paste the URL the CLI prints into the webhook's endpoint field.

## Environment

```bash
WEBINY_WEBHOOK_SECRET=<secret exactly as entered>
WEBINY_WEBHOOK_TOLERANCE_SECONDS=300   # optional, off by default
```
