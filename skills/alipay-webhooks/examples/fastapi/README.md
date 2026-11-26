# Alipay Webhooks - FastAPI Example

Minimal example of receiving Alipay (Antom) webhooks with FastAPI,
including RSA256 signature verification and the fixed acknowledgement
response Antom expects.

## Prerequisites

- Python 3.9+
- An Antom account with a Client ID and the Antom public key (see [../../references/setup.md](../../references/setup.md))

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

3. Fill in `.env`:
   - `ALIPAY_CLIENT_ID` — your Client ID
   - `ALIPAY_PUBLIC_KEY` — Antom public key (verifies inbound notifications)

   Store PEM values on one line with literal `\n` between lines.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Webhook endpoint: `POST http://localhost:8000/webhooks/alipay`

## Test locally

```bash
npx hookdeck-cli listen 8000 alipay --path /webhooks/alipay
```

Use the printed URL as your `paymentNotifyUrl` when creating a sandbox payment.

## Run the tests

```bash
pytest test_webhook.py
```

The tests use `cryptography` to generate real RSA256 signatures and assert the
handler returns the fixed acknowledgement body.

## How it works

1. `await request.body()` reads the **raw** body — the signature covers those bytes.
2. The `Signature` / `Client-Id` / `Request-Time` headers are parsed; the
   two-line content is verified with Antom's public key (SHA256withRSA; the signature is base64, then URL-encoded).
3. On success the handler reads the type from `notifyType`, `authorizationNotifyType`,
   `disputeNotificationType` or `subscriptionNotificationType` and returns the fixed
   200 `SUCCESS` body (no signature needed) so Antom stops resending.

There is no official Alipay SDK helper for notification verification here, so
verification is done manually with `cryptography` (the standard SHA256withRSA
algorithm). See [../../references/verification.md](../../references/verification.md).
