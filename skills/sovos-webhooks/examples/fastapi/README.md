# Sovos Webhooks - FastAPI Example

Minimal example of receiving Sovos e-invoicing (Indirect Tax API) webhooks with
signature verification. Sovos delivers through Svix, so verification uses the
official [`svix`](https://pypi.org/project/svix/) Python SDK.

## Prerequisites

- Python 3.10+
- A Sovos webhook endpoint configured in the Svix Consumer App Portal, with its signing secret (`whsec_...`)

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

3. Add your signing secret to `.env` as `SOVOS_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. The webhook endpoint is
`POST http://localhost:8000/webhooks/sovos`.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads with the Svix algorithm and cover valid events,
secret rotation, invalid signatures, tampered bodies, stale timestamps, and a
missing secret.

## Local Testing with Hookdeck

Expose your local server (no account required):

```bash
npx hookdeck-cli listen 8000 sovos --path /webhooks/sovos
```

Add the printed URL as an endpoint in the Svix Consumer App Portal, then send an
example event from the portal's **Testing** tab.
