# Ordinal Webhooks - FastAPI Example

Minimal example of receiving [Ordinal](https://www.tryordinal.com/) (tryordinal.com)
webhooks in FastAPI, authenticated with a **static custom-header secret** via a FastAPI
dependency.

**Ordinal does not sign webhook deliveries.** There is no signature header, no HMAC, no
signing secret and no timestamp. There is also **no official Ordinal Python SDK** — the
authentication here is a plain `hmac.compare_digest` constant-time comparison (that
function performs the *comparison*, it does not compute an HMAC). The handler **fails
closed** when `ORDINAL_WEBHOOK_SECRET` is unset.

Because nothing is signed over the body, there is **no raw-body requirement** — a Pydantic
body model is safe here. Do not copy the `await request.body()` raw-bytes dance from a
signed provider.

## Prerequisites

- Python 3.9+
- An Ordinal workspace and a workspace API key (Settings → Integrations → API, [app.tryordinal.com/settings/integrations/api](https://app.tryordinal.com/settings/integrations/api)) to register the webhook
- A secret you generate yourself: `openssl rand -hex 32`

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Generate a secret and put it in `.env` as `ORDINAL_WEBHOOK_SECRET`:
   ```bash
   openssl rand -hex 32
   ```

4. Register the webhook with that secret in its `headers`:
   ```bash
   curl -X POST "https://app.tryordinal.com/api/v1/webhooks" \
     -H "Authorization: Bearer $ORDINAL_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"name":"CRM Sync","url":"https://<your-tunnel>/webhooks/ordinal",
          "topics":["post.published","post.publish_failed","post.approval.requested"],
          "headers":{"X-Webhook-Secret":"<the secret from step 3>"}}'
   ```

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000, endpoint `POST /webhooks/ordinal`.

## Test

```bash
pytest test_webhook.py -v
```

Send a delivery by hand:

```bash
curl -X POST http://localhost:8000/webhooks/ordinal \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $ORDINAL_WEBHOOK_SECRET" \
  -d '{"type":"post.published","data":{"post":{"id":"550e8400-e29b-41d4-a716-446655440001","title":"Q4 Product Launch Announcement","channel":"LinkedIn","postUrl":"https://www.linkedin.com/feed/update/urn:li:share:7123456789012345678"}},"createdAt":"2025-02-26T14:30:00.000Z"}'
```

Omit the header and you get `401`. Ordinal documents **no test or `ping` event**, so real
traffic means performing the action in the app.

## Receive webhooks locally

```bash
npx hookdeck-cli listen 8000 ordinal --path /webhooks/ordinal
```

No account required — the CLI creates a guest account on first run and gives you a public
HTTPS URL to use as the webhook's `url`, plus a web UI for inspecting and replaying
requests.
