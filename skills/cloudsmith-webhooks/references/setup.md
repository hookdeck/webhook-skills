# Setting Up Cloudsmith Webhooks

## Prerequisites

- A Cloudsmith repository you can administer
- A public HTTPS URL for your endpoint (for local development, use the Hookdeck CLI below)

## Set an HMAC Signature Key

Set an HMAC signature key on the Cloudsmith webhook. Without one, deliveries are unsigned and fail verification.

The signature key is the HMAC key. Cloudsmith lets you provide or note it at creation; it can be replaced later but not read back, so store it right away as `CLOUDSMITH_WEBHOOK_SECRET`. Use the string exactly as shown (UTF-8, not decoded).

## How Do I Get a Public URL for Local Development?

```bash
npx hookdeck-cli listen 3000 cloudsmith --path /webhooks/cloudsmith
```

Use `8000` instead of `3000` for the FastAPI example. The CLI prints a public URL that forwards to `http://localhost:3000/webhooks/cloudsmith`. No account is required.

## How Do I Register a Webhook?

1. Open the repository in Cloudsmith and go to its **Webhooks** settings.
2. Add a webhook with your endpoint as the payload URL.
3. Enter an **HMAC Signature Key** (see above).
4. Choose the events to receive (`package.created`, `package.synced`, `package.security_scanned`, ...).
5. Leave the payload format on **JSON Object** (the default), which the examples parse.
6. Save, then send a `ping` from the webhook's page.

## Optional: Secret Header

You can also set a **Secret Header** and **Secret Value**, which Cloudsmith sends with every delivery. That is a plain shared value, not a signature; use the HMAC signature key for verification.

## Test Mode

Cloudsmith has no separate test mode; use the `ping` event to check connectivity and signing.
