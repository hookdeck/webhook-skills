# Attentive Webhooks - FastAPI Example

Minimal example of receiving Attentive webhooks with signature verification using FastAPI.

## Prerequisites

- Python 3.9+
- An Attentive webhook configured with a Signing key (from the custom app's Webhooks tab)

## Setup

1. Create a virtual environment:
   ```bash
   python -m venv venv
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

4. Add your Attentive signing key to `.env` as `ATTENTIVE_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the test suite (generates real HMAC-SHA256 signatures):

```bash
pytest test_webhook.py -v
```

### Using Hookdeck CLI

Forward public webhook traffic to your local server (no account required):

```bash
npx hookdeck-cli listen 8000 attentive --path /webhooks/attentive
```

## Endpoint

- `POST /webhooks/attentive` - Receives and verifies Attentive webhook events
