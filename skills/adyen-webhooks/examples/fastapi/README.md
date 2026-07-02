# Adyen Webhooks - FastAPI Example

Minimal example of receiving Adyen **standard notifications** with HMAC signature
verification in FastAPI.

Adyen's official SDK for signature verification is Node.js-only, so this example
implements the HMAC algorithm **manually** in Python — matching Adyen's scheme
exactly (see [../../references/verification.md](../../references/verification.md)).

## Prerequisites

- Python 3.10+
- An Adyen account with a webhook configured and an **HMAC key** generated in the
  Customer Area (see [../../references/setup.md](../../references/setup.md))

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

3. Add your Adyen **HMAC key** (a hex string) to `.env` as `ADYEN_HMAC_KEY`.
   Optionally set `ADYEN_WEBHOOK_USERNAME` / `ADYEN_WEBHOOK_PASSWORD` if you
   configured Basic Auth on the webhook.

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook endpoint is `POST http://localhost:8000/webhooks/adyen`.

## How It Works

1. Adyen POSTs a JSON body containing `notificationItems`.
2. Each item's HMAC signature (`additionalData.hmacSignature`) is verified by
   rebuilding the `:`-delimited signing string, hex-decoding the key, computing
   HMAC-SHA256/base64, and comparing timing-safely. Adyen's HMAC is over
   reconstructed fields, **not** the raw body, so parsing JSON first is correct.
3. Verified events are dispatched by `eventCode` (`AUTHORISATION`, `CAPTURE`,
   `REFUND`, `CANCELLATION`, `CHARGEBACK`, …).
4. The endpoint responds `200` with the literal body **`[accepted]`** — required,
   or Adyen retries.

## Test

```bash
pytest test_webhook.py -v
```

## Receive Webhooks Locally

Use the Hookdeck CLI to tunnel Adyen webhooks to your local server — no account
required:

```bash
npx hookdeck-cli listen 8000 adyen --path /webhooks/adyen
```

Paste the printed URL into your webhook's **URL** field in the Adyen Customer Area,
then use **Test configuration** or create a test payment to trigger a webhook.
