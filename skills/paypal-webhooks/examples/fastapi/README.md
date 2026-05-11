# PayPal Webhooks — FastAPI Example

FastAPI receiver that verifies PayPal webhooks with RSA-SHA256 against the
public certificate served at `paypal-cert-url` (offline path — no extra API
call back to PayPal).

## Prerequisites

- Python 3.9+
- A PayPal Developer app with a registered webhook — see
  [../../references/setup.md](../../references/setup.md)

## Setup

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Set PAYPAL_WEBHOOK_ID in .env
```

## Run

```bash
uvicorn main:app --reload
```

Webhook endpoint: `POST http://localhost:8000/webhooks/paypal`

## Test

```bash
pytest test_webhook.py
```

The test suite generates a self-signed X.509 certificate and matching RSA
key with `cryptography`, preloads the cert cache with the PEM, then signs
payloads with the private key. No real PayPal API calls are made.

## How Verification Works Here

1. The route reads the raw body with `await request.body()`.
2. The four `paypal-*` headers are extracted.
3. The cert URL host is validated against `.paypal.com`.
4. The cert PEM is fetched via `httpx` and cached.
5. The message `transmissionId|transmissionTime|webhookId|crc32(body)` is
   verified against the cert's public key using PKCS#1 v1.5 padding and
   SHA-256.

See [../../references/verification.md](../../references/verification.md).
