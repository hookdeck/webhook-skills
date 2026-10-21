# Gopuff Webhooks - FastAPI Example

Minimal example of receiving Gopuff (Powered by Gopuff partner API) webhooks with Svix signature verification. It verifies manually rather than with the [`svix`](https://pypi.org/project/svix/) SDK, because the SDK always enforces a 5-minute timestamp window and Hookdeck retries and replays keep the original timestamp. Set `GOPUFF_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to turn the window on.

## Prerequisites

- Python 3.9+
- A Gopuff partner account and the endpoint signing secret (`whsec_...`) from the Svix App Portal

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

3. Add your signing secret to `.env` (`GOPUFF_WEBHOOK_SECRET`)

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

## Webhook Endpoint

```
POST http://localhost:8000/webhooks/gopuff
```

## Local Testing with Hookdeck

```bash
npx hookdeck-cli listen 8000 gopuff --path /webhooks/gopuff
```

Use the printed URL as the endpoint URL in the Svix App Portal (get an access link from `POST /devportal/v1/webhooks/app-portal-link`). The portal's testing tab can send example events.
