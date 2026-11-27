# Setting Up Gemini Webhooks

## Prerequisites

- A Gemini API key from Google AI Studio
- Your application's public webhook endpoint URL

Webhooks are in preview, and the WebhookService API is under `/v1beta/`.

## Static Webhooks (Project-Level)

Static webhooks are configured once at the project level and fire for any matching
event. They use a symmetric HMAC-SHA256 secret returned **only once** at creation.

### 1. Create a Webhook Endpoint

Use the WebhookService API to register an endpoint, through the `google-genai` SDK:

```python
from google import genai

client = genai.Client(http_options={"api_version": "v1beta"})
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
print(webhook.new_signing_secret)  # save this, returned only once
```

Or via REST:

```bash
curl -X POST \
  "https://generativelanguage.googleapis.com/v1beta/webhooks" \
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

Or with Google's `gemini-api` CLI:

```bash
gemini-api webhooks create \
  --name production \
  --uri https://api.example.com/webhooks/gemini \
  --subscribed-events '["batch.succeeded","batch.failed"]'
```

The response contains `new_signing_secret`. **Save it immediately**: it is only
returned on create. Later reads only expose `truncated_secret` and `expire_time` for each
entry in `signing_secrets`. The secret starts with `whsec_`; Google's Java and Go
examples strip that prefix and base64-decode the rest to get the HMAC key.

The API reference lists seven subscribable events: `batch.succeeded`, `batch.expired`,
`batch.failed`, `interaction.requires_action`, `interaction.completed`,
`interaction.failed` and `video.generated`. The guide's event catalog also lists
`batch.cancelled` and `interaction.cancelled`.

Store the secret in your secret manager and expose it to your application as
`GEMINI_WEBHOOK_SECRET`.

### 2. Rotate the Signing Secret

Rotate with `client.webhooks.rotate_signing_secret(id=..., revocation_behavior="revoke_previous_secrets_after_h24")`
or `POST https://generativelanguage.googleapis.com/v1beta/webhooks/{id}:rotateSigningSecret`.
The response's `secret` is the new signing secret, returned only once. Previous secrets
are revoked immediately or after a 24-hour grace period, depending on
`revocation_behavior`. Google's docs don't describe what the `webhook-signature` header
carries during the grace period, so keep the handler accepting a match on any `v1` entry
and switch `GEMINI_WEBHOOK_SECRET` as soon as you rotate.

### 3. List, Get, Update, Ping, Delete

Manage webhooks via `client.webhooks.list / get / update / ping / delete` (or the
matching REST calls on `https://generativelanguage.googleapis.com/v1beta/webhooks`).
`ping` (`POST /v1beta/webhooks/{id}:ping`) sends a ping event to the webhook.

A webhook has a `state`: `enabled`, `disabled`, or `disabled_due_to_failed_deliveries`.
Check it if deliveries stop.

## Dynamic Webhooks (Per-Request)

Dynamic webhooks are passed inline with the request that starts the job and only fire
for that job. They are signed asymmetrically with an RS256 JWT. For the Interactions
API, `background` must be `true` when `webhook_config` is set:

```json
{
  "model": "gemini-4-hydrogen",
  "input": "Tell me a short joke about programming.",
  "background": true,
  "webhook_config": {
    "uris": ["https://api.example.com/webhooks/gemini-dynamic"],
    "user_metadata": {"job_group": "nightly-eval", "priority": "high"}
  }
}
```

Verify dynamic webhooks against Google's JWKS endpoint, which Google's code examples use:

```
https://generativelanguage.googleapis.com/.well-known/jwks.json
```

See [verification.md](verification.md) for the JWT verification flow.

## Testing Your Endpoint

Call `ping` on a static webhook to send it a ping event, or trigger a real delivery by
submitting a small Batch API job or a short video generation request.

For local development, use a tunnel:

```bash
# Hookdeck CLI — no account required
npx hookdeck-cli listen 3000 gemini --path /webhooks/gemini
```

This gives you a public HTTPS URL, request inspection, and replay.

## Production Requirements

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
