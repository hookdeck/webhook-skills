# Setting Up Webiny Webhooks

## Prerequisites

- A Webiny 6.x project with the Webhooks feature available in the admin
- A public HTTPS URL for your endpoint; Webiny's 6.5.2 source rejects plain HTTP and local addresses (for local development use the Hookdeck CLI below)

## How Do I Choose the Signing Secret?

The global secret in **Webhook settings** is **free text that you enter**. A per-webhook secret overrides it: the 6.4.13 webhook form has a Signing Secret field with a generate action that creates a `whsec_` value, and in 6.5.2 it can be set through the GraphQL API. Webiny signs each delivery with:

1. the webhook's own signing secret, else
2. the global signing secret in **Webhook settings**, else
3. an empty string.

With no secret at all, Webiny signs with an empty key and deliveries fail verification. Hookdeck's configuration alert for this source reads exactly:

> "Paste the signing secret exactly as entered: the Webiny webhook's own secret (Webiny 6), or the global webhook secret if the webhook has none. With neither set, Webiny signs with an empty key and deliveries fail verification."

So set a secret on the webhook or in Webhook settings, then copy **the same string** into `WEBINY_WEBHOOK_SECRET`. Do not add a `whsec_` prefix and do not base64-encode it. A generated `whsec_` value is copied as it is too.

## How Do I Register an Endpoint?

1. In the Webiny admin, open the webhooks settings and create a new webhook.
2. Enter your endpoint URL, for example `https://your-app.com/webhooks/webiny`.
3. Choose the events to subscribe to from the list the admin shows.
4. If your version's form has a Signing Secret field, optionally enter or generate one. If it's empty, the global secret is used.
5. Save. There is no challenge or handshake step.

Use **Trigger Test** in the webhook's actions menu to send a `webhook.test` delivery, and resend real deliveries from the webhook's deliveries list.

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
