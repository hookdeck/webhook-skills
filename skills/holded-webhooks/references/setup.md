# Setting Up Holded Webhooks

## Prerequisites

- Holded account with access to Settings > Webhooks
- A publicly accessible HTTPS endpoint (use a Hookdeck URL while developing)

## Register Your Endpoint

1. In Holded, open **Settings > Webhooks**.
2. Enter your endpoint URL (HTTPS, publicly reachable).
3. Choose the events to subscribe to, for example `invoice.create`, `invoice.approve`, `contact.create`, `payment.create`.
4. Save, and copy the webhook secret Holded gives you (it starts with `whsec_`).

Webhooks can also be managed through the API (create, update, enable, disable, list, delete, and list supported event types). See the [Holded API reference](https://www.holded.com/en-us/developers/webhooks).

## Store the Secret

```bash
HOLDED_WEBHOOK_SECRET=whsec_your_holded_webhook_secret
```

Use the **whole string, including `whsec_`**, as the HMAC key. It is not a Standard Webhooks secret: don't strip the prefix, don't base64-decode it, and don't use the `standardwebhooks` or `svix` libraries.

## Using Hookdeck

Create a Hookdeck source for Holded and paste the whole secret, including the `whsec_` prefix. Holded uses it as a plain HMAC key. Then register the source URL as the endpoint in Holded.

For local development:

```bash
npx hookdeck-cli listen 3000 holded --path /webhooks/holded
```

## Receiving the Body

Read the raw body before any JSON parsing. In Express use `express.raw({ type: '*/*' })` so any content type verifies.

## Testing

Create or update an invoice or contact in Holded and check that your endpoint receives `invoice.create` or `contact.create` with a valid signature.
