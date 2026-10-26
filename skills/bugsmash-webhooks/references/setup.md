# Setting Up BugSmash Webhooks

## Prerequisites

- A BugSmash account with an API key (sent as the `X-API-Key` header)
- A public HTTPS URL for your handler (use the Hookdeck CLI while developing, below)

## Create the Webhook (API only)

BugSmash workspace webhooks are created through API v2:

```bash
curl --location 'https://api.bugsmash.io/api/v2/webhook' \
  --header 'X-API-Key: YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
    "events": ["new_comment", "comment_replied", "status_changed", "comment_updated"],
    "webhookUrl": "https://example.com/webhooks/bugsmash"
  }'
```

`events` must be a subset of `new_comment`, `comment_replied`, `status_changed`, `comment_updated`.

## Get Your Signing Secret

The response contains `secret_key` (for example `bgsmsh_...`). It is shown **only once**:

> BugSmash returns the secret_key only once, when you create the webhook through the API. Paste the whole value, including the bgsmsh_ prefix.

If you lose it, delete and recreate the webhook. Store the whole value, `bgsmsh_` prefix included,
as `BUGSMASH_WEBHOOK_SECRET`. It is the HMAC key as-is: don't strip the prefix and don't base64- or hex-decode it.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 bugsmash --path /webhooks/bugsmash
```

Use port `8000` for the FastAPI example. Pass the printed URL as `webhookUrl` when you create the webhook.
Then `POST /webhook/test` ("fire a test event") sends a signed sample delivery.

## Using Hookdeck as the Source

In Hookdeck choose the **BugSmash** source type and paste the whole `secret_key`, including the
`bgsmsh_` prefix. Hookdeck verifies `X-BugSmash-Signature` against `{X-Webhook-Timestamp}.{body}`.

Hookdeck's BugSmash source pre-selects POST without managing the method (you can change it), and
BugSmash's docs don't name the method it uses. If deliveries arrive with another method, allow that
method on the source too. Hookdeck applies no timestamp window, so retries and replays still verify.

## Test Mode vs Live Mode

None documented. Use the test-event endpoint to exercise your handler.
