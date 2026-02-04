# FusionAuth Webhooks - FastAPI Example

Minimal example of receiving FusionAuth webhooks with JWT signature verification using FastAPI.

## Prerequisites

- Python 3.9+
- FusionAuth instance with webhook signing enabled
- HMAC signing key from FusionAuth Key Master

## Setup

1. Create and activate a virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Add your FusionAuth HMAC webhook secret to `.env`:
   - In FusionAuth admin, go to **Settings → Key Master**
   - Create or view your HMAC signing key
   - Copy the secret value to `FUSIONAUTH_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 3000
```

Server runs on http://localhost:3000

## Test Locally

Use Hookdeck CLI to receive webhooks on localhost:

```bash
# Install Hookdeck CLI
brew install hookdeck/hookdeck/hookdeck

# Start tunnel (no account needed)
hookdeck listen 3000 --path /webhooks/fusionauth
```

Then configure FusionAuth to send webhooks to the Hookdeck URL.

## Endpoints

- `POST /webhooks/fusionauth` - Webhook receiver with signature verification
- `GET /health` - Health check

## Run Tests

```bash
pytest test_webhook.py -v
```
