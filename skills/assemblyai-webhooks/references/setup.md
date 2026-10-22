# Setting Up AssemblyAI Webhooks

## Prerequisites

- An AssemblyAI account and API key
- A public HTTPS URL for your endpoint. During development, tunnel to localhost:

```bash
npx hookdeck-cli listen 3000 assemblyai --path /webhooks/assemblyai
```

(Use port `8000` for the FastAPI example.)

## 1. Choose an Auth Header

There is no dashboard setting and no signing secret: webhooks are configured per transcript
request. Pick a header name and generate a value:

```bash
openssl rand -hex 32
```

Put both in your app's `.env`:

```bash
ASSEMBLYAI_WEBHOOK_AUTH_HEADER_NAME=X-My-Webhook-Secret
ASSEMBLYAI_WEBHOOK_AUTH_HEADER_VALUE=<the value you generated>
```

## 2. Create a Transcript with a Webhook

Send `webhook_url`, `webhook_auth_header_name` and `webhook_auth_header_value` with
`POST https://api.assemblyai.com/v2/transcript`:

```bash
curl https://api.assemblyai.com/v2/transcript \
  -H "authorization: $ASSEMBLYAI_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "audio_url": "https://assembly.ai/wildfires.mp3",
    "webhook_url": "https://your-app.example.com/webhooks/assemblyai",
    "webhook_auth_header_name": "X-My-Webhook-Secret",
    "webhook_auth_header_value": "<the value you generated>"
  }'
```

The SDKs take the same fields (`webhook_url`, `webhook_auth_header_name`,
`webhook_auth_header_value` in JavaScript; `set_webhook(url, name, value)` in Python).
The URL must be reachable from AssemblyAI's servers.

## 3. Handle the Delivery

When the transcript finishes, AssemblyAI posts `{"transcript_id": "...", "status": "completed"}`
(or `"error"`) with your header attached. Respond with a 2xx within 10 seconds, then fetch the
transcript with `GET /v2/transcript/{transcript_id}`.

## Testing

Submit a short file (such as `https://assembly.ai/wildfires.mp3`) and watch the delivery in the
Hookdeck CLI web UI. Every transcript needs its own webhook fields, so the header is only sent
on requests that set it.

## Optional: Allowlist the Sender IPs

Deliveries come from `44.238.19.20` (US) and `54.220.25.36` (EU). Allowlisting them is an
extra layer, not a replacement for the header check.
