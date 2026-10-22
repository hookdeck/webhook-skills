# Toggl Track Webhooks - FastAPI Example

Minimal example of receiving Toggl Track webhooks with `X-Webhook-Signature-256` verification and PING validation, using FastAPI.

## Prerequisites

- Python 3.10+
- A Toggl Track workspace and an API token (profile page) to create a webhook subscription

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `TOGGL_WEBHOOK_SECRET` in `.env` to the `secret` you gave the subscription (or the one Toggl generated when you omitted it).

## Run

```bash
uvicorn main:app --reload
```

Server runs on http://localhost:8000 and accepts `POST /webhooks/toggl`.

## Test

```bash
pytest test_webhook.py -v
```

Tests use the signature test vector from Toggl's docs (secret `PGuRrhCFajIyEvFlreKL`) and generate real HMAC-SHA256 signatures for entity events.

## Receive real webhooks locally

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 toggl --path /webhooks/toggl
```

Create a subscription whose `url_callback` is the tunnel URL (see [references/setup.md](../../references/setup.md)), then ping it:

```bash
curl -u {api_token}:api_token -X POST \
  https://api.track.toggl.com/webhooks/api/v1/ping/{workspace_id}/{subscription_id}
```

**Subscription validation:** a subscription must be validated before it receives real events. This handler validates synchronously by echoing `{"validation_code": "..."}` from the PING. Behind Hookdeck, the response Toggl sees is Hookdeck's, so validate asynchronously instead: copy the `validation_code` from the PING in the Hookdeck dashboard and call `GET https://api.track.toggl.com/webhooks/api/v1/validate/{workspace_id}/{subscription_id}/{validation_code}`.

## How verification works

Toggl sends `X-Webhook-Signature-256: sha256=<hex>`, the HMAC-SHA256 of the **full unparsed body** keyed with the subscription secret. The handler reads `await request.body()` before parsing. The handler returns `400` for a missing or invalid signature.
