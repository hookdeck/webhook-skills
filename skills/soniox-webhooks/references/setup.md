# Setting Up Soniox Webhooks

## Prerequisites

- A Soniox account and API key
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 soniox --path /webhooks/soniox` locally)

## Choose a Header and Secret

Soniox has no dashboard setting for webhooks and no signing secret. You pick a header name and a
secret value yourself:

```bash
SONIOX_WEBHOOK_HEADER=Authorization
SONIOX_WEBHOOK_SECRET="Bearer your-secret-token"
```

The secret must be the exact, whole header value you send to Soniox (including any `Bearer `
prefix you typed). Generate a long random string for the token.

> Soniox webhooks are not signed. Send webhook_auth_header_name and webhook_auth_header_value with every async transcription, and enter the same name and value here.

## Create a Transcription with a Webhook

Pass `webhook_url` and the two header fields when you create the transcription. Check the
[Soniox create-transcription reference](https://soniox.com/docs/stt/api-reference/transcriptions/create_transcription) (`POST /v1/transcriptions`) for the current request shape;
the webhook fields look like this:

```bash
curl -X POST https://api.soniox.com/v1/transcriptions \
  -H "Authorization: Bearer $SONIOX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "stt-async-preview",
    "audio_url": "https://example.com/audio.mp3",
    "webhook_url": "https://example.com/webhooks/soniox",
    "webhook_auth_header_name": "Authorization",
    "webhook_auth_header_value": "Bearer your-secret-token"
  }'
```

- `webhook_url` - where Soniox POSTs when the transcription finishes
- `webhook_auth_header_name` - the header name to send (here `Authorization`)
- `webhook_auth_header_value` - the value to send (here `Bearer your-secret-token`)

The header is set **per transcription request**, not account-wide. Every async transcription you
create must include the same `webhook_url`, header name and header value, or its webhook will
arrive without the header (or not at all) and your endpoint will answer 401.

## Test

Replay a webhook with curl:

```bash
curl -X POST http://localhost:3000/webhooks/soniox \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-token" \
  -d '{"id":"548d023b-2b3d-4dc2-a3ef-cca26d05fd9a","status":"completed"}'
```

## Fetch the Transcript

On `completed`, call the Soniox API with the `id` from the payload to get the transcript. See the
Soniox async transcription docs for the endpoint.
