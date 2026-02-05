# Postmark Webhooks - FastAPI Example

Minimal example of receiving Postmark webhooks with FastAPI.

## Prerequisites

- Python 3.9+
- Postmark account with webhook configuration access

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

4. Generate a secure webhook token:
   ```bash
   openssl rand -base64 32
   ```

5. Add the token to your `.env` file

## Run

Start the server:

```bash
uvicorn main:app --reload
```

Server runs on http://localhost:8000

API documentation available at http://localhost:8000/docs

## Configure Postmark

1. Log in to your [Postmark account](https://account.postmarkapp.com)
2. Select your Server → Webhooks → Add webhook
3. Set the webhook URL with your token:
   ```
   https://yourdomain.com/webhooks/postmark?token=your-secret-token
   ```
4. Select the events you want to receive
5. Save and test the webhook

## Test Locally

Use the Hookdeck CLI for local testing:

```bash
# Install Hookdeck CLI
brew install hookdeck/hookdeck/hookdeck

# Create tunnel to your local server
hookdeck listen 8000 --path /webhooks/postmark
```

Then use the provided URL in Postmark's webhook configuration.

## Test

Run the test suite:

```bash
pytest test_webhook.py -v
```

## Authentication Options

This example uses token-based authentication. For basic auth:

1. Configure webhook URL as:
   ```
   https://username:password@yourdomain.com/webhooks/postmark
   ```

2. Use FastAPI's HTTPBasic security instead of query parameter validation.