# Daytona Webhooks - FastAPI Example

Minimal example of receiving Daytona webhooks with Svix signature verification. It verifies manually rather than with the `svix` SDK, because the SDK always enforces a 5-minute timestamp window and Hookdeck retries and replays keep the original timestamp. Set `DAYTONA_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to turn the window on.

Daytona's public webhook docs don't describe signing. Deliveries go through Svix, so this verifies `svix-id` / `svix-timestamp` / `svix-signature` with the official `svix` library.

## Prerequisites

- Python 3.9+
- A Daytona organization with Webhooks enabled and an endpoint's `whsec_` signing secret

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

3. Add your endpoint's signing secret to `.env` as `DAYTONA_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts `POST /webhooks/daytona`.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 8000 daytona --path /webhooks/daytona
```

Use the URL the CLI prints as the **Endpoint URL** when you add an endpoint in the Daytona Dashboard → Webhooks.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads with the Svix algorithm (HMAC-SHA256 over `{id}.{timestamp}.{body}`, base64-decoded `whsec_` key) and cover all seven events, bad signatures, tampered bodies, old timestamps (accepted by default, rejected once the window is set), missing headers, duplicates, and a missing secret.

To try it live, create a sandbox, snapshot or volume in your organization and watch the **Messages** tab in the Dashboard.
