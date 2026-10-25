# Ampersand Webhooks - FastAPI Example

Minimal example of receiving Ampersand webhooks with signature verification using the
[`svix`](https://pypi.org/project/svix/) library (Ampersand delivers webhooks through Svix).

## Prerequisites

- Python 3.9+
- An Ampersand webhook destination and its Webhook Signing Secret (`whsec_...`)

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

3. Add the destination's Webhook Signing Secret to `.env` (`AMPERSAND_WEBHOOK_SECRET`)

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

## Webhook Endpoint

```
POST http://localhost:8000/webhooks/ampersand
```

The route reads the raw body with `await request.body()`, verifies `svix-id`, `svix-timestamp` and
`svix-signature`, then dispatches on `notificationType` (notifications) or treats the body as a
read/subscribe result.

## Local Testing with Hookdeck

Use the Hookdeck CLI to receive webhooks locally (no account required):

```bash
npx hookdeck-cli listen 8000 ampersand --path /webhooks/ampersand
```

Use the printed URL as the URL of your Ampersand webhook destination.

## Manual Testing

Trigger a notification (for example connect and disconnect an installation) or run a read action
that targets the webhook destination, and watch the server log.
