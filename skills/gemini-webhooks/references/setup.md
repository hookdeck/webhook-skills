# Setting Up Gemini Webhooks

## Prerequisites

- A Google AI Studio / Gemini API project with the Generative Language API enabled
- A Gemini API key (or service-account credentials) with permission to manage webhooks
- Your application's public webhook endpoint URL (HTTPS required in production)

## Static Webhooks (Project-Level)

Static webhooks are configured once at the project level and fire for any matching
event. They use a symmetric HMAC-SHA256 secret returned **only once** at creation.

### 1. Create a Webhook Endpoint

Use the WebhookService API to register an endpoint, for example:

```bash
curl -X POST \
  "https://generativelanguage.googleapis.com/v1beta/webhooks" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "production",
    "url": "https://api.example.com/webhooks/gemini",
    "eventTypes": [
      "batch.succeeded",
      "batch.failed",
      "video.generated",
      "interaction.completed",
      "interaction.requires_action"
    ]
  }'
```

The response contains the `signingSecret` — a `whsec_`-prefixed base64 string. **Save
it immediately**: it is only returned once.

```json
{
  "name": "webhooks/abc123",
  "url": "https://api.example.com/webhooks/gemini",
  "signingSecret": "whsec_xxxxxxxxxxxxxxxxxxxxxxxx",
  "eventTypes": ["batch.succeeded", "..."]
}
```

Store the secret in your secret manager and expose it to your application as
`GEMINI_WEBHOOK_SECRET`.

### 2. Rotate the Signing Secret

Call `rotateSigningSecret` on the webhook resource to generate a new secret. The old
secret continues to validate for a short overlap window so you can roll the env var
without downtime.

### 3. List, Update, Delete

Manage webhooks via the standard REST verbs on
`https://generativelanguage.googleapis.com/v1beta/webhooks`.

## Dynamic Webhooks (Per-Request)

Dynamic webhooks are passed inline with the request that starts the LRO and only fire
for that specific job. They are signed asymmetrically with an RS256 JWT.

```json
{
  "contents": [{ "parts": [{ "text": "..." }] }],
  "webhook_config": {
    "url": "https://api.example.com/webhooks/gemini",
    "user_metadata": {
      "user_id": "u_42",
      "job_id": "internal_job_99"
    }
  }
}
```

Verify dynamic webhooks against Google's JWKS endpoint:

```
https://generativelanguage.googleapis.com/.well-known/jwks.json
```

See [verification.md](verification.md) for the JWT verification flow.

## Testing Your Endpoint

You can trigger a real delivery by submitting a tiny Batch API job or a short video
generation request that completes quickly. There is no separate "send test event"
dashboard at launch — webhooks fire when real LROs change state.

For local development, use a tunnel:

```bash
# Hookdeck CLI — no account required
hookdeck listen 3000 --path /webhooks/gemini
```

This gives you a public HTTPS URL, request inspection, and replay.

## Production Requirements

- **HTTPS only** — Google does not deliver to plaintext HTTP
- **Valid TLS certificate** — self-signed certs are rejected
- **Fast response** — return 2xx within seconds; queue heavy work
- **At-least-once delivery** — deduplicate on `webhook-id`
- **24h retries with exponential backoff** — your endpoint must be idempotent

## Webhook Security Checklist

1. **Always verify the signature** before parsing the body
2. **Validate the timestamp** — reject if `webhook-timestamp` is more than 5 minutes off
3. **Use environment variables** for the signing secret — never commit it
4. **Use timing-safe comparison** when comparing signatures
5. **Deduplicate** using `webhook-id`
6. **Use HTTPS** in production
