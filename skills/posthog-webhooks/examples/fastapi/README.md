# PostHog Webhooks - FastAPI Example

Minimal example of receiving PostHog webhook destination requests with Standard Webhooks signature verification.

## Prerequisites

- Python 3.9+
- A PostHog Webhook destination (Data pipeline → Destinations → HTTP Webhook) with a **Signing secret**

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Generate a secret and put the **same string** in `.env` and in the PostHog destination's "Signing secret" input:
   ```bash
   echo "whsec_$(openssl rand -base64 32)"
   ```

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

To receive real PostHog requests locally:

```bash
npx hookdeck-cli listen 8000 posthog --path /webhooks/posthog
```

Use the Hookdeck URL as the PostHog destination URL. Hookdeck retries and replays resend the original `webhook-timestamp`, so the `standardwebhooks` library (fixed 5-minute window) rejects late retries. See `../../references/verification.md` for a verifier with a configurable window.
