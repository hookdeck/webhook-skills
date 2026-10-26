# Setting Up Ampersand Webhooks

## Prerequisites

- An Ampersand account and project
- A public HTTPS URL for your handler (use `npx hookdeck-cli listen` during development)

## Get Your Signing Secret

1. Log in to the [Ampersand dashboard](https://dashboard.withampersand.com) and open **Destinations**.
2. Click the webhook destination.
3. Click **"Click here to view the secret"**. The Webhook Signing Secret starts with `whsec_`.
4. Store it as `AMPERSAND_WEBHOOK_SECRET`.

Every destination has its own secret. To rotate it, open the destination, view the secret and click
**"Rotate secret"**.

## Register Your Endpoint

1. In **Destinations**, create a destination of type webhook (for example `defaultWebhook`) with your URL,
   e.g. `https://example.com/webhooks/ampersand`.
2. Reference the destination by name in `amp.yaml`, on the read or subscribe action that should deliver
   to it (`destination: defaultWebhook`).
3. For notifications, open the [Notifications](https://docs.ampersand.ai/notifications) settings in the
   dashboard (or use the API) and route the event types you want to that destination:
   - `installation.created`, `installation.updated`, `installation.deleted`
   - `connection.created`, `connection.error`
   - `read.backfill.done`, `read.backfill.error`, `read.triggered.error`
   - `write.async.done`
   - `destination.webhook.disabled`

## Test Mode vs Live Mode

Dev and prod are separate Ampersand projects, each with its own destinations and signing secrets. Use
the matching secret per environment. [play.svix.com](https://play.svix.com) gives you a disposable
endpoint to look at payloads before your handler exists.
