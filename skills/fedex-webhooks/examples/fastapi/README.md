# FedEx Webhooks - FastAPI Example

Minimal FastAPI example of receiving [FedEx](https://www.fedex.com) Advanced Integrated Visibility webhooks and verifying the `fdx-signature` HMAC.

## Prerequisites

- Python 3.9+
- A FedEx Developer Portal login and a security token (26-100 characters) (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `FEDEX_WEBHOOK_SECURITY_TOKEN` in `.env` to the security token you set on the webhook.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/fedex` in [main.py](main.py).

## Test

```bash
pytest test_webhook.py -v
```

The tests cover a valid signature, a hex digest (rejected), a second notification, another token, a tampered body, a missing header, a trailing newline in the token, invalid JSON, and a missing token. The test bodies are synthetic stand-ins, not FedEx's schema.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 fedex --path /webhooks/fedex
```

Paste the printed URL and your security token into **Try this webhook** in the FedEx Developer Portal to send a signed mock payload.

## Notes

- The handler reads `await request.body()` before parsing. The HMAC covers the exact raw body, so don't parse and re-serialise it first.
- FedEx treats anything other than `200` or `202` as a failure, including during URL validation.
