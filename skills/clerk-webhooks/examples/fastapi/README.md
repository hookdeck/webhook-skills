# Clerk Webhooks - FastAPI Example

FastAPI example for receiving Clerk webhooks with signature verification.

## Prerequisites

- Python 3.9+
- Clerk account with webhook signing secret

## Setup

1. Create virtual environment:
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

4. Add your Clerk webhook signing secret to `.env`

## Run

```bash
uvicorn main:app --reload --port 3000
```

Server runs on http://localhost:3000

## Test

```bash
pytest test_webhook.py -v
```

## Webhook Endpoint

The webhook endpoint is available at:
```
POST http://localhost:3000/webhooks/clerk
```

## API Documentation

FastAPI provides automatic API documentation:
- Swagger UI: http://localhost:3000/docs
- ReDoc: http://localhost:3000/redoc

## Local Testing with Hookdeck

Use Hookdeck CLI to test webhooks locally:

```bash
# Install Hookdeck CLI
brew install hookdeck/hookdeck/hookdeck

# Create tunnel
hookdeck listen 3000 --path /webhooks/clerk

# Use the provided URL in your Clerk webhook settings
```

## Manual Testing

Send a test webhook from Clerk Dashboard:

1. Go to Clerk Dashboard > Webhooks
2. Click on your webhook endpoint
3. Click "Send test event"
4. Select an event type and send