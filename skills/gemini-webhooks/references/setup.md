# Setting Up Gemini Webhooks

## Prerequisites

- A Gemini API key from Google AI Studio (no extra IAM role is required to manage webhooks)
- Your application's public webhook endpoint URL (HTTPS required in production)

## Static Webhooks (Project-Level)

Static webhooks are configured once at the project level and fire for any matching
event. They use a symmetric HMAC-SHA256 secret returned **only once** at creation.

### 1. Create a Webhook Endpoint

Use the WebhookService API to register an endpoint. The cookbook treats the
`google-genai` SDK as the primary path:

```python
from google import genai

client = genai.Client()
webhook = client.webhooks.create(
    name="production",
    uri="https://api.example.com/webhooks/gemini",
    subscribed_events=[
        "batch.succeeded",
        "batch.failed",
        "video.generated",
        "interaction.completed",
        "interaction.requires_action",
    ],
)
print(webhook.new_signing_secret)  # whsec_... — save this, returned only once
```

Or via REST:

```bash
curl -X POST \
  "https://generativelanguage.googleapis.com/v1/webhooks" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "production",
    "uri": "https://api.example.com/webhooks/gemini",
    "subscribed_events": [
      "batch.succeeded",
      "batch.failed",
      "video.generated",
      "interaction.completed",
      "interaction.requires_action"
    ]
  }'
```

The response contains `new_signing_secret` — a `whsec_`-prefixed base64 string. **Save
it immediately**: it is only returned once. Subsequent reads only expose a
`truncated_secret` preview inside `signing_secrets[]`.

```json
{
  "name": "production",
  "uri": "https://api.example.com/webhooks/gemini",
  "subscribed_events": ["batch.succeeded", "..."],
  "new_signing_secret": "whsec_xxxxxxxxxxxxxxxxxxxxxxxx",
  "signing_secrets": [
    { "truncated_secret": "whsec_xxxx…", "create_time": "2026-05-04T12:00:00Z" }
  ]
}
```

Store the secret in your secret manager and expose it to your application as
`GEMINI_WEBHOOK_SECRET`.

### 2. Rotate the Signing Secret

Rotation is supported and Google publishes overlapping signatures during the cutover —
the `webhook-signature` header carries `v1,<old> v1,<new>` so both validate
simultaneously until you swap the env var. Consult the latest Gemini cookbook
([quickstarts/Webhooks.ipynb](https://github.com/google-gemini/cookbook/blob/main/quickstarts/Webhooks.ipynb))
for the exact SDK call that re-issues a `new_signing_secret`.

### 3. List, Get, Update, Ping, Delete

Manage webhooks via `client.webhooks.list / get / update / ping / delete` (or the
matching REST verbs on `https://generativelanguage.googleapis.com/v1/webhooks`).

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
npx hookdeck-cli listen 3000 gemini --path /webhooks/gemini
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
