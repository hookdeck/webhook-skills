# Bindbee Webhooks - FastAPI Example

Minimal example of receiving Bindbee webhooks (version 2) with Standard Webhooks signature verification. It verifies by hand rather than with the [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) or [`svix`](https://pypi.org/project/svix/) libraries, because Bindbee's secret is used as raw UTF-8 bytes (the libraries base64-decode it) and because Hookdeck retries and replays keep the original timestamp, so the 5-minute window is opt-in via `BINDBEE_WEBHOOK_TOLERANCE_SECONDS`.

Only version 2 webhooks are supported. Version 1 webhooks lack the `webhook-*` headers and fail verification.

## Prerequisites

- Python 3.10+
- A Bindbee account with a version 2 webhook and the security signature secret from the dashboard's Webhooks page

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

3. Add your security signature secret to `.env` (`BINDBEE_WEBHOOK_SECRET`), exactly as shown on the dashboard (no `whsec_` prefix)

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

## Webhook Endpoint

```
POST http://localhost:8000/webhooks/bindbee
```

The handler reads the body with `await request.body()`, verifies the raw bytes, and only then parses the JSON.

## Local Testing with Hookdeck

```bash
npx hookdeck-cli listen 8000 bindbee --path /webhooks/bindbee
```

Use the printed URL as the webhook URL in the Bindbee dashboard (Webhooks > Add webhook). Bindbee rejects request-inspection hosts such as webhook.site, so a tunnel to your own endpoint is the way to test locally.
