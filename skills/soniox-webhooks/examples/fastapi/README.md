# Soniox Webhooks - FastAPI Example

Minimal example of receiving Soniox async transcription webhooks and authenticating them with the
header you set per transcription (`webhook_auth_header_name` / `webhook_auth_header_value`).

Soniox does not sign payloads, so there is no HMAC to verify. A FastAPI dependency looks up the
configured header (case-insensitive) and compares the whole value with your secret using
`hmac.compare_digest` on bytes, before the body is read.

> Soniox webhooks are not signed. Send webhook_auth_header_name and webhook_auth_header_value with every async transcription, and enter the same name and value here.

A static shared credential authenticates the sender, not the body, and gives no replay protection.
Use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Python 3.9+
- A Soniox account (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Create a virtualenv and install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `SONIOX_WEBHOOK_HEADER` to the `webhook_auth_header_name` you use, and
   `SONIOX_WEBHOOK_SECRET` to the exact `webhook_auth_header_value` (including any `Bearer `).

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/soniox`.

## Test

```bash
pytest test_webhook.py
```

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/soniox \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-token" \
  -d '{"id":"548d023b-2b3d-4dc2-a3ef-cca26d05fd9a","status":"completed"}'
```

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 8000 soniox --path /webhooks/soniox
```

Use the printed URL as `webhook_url` when creating a transcription.

## How It Works

- `main.py`: `verify_soniox_request()`, the `require_soniox_auth` dependency and the route

1. The dependency checks the configured header before the body is read. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on `status`: `completed` or `error`.
4. It returns `200 {"received": true}`.
