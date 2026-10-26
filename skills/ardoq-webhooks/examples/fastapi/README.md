# Ardoq Webhooks - FastAPI Example

Minimal example of receiving Ardoq webhooks with `X-Ardoq-Signature-256` HMAC-SHA256 verification.

## Prerequisites

- Python 3.10+
- An Ardoq organization with webhooks enabled (Ardoq enables them per organization on request) and an admin account to create the webhook
- The webhook's signing secret (Ardoq shows it only once)

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

3. Add your webhook's signing secret to `.env` as `ARDOQ_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

### Using Hookdeck CLI

```bash
# Forward Ardoq webhooks to your local server (no account needed)
npx hookdeck-cli listen 8000 ardoq --path /webhooks/ardoq
```

Paste the HTTPS URL the CLI prints as the destination URL when you create the webhook in Ardoq (signed webhooks require HTTPS). Then make a small change in Ardoq, such as adding and removing a tag on a component.

### Run Unit Tests

```bash
pytest test_webhook.py -v
```

## Endpoint

- `POST /webhooks/ardoq` — A `verified_body` dependency reads `await request.body()` and verifies `X-Ardoq-Signature-256` (HMAC-SHA256 of `{X-Ardoq-Timestamp}.{raw body}`, hex, `sha256=` prefix) before the handler parses anything, then dispatches on `resource-type` (`component`, `reference`, `tag`).
- `GET /health` — Health check.

## Notes

- **Raw body is required.** Parse JSON only after verification; re-serializing it changes the bytes and breaks the signature.
- **Missing or invalid signature returns 401.** A correctly signed body that is not JSON returns 400.
- **No timestamp window by default.** Hookdeck retries and replays resend the original timestamp. To opt in, set `ARDOQ_WEBHOOK_TOLERANCE_SECONDS` (Unix seconds).
- **Signed webhooks only deliver component, reference and tag changes**, and there are no deletion events.
