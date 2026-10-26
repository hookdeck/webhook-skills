# TextUs Webhooks - FastAPI Example

Minimal example of receiving TextUs webhooks with signature verification
(`X-TextUs-Signature`, HMAC-SHA256 hex of the raw body) using Python's built-in
`hmac`/`hashlib`; there is no official TextUs verification SDK.

## Prerequisites

- Python 3.10+
- A TextUs webhook with its secret (`textus-...`)

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

3. Add your TextUs webhook secret (the whole `textus-...` string) to `.env`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook endpoint is `POST http://localhost:8000/webhooks/textus`.

## Test

```bash
pytest test_webhook.py -v
```

The tests generate real signatures with the same algorithm TextUs uses.

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel TextUs deliveries to your local server (no install,
no account required):

```bash
npx hookdeck-cli listen 8000 textus --path /webhooks/textus
```

Use the URL it prints as the webhook `baseUrl` in TextUs.

## Notes

- Both sides of the comparison are encoded to bytes so a non-ASCII header returns `401`, not `500`.
- Invalid or missing signatures return `401`; malformed JSON returns `400`.
