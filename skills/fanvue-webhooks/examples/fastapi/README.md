# Fanvue Webhooks - FastAPI Example

Minimal FastAPI example of receiving Fanvue webhooks with `X-Fanvue-Signature` verification, including the unsigned verification probe and the two-MAC header sent during secret rotation.

## Prerequisites

- Python 3.10+
- A Fanvue app in the Developer Area and its webhook signing secret (see [setup](../../references/setup.md))

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

3. Add your Fanvue signing secret to `.env` as `FANVUE_WEBHOOK_SECRET`, exactly as Fanvue shows it (keep any `whsec_` prefix).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000.

## Test

### Run unit tests

```bash
pytest test_webhook.py
```

### Forward live events with the Hookdeck CLI

```bash
# No account required — first run prints a public URL
npx hookdeck-cli listen 8000 fanvue --path /webhooks/fanvue
```

Use the printed URL as the endpoint on your app's **Events** tab, then click **Test** on the row. A test delivery carries a real signature, so a `200` proves the check end to end.

## Endpoint

- `POST /webhooks/fanvue` — answers the `fanvue.webhook.verification` probe, verifies `X-Fanvue-Signature` (401 on failure), and routes on the body's `type`.
- `GET /health` — liveness probe.
