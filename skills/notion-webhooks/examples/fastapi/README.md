# Notion Webhooks - FastAPI Example

Minimal example of receiving Notion webhooks with FastAPI, including the
verification handshake and HMAC-SHA256 signature verification.

## Prerequisites

- Python 3.9+
- A Notion internal integration (https://www.notion.so/profile/integrations)
- A publicly reachable HTTPS endpoint (Notion does not deliver to localhost)

## Setup

1. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. The `NOTION_VERIFICATION_TOKEN` is initially unset — the first request
   will be the handshake and will print the token to stdout.

## Run

```bash
uvicorn main:app --reload --port 3000
```

Server runs on http://localhost:3000.

## The Handshake

1. Expose the server publicly (Hookdeck, ngrok, etc.).
2. Add a webhook subscription in Notion pointing at
   `https://<your-public-url>/webhooks/notion`.
3. Notion sends a single POST containing
   `{ "verification_token": "secret_..." }`. The handler logs it.
4. Paste that token into the Notion subscription UI **and** into your `.env`
   as `NOTION_VERIFICATION_TOKEN`, then restart the server.
5. Subsequent webhooks arrive with `X-Notion-Signature` and are verified.

## Test

```bash
pytest test_webhook.py -v
```

## Endpoint

- `POST /webhooks/notion` - Handles the handshake and verifies signed events.
