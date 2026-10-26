# Bindbee Webhooks - FastAPI Example

Minimal example of receiving Bindbee webhooks (version 2, Standard Webhooks headers) with signature verification.

> Hookdeck's configuration alert for this source: "Paste the security signature secret as-is. Only version 2 webhooks are supported; version 1 webhooks lack the webhook-* headers and fail verification."

## Prerequisites

- Python 3.10+
- A Bindbee account with a version 2 webhook and the security signature secret from the Webhooks page

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

3. Add the security signature secret to `.env` as `BINDBEE_WEBHOOK_SECRET`, exactly as shown (no `whsec_` prefix added). Optionally set `BINDBEE_WEBHOOK_TOLERANCE_SECONDS` to reject old deliveries; it is off by default.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

To receive real events locally, run the Hookdeck CLI in another terminal and use the URL it prints as the webhook URL in Bindbee:

```bash
npx hookdeck-cli listen 8000 bindbee --path /webhooks/bindbee
```

Verification is done by hand in `main.py` (the secret is used as raw UTF-8 bytes, so the `standardwebhooks` and `svix` libraries would compute the wrong key).
