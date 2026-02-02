# Resend Webhooks - FastAPI Example

Minimal example of receiving Resend webhooks with signature verification.

## Prerequisites

- Python 3.9+
- Resend account with webhook signing secret

## Setup

1. Create virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Add your Resend webhook signing secret to `.env`

## Run

```bash
python main.py
```

Or with uvicorn directly:

```bash
uvicorn main:app --reload --port 3000
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI (Recommended)

```bash
# Install Hookdeck CLI
brew install hookdeck/hookdeck/hookdeck

# Forward webhooks to localhost (no account required)
hookdeck listen 3000 --path /webhooks/resend
```

Then configure the Hookdeck URL in your Resend webhook settings.

### Using ngrok

```bash
ngrok http 3000
```

Use the ngrok URL as your webhook endpoint in the Resend dashboard.

### Run Unit Tests

```bash
pytest test_webhook.py -v
```

### Trigger Test Events

From the Resend Dashboard:
1. Go to Webhooks
2. Select your webhook
3. Click "Send Test"
4. Choose an event type and send

## Endpoint

- `POST /webhooks/resend` - Receives and verifies Resend webhook events
