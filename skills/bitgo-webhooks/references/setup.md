# Setting Up BitGo Webhooks

## Prerequisites

- A BitGo developer portal account. It also creates an enterprise in the test environment (`app.bitgo-test.com`), where you can use testnet coins.
- An access token
- A public HTTPS endpoint (use the Hookdeck CLI locally)

## 1. Create the Webhook Secret

Call [Create webhook secret](https://developers.bitgo.com/reference/v2webhooksecretcreate) (`POST /api/v2/webhook/secret`) for your enterprise. Store the returned secret: it signs every notification, and BitGo sends no `X-Signature-SHA256` header until it exists. Calling the endpoint again rotates it, at most once every 5 minutes.

## 2. Add a Webhook

```bash
curl -X POST "https://app.bitgo-test.com/api/v2/$COIN/wallet/$WALLET_ID/webhooks" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "type": "transfer",
    "url": "https://your-app.example.com/webhooks/bitgo",
    "label": "transfers",
    "listenToFailureStates": true
  }'
```

## 3. Configure the Secret

Set `BITGO_WEBHOOK_SECRET` to the secret from step 1.

## Test

Simulate a notification with placeholder data:

```bash
curl -X POST "https://app.bitgo-test.com/api/v2/$COIN/wallet/$WALLET_ID/webhooks/$WEBHOOK_ID/simulate" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{ "usePlaceholderData": true }'
```

Then cross-check the first delivery with the verify endpoint (see [verification.md](verification.md)).

### Local testing with the Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 bitgo --path /webhooks/bitgo
```

Use the printed URL as the webhook `url`.

## Using Hookdeck

Create a source with the **BitGo** source type and paste the webhook secret as-is. Hookdeck verifies `X-Signature-SHA256`. Verification is optional on the source, and Hookdeck applies no timestamp window. Rotating the secret means updating it on the source.
