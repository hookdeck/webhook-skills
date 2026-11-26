# Gusto Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Gusto Embedded Payroll](https://docs.gusto.com/embedded-payroll/docs/webhooks) webhooks and verifying the `X-Gusto-Signature` HMAC (and acknowledging the `verification_token` request).

## Prerequisites

- Python 3.9+
- A Gusto Developer Portal application and a webhook subscription (see [setup](../../references/setup.md))

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

3. Leave `GUSTO_VERIFICATION_TOKEN` empty in `.env` until Gusto sends the token, call `PUT /v1/webhook_subscriptions/{uuid}/verify` with it, then set it.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/gusto` in [main.py](main.py).

## Test

```bash
pytest test_webhook.py -v
```

The tests cover a bare hex digest, base64 and `sha256=` forms (rejected), a valid signature, the token handshake before and after the token is configured (logged only before), an unsigned event that also has a token field, another token, a tampered body, a missing header, a trailing newline in the token, invalid JSON, and a missing token.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 gusto --path /webhooks/gusto
```

Create a subscription with the printed URL. The example prints the `verification_token` when it arrives; verify the subscription with it and set `GUSTO_VERIFICATION_TOKEN`.

## Notes

- The handler reads `await request.body()` before parsing. The HMAC covers the exact raw body, so don't parse and re-serialise it first.
- The `verification_token` request is acknowledged without a signature check and has no side effects. The token is logged only while `GUSTO_VERIFICATION_TOKEN` is unset.
