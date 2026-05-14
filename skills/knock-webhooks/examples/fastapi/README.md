# Knock Webhooks - FastAPI Example

Minimal example of receiving Knock outbound webhooks with `x-knock-signature` verification.

## Prerequisites

- Python 3.9+
- A Knock webhook endpoint with its per-endpoint signing secret (Developers → Webhooks → endpoint detail)

## Setup

1. Create virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Add your Knock webhook signing secret to `.env`.

## Run

```bash
python main.py
```

Or with uvicorn directly:

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000.

## Test

### Run unit tests

```bash
pytest test_webhook.py -v
```

### Forward live events with the Hookdeck CLI

```bash
# No account required — first run prints a public URL
npx hookdeck-cli listen 8000 knock --path /webhooks/knock
```

Use the printed URL as the destination when creating your Knock webhook endpoint, then trigger a workflow (or click **Send test event** in the Knock dashboard).

## Endpoint

- `POST /webhooks/knock` — verifies `x-knock-signature` and dispatches on `event["type"]`.
- `GET /health` — liveness probe.
