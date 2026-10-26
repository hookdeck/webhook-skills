# 1Password Device Trust (Kolide) Webhooks - FastAPI Example

Minimal example of receiving 1Password Device Trust (Kolide) webhooks with `Authorization` signature verification.

## Prerequisites

- Python 3.9+
- 1Password Device Trust account with Full Access, to register a webhook endpoint and reveal its signing secret

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the endpoint's signing secret to `.env` (`KOLIDE_WEBHOOK_SECRET`). Find it under Settings > Developers > Webhooks > your endpoint > Reveal Secret. It is used as-is, as UTF-8 bytes.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000

The handler reads the raw body with `await request.body()` and checks the `Authorization` header, which holds the bare hex HMAC-SHA256 of the raw body (no `Bearer`, no prefix, no timestamp). A missing or invalid signature returns 401. After the check it parses the JSON and dispatches on the top-level `event` field (for example `devices.created`, `issues.new`, `device_trust.status_changed`).

## Test

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 kolide --path /webhooks/kolide
```

Register the Hookdeck URL as the endpoint URL under Settings > Developers > Webhooks, then use the webhook's test event (`webhook.test`) to confirm delivery.
