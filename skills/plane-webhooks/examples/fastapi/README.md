# Plane Webhooks - FastAPI Example

Minimal example of receiving Plane webhooks with signature verification (`X-Plane-Signature`, HMAC-SHA256).

## Prerequisites

- Python 3.9+
- A Plane workspace where you are an Owner or Admin, and the webhook secret key (`plane_wh_...`)

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

3. Add your Plane webhook secret key to `.env` as `PLANE_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and receives webhooks at `POST /webhooks/plane`.

The route reads the raw bytes with `await request.body()`, so the exact bytes Plane signed are verified before the JSON is parsed.

## Test

Run the unit tests (they generate real signatures):

```bash
pytest test_webhook.py
```

To receive real deliveries locally:

```bash
npx hookdeck-cli listen 8000 plane --path /webhooks/plane
```

Then add the Hookdeck URL as the **Payload URL** under **Workspace settings → Webhooks → Add webhook** and create or update a work item to send an event.
