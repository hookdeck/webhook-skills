# Ultravox Webhooks - FastAPI Example

Minimal example of receiving Ultravox webhooks with signature verification
(`X-Ultravox-Webhook-Signature`, HMAC-SHA256 over the raw body followed by `X-Ultravox-Webhook-Timestamp`).

## Prerequisites

- Python 3.9+
- An Ultravox webhook and one of its secrets

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

3. Add your Ultravox webhook secret to `.env` as `ULTRAVOX_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000

Webhook endpoint: `POST http://localhost:8000/webhooks/ultravox`

## Test

Run the test suite (generates real signatures with the Ultravox algorithm):

```bash
pytest test_webhook.py -v
```

To receive real Ultravox webhooks locally, start a tunnel (no account required):

```bash
npx hookdeck-cli listen 8000 ultravox --path /webhooks/ultravox
```

Use the printed URL as the URL of your Ultravox webhook.

## Events Handled

- `call.started`
- `call.joined`
- `call.ended`
- `call.billed`

Any other event is logged and acknowledged.

## Optional Timestamp Tolerance

Old timestamps are accepted by default, because Hookdeck retries and replays resend the original
headers. To reject deliveries older than N seconds, set `ULTRAVOX_WEBHOOK_TOLERANCE_SECONDS=N`.

## Project Structure

```
├── main.py               # FastAPI app + webhook handler
├── test_webhook.py       # Signature verification tests
├── requirements.txt
└── .env.example
```
