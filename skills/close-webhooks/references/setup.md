# Setting Up Close Webhooks

## Prerequisites

- A Close organization and an API key (Settings > Developer)
- An HTTPS endpoint (use the Hookdeck CLI locally)

## Create a Subscription

Close has no webhook form in the app; you create subscriptions with the API ([Webhook Subscriptions](https://developer.close.com/topics/webhooks/)):

```bash
curl -s https://api.close.com/api/v1/webhook/ \
  -u "$CLOSE_API_KEY:" -H 'Content-Type: application/json' \
  -d '{
    "url": "https://your-app.example.com/webhooks/close",
    "events": [
      { "object_type": "lead", "action": "created" },
      { "object_type": "opportunity", "action": "updated" }
    ]
  }'
```

The response "includes a `signature_key` value that will be used to sign Webhooks for the subscription". Store it in `CLOSE_WEBHOOK_SIGNATURE_KEY` exactly as returned: 64 hex characters, which your handler hex-decodes.

## Test

Close has no test button. Create or update a lead (or whatever your subscription covers) and check that your endpoint returns `2xx` within 15 seconds.

### Local testing with the Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 close --path /webhooks/close
```

Use the printed URL as the subscription's `url`.

## Using Hookdeck

Create a source with the **Close (close.com)** source type and paste the `signature_key` exactly as returned (a 64-character hex string). Hookdeck hex-decodes it and verifies `close-sig-hash` against `close-sig-timestamp` + body. Verification is optional on the source, and Hookdeck applies no timestamp window. Point the subscription's `url` at the source URL.
