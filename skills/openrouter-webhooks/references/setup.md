# Setting Up OpenRouter Webhooks

OpenRouter sends signed callbacks for two kinds of job: video generation (`POST /api/v1/videos`) and the Batch API (`POST /api/v1/batches`). Both use the same workspace signing secret and the same `X-OpenRouter-Signature` scheme, so one receiver can verify both.

## Prerequisites

- An OpenRouter account and API key (`OPENROUTER_API_KEY`)
- A public HTTPS endpoint for your webhook receiver (use the Hookdeck CLI for local development)
- A video model slug for the job you submit (see OpenRouter's "Choose a Video Generation Model" guide)

## Get Your Signing Secret

1. Open your OpenRouter **workspace settings**.
2. Under **Webhook signing secret**, select **Generate signing secret**. Setting a `callback_url` doesn't create one, and deliveries are unsigned until it exists. Video and batch callbacks share it.
3. Store it as `OPENROUTER_WEBHOOK_SECRET` in your app's environment. It is used as-is, as UTF-8 bytes, for the HMAC key (do not hex- or base64-decode it).

## Register Your Endpoint

OpenRouter has no event subscription list: you give it a URL per job or batch (or a workspace default). For batches, set `callback_url` on `POST /api/v1/batches` (before `requests` in the body) or **Default batch webhook URL** in the workspace settings.

1. Submit the job with a `callback_url`:

   ```bash
   curl https://openrouter.ai/api/v1/videos \
     -H "Authorization: Bearer $OPENROUTER_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "model": "google/veo-3.1-lite",
       "prompt": "A clean product reveal of a matte black desk lamp",
       "duration": 4,
       "callback_url": "https://your-app.example.com/webhooks/openrouter"
     }'
   ```

2. The per-request `callback_url` takes priority over a workspace-level default callback URL.
3. All four terminal states (`completed`, `failed`, `cancelled`, `expired`) are delivered to that URL; filter on `type` in your handler.

> Submitting `POST /api/v1/videos` starts a real job and may spend OpenRouter credits. Test the receiver with a locally signed event first (see `examples/*/README.md`).

## Local Development

OpenRouter can't reach `localhost`, so tunnel to it with the Hookdeck CLI (no account required):

```bash
# Express or Next.js (port 3000)
npx hookdeck-cli listen 3000 openrouter --path /webhooks/openrouter

# FastAPI (port 8000)
npx hookdeck-cli listen 8000 openrouter --path /webhooks/openrouter
```

Use the public URL the CLI prints as the `callback_url`. A temporary Webhook.site URL confirms delivery and headers but does not verify signatures.

## Testing

There is no test mode. Sign a test body yourself with the workspace secret (`t=<unix seconds>,v1=HMAC-SHA256("<t>,<body>")`) and POST it to your receiver; each example README shows a one-liner.
