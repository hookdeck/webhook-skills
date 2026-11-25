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
5. Choose the event. Each webhook covers one event (`file.uploaded`, `file.info_updated`,
   `file.deleted`, `file.stored` or `file.infected`), so add the same URL once per event you need,
   with the same signing secret on each.

## Set or Change the Signing Secret via the REST API

Send `signing_secret` (up to 32 characters) when creating (`POST /webhooks/`) or updating
(`PUT /webhooks/{id}/`) a webhook. The REST API reference documents both as form-encoded:

```bash
curl -X PUT \
  -H "Accept: application/vnd.uploadcare-v0.7+json" \
  -H "Authorization: Uploadcare.Simple $YOUR_PUBLIC_KEY:$YOUR_SECRET_KEY" \
  -d "signing_secret=some-secret" \
  "https://api.uploadcare.com/webhooks/WEBHOOK_ID/"
```

The Uploadcare CLI does the same with `uploadcare webhook update WEBHOOK_ID --signing-secret some-secret`.

Store the same value on your server as `UPLOADCARE_WEBHOOK_SECRET`. Without a `signing_secret`,
Uploadcare sends no `X-Uc-Signature` header and verification fails.

## Testing

Upload a file to the project (for example from the dashboard) and watch for `file.uploaded` at your
endpoint or in the Hookdeck CLI UI.
