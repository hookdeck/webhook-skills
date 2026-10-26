# Setting Up Treet Webhooks

## Prerequisites

- A Treet shop (Treet powers branded resale and trade-in marketplaces)
- A public HTTPS endpoint for your webhook (use the Hookdeck CLI while developing)

## Get Your Secret Key

Treet webhooks aren't configured in a dashboard. Email the Treet team at **support@treet.co**, say you're interested, and tell them the topic (Shipping Label), the trigger (`label/created`, `label/updated`) and your URL. Treet then provides:

1. A **secret key**.
2. An additional `X-Treet-Signature` header on every webhook request, carrying a hashed value of the request data.

Store the key as `TREET_WEBHOOK_SECRET`. Use it as-is (its UTF-8 bytes); don't hex- or base64-decode it.

## Hookdeck Source Note

Hookdeck's Treet source (type `TREET`) shows this note, and it applies here too:

> Signing is opt-in: ask Treet support for a secret key and paste it here. Without one, deliveries are unsigned and fail verification.

Paste the secret key into the source's webhook secret field. Without a secret, no signature header is sent and verification fails.

## HTTP Method

Treet's docs don't name the HTTP method. Hookdeck's Treet source pre-selects POST without managing the method (you can change it). If Treet sends any other method, allow that method on the source too. The examples accept GET, POST, PUT, PATCH and DELETE and verify the signature first for every method.

## Local Development

```bash
npx hookdeck-cli listen 3000 treet --path /webhooks/treet
```

Give the printed URL to Treet support as your webhook URL. No account is required.

## Test Mode vs Live Mode

Treet documents no test mode or test-event button. Ask Treet support to trigger a label event for your shop, or sign a sample payload yourself with the key (see [verification.md](verification.md)).
