# JazzHR Webhooks - FastAPI Example

Minimal example of receiving JazzHR candidate-export webhooks with signature verification.

## Prerequisites

- Python 3.10+
- A JazzHR account with a custom integration (Settings > Integrations) and its Secret Key

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `JAZZHR_WEBHOOK_SECRET` in `.env` to the Secret Key you entered on the JazzHR custom integration.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Receive webhooks locally

```bash
npx hookdeck-cli listen 8000 jazzhr --path /webhooks/jazzhr
```

Use the URL it prints as the Integration [Webhook] URL in JazzHR. Saving the integration sends a signed `VERIFY` event, which the handler answers with `200`.

## Notes

- The handler reads raw bytes with `await request.body()`, so verification works for any content type.
- `X-JazzHR-Signature` is the bare hex HMAC-SHA256 of the raw body. The event type is in `X-JazzHR-Event` (`CANDIDATE-EXPORT` or `VERIFY`).
- Both sides of `hmac.compare_digest` are bytes, so a non-ASCII header returns 401 rather than 500.

## Test

```bash
pytest test_webhook.py
```
