# Bridge API Webhooks - FastAPI Example

Minimal example of receiving Bridge API (`bridgeapi.io`) webhooks with signature
verification, using FastAPI.

> **Not bridge.xyz.** This is Bridge API, the open-banking aggregator by Bridge
> (sister brand of Bankin'), not the bridge.xyz stablecoin payments company.

## Prerequisites

- Python 3.9+
- A Bridge API webhook configured in the dashboard (with its signing secret)

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

3. Add your Bridge webhook signing secret to `.env` as `BRIDGE_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook endpoint is available at
`POST http://localhost:8000/webhooks/bridge-api`.

## Test

### Run the unit tests

```bash
pytest test_webhook.py -v
```

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel deliveries to your local server (no account needed):

```bash
npx hookdeck-cli listen 8000 bridge-api --path /webhooks/bridge-api
```

Then set the Hookdeck URL as the callback URL in the Bridge dashboard and click
**"Send a test"** to deliver a `TEST_EVENT`.

## Endpoint

- `POST /webhooks/bridge-api` - Receives and verifies Bridge API webhook events
- `GET /health` - Health check

Bridge has no official verification SDK, so this example verifies the
`BridgeApi-Signature` HMAC-SHA256 signature manually against the **raw** request
body.
