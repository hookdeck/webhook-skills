# Mailgun Webhooks - FastAPI Example

Minimal example of receiving Mailgun webhooks in a FastAPI app with HMAC-SHA256 signature verification.

## Prerequisites

- Python 3.9+
- Mailgun account with HTTP Webhook Signing Key

## Setup

1. Create a virtualenv and install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `MAILGUN_WEBHOOK_SIGNING_KEY` to the HTTP webhook signing key from your Mailgun dashboard (**Sending → API Keys**).

## Run

```bash
python main.py
# or
uvicorn main:app --reload --port 3000
```

Webhook endpoint: `POST http://localhost:3000/webhooks/mailgun`.

## Test

```bash
pytest test_webhook.py -v
```

The tests generate Mailgun-style signatures (HMAC-SHA256 over `timestamp + token`) and exercise valid, invalid, tampered, and missing-signature cases plus every common event type.

## How It Works

Mailgun delivers the signature inside the request **body** as a `signature` object:

```json
{
  "signature": {
    "timestamp": "1529006854",
    "token": "...50 chars...",
    "signature": "...hex digest..."
  },
  "event-data": { "event": "delivered", "recipient": "alice@example.com" }
}
```

`main.py`:

1. Parses the JSON body.
2. Reads `body["signature"]`.
3. Computes `hmac.new(key, timestamp + token, sha256).hexdigest()` and compares with `hmac.compare_digest`.
4. Dispatches on `body["event-data"]["event"]`.
