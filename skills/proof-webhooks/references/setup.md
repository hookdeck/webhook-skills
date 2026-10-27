# Setting Up Proof Webhooks

## Prerequisites

- A Proof account with Business API access and an API key (or an OAuth client)
- A public HTTPS endpoint, e.g. `https://example.com/webhooks/proof`

## Get Your Signing Secret

Paste the Proof API key that created the webhook, or its signing_key if you set one. Webhooks created with OAuth must set a signing_key.

Store the value as `PROOF_WEBHOOK_SECRET`. In more detail:

- **Created with an API key** (`ApiKey` header): Proof signs every request automatically. The key is
  the API key that created the subscription, unless you passed a custom `signing_key`.
- **Created with OAuth**: requests are **not signed** unless you include a `signing_key` when
  creating or updating the subscription. Once set, signing is enforced and can only be removed by
  deleting and recreating the subscription.

## Register Your Endpoint

Create a subscription with the Webhook API ([Create Webhook V2](https://dev.proof.com/reference/createwebhookv2)).
Each subscription needs a unique URL:

```bash
curl -X POST https://api.proof.com/v2/webhooks \
  -H "ApiKey: $PROOF_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/webhooks/proof",
    "subscriptions": ["transaction.created", "transaction.completed", "transaction.released", "notary.created"],
    "signing_key": "choose-a-long-random-string"
  }'
```

`signing_key` is optional with an API key (the key itself signs) and required with OAuth. Other
useful fields: `headers` (extra headers Proof sends back), `request_id_header_name`, and
`oauth_config` (Proof fetches a bearer token and sends `Authorization: Bearer <token>`). Update,
list and delete subscriptions through the same API (`/v2/webhooks`).

## Test Locally

Sign a request yourself (Proof's Create Webhook Test endpoint is V1-only and deprecated):

```bash
BODY='{"event":"transaction.created","data":{"transaction_id":"ot_XXXXXX","date_occurred":"2025-08-12T17:56:35Z"}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$PROOF_WEBHOOK_SECRET" -hex | sed 's/^.* //')
curl -X POST -H 'Content-Type: application/json' -H "X-Notarize-Signature: $SIG" \
  -d "$BODY" http://localhost:3000/webhooks/proof
```

## Local Development

```bash
npx hookdeck-cli listen 3000 proof --path /webhooks/proof
```

Use the printed URL as the subscription `url`. For FastAPI use port `8000`.
