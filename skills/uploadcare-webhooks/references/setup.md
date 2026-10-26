# Setting Up Uploadcare Webhooks

## Prerequisites

- An Uploadcare project
- A public HTTPS endpoint (for local work, `npx hookdeck-cli listen 3000 uploadcare --path /webhooks/uploadcare`)

> Set a signing_secret on the Uploadcare webhook. Without one, deliveries are unsigned and fail verification.

## Create the Webhook

1. In the Uploadcare dashboard, open your project's **Webhooks** section and add a webhook.
2. Enter the endpoint URL Uploadcare should call.
3. Enter a **signing secret** so requests are signed.
4. Choose the REST API version (v0.7 supports all five events and the richer payload).
5. Select the events to subscribe to: `file.uploaded`, `file.info_updated`, `file.deleted`,
   `file.stored`, `file.infected`.

## Set or Change the Signing Secret via the REST API

Add `signing_secret` when creating or updating a webhook:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Uploadcare.Simple $YOUR_PUBLIC_KEY:$YOUR_SECRET_KEY" \
  -d '{"signing_secret": "some-secret"}' \
  "https://api.uploadcare.com/webhooks/WEBHOOK_ID/"
```

Store the same value on your server as `UPLOADCARE_WEBHOOK_SECRET`. Without a `signing_secret`,
Uploadcare sends no `X-Uc-Signature` header and verification fails.

## Testing

Upload a file to the project (for example from the dashboard) and watch for `file.uploaded` at your
endpoint or in the Hookdeck CLI UI.
