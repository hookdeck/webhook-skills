# Webflow Webhooks - FastAPI Example

Minimal example of receiving Webflow webhooks with signature verification using FastAPI.

## Prerequisites

- Python 3.9+
- Webflow account with webhook configured
- Webhook signing secret (from OAuth app or API-created webhook)

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

4. Add your Webflow webhook signing secret to `.env`:
   - For OAuth app webhooks: Use your OAuth client secret
   - For API-created webhooks: Use the `secret` field from the creation response

## Run

```bash
# Production
uvicorn main:app --host 0.0.0.0 --port 3000

# Development (with auto-reload)
uvicorn main:app --reload --host 0.0.0.0 --port 3000
```

Server runs on http://localhost:3000

Webhook endpoint: `POST http://localhost:3000/webhooks/webflow`

API documentation: http://localhost:3000/docs

## Test Locally

Use Hookdeck CLI to create a public URL for your local server:

```bash
# Install Hookdeck CLI
npm install -g hookdeck-cli

# Create tunnel
hookdeck listen 3000 --path /webhooks/webflow
```

1. Copy the Hookdeck URL (e.g., `https://events.hookdeck.com/e/src_xxxxx`)
2. Add this URL as your webhook endpoint in Webflow
3. Trigger test events in Webflow
4. Check your FastAPI console for logged events

## Test Suite

Run the test suite:

```bash
pytest test_webhook.py -v
```

Tests verify:
- Signature verification with valid signatures
- Rejection of invalid signatures
- Timestamp validation (5-minute window)
- Proper error handling
- Event type handling

## Project Structure

```
├── main.py             # FastAPI application and webhook handler
├── test_webhook.py     # Test suite
├── requirements.txt    # Python dependencies
├── .env.example        # Environment variables template
└── README.md          # This file
```

## Implementation Notes

This example demonstrates:
- Raw body access for signature verification
- Dependency injection for signature validation
- Async request handlers
- Proper error responses with appropriate status codes
- Comprehensive logging

## Common Issues

### Signature Verification Fails
- Ensure you're using the correct secret (OAuth client secret vs webhook-specific secret)
- Webhook must be created via API or OAuth app (not dashboard) for signatures
- Verify you're using the raw request body

### Missing Headers
- Dashboard-created webhooks don't include signature headers
- Recreate the webhook via API or OAuth app

### Module Import Errors
- Ensure virtual environment is activated
- Run `pip install -r requirements.txt` to install all dependencies