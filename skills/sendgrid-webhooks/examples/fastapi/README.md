# SendGrid Webhooks - FastAPI Example

Minimal example of receiving SendGrid webhooks with ECDSA signature verification in FastAPI.

## Prerequisites

- Python 3.9+
- SendGrid account with webhook verification key

## Setup

1. Create a virtual environment and activate it:
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

4. Add your SendGrid webhook verification key to `.env`:
   - Go to SendGrid Dashboard → Settings → Mail Settings → Event Webhook
   - Enable "Signed Event Webhook"
   - Copy the Verification Key

## Run

```bash
uvicorn main:app --port 3000 --reload
```

Server runs on http://localhost:3000

## Test

Run the test suite:
```bash
pytest test_webhook.py -v
```

Send a test webhook using SendGrid's dashboard:
1. Go to Event Webhook settings
2. Enter your endpoint URL: `http://localhost:3000/webhooks/sendgrid`
3. Click "Test Your Integration"

Or use Hookdeck CLI for local testing:
```bash
hookdeck listen 3000 --path /webhooks/sendgrid
```