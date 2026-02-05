# Cursor Webhooks - FastAPI Example

Minimal example of receiving Cursor webhooks with signature verification in FastAPI.

## Prerequisites

- Python 3.9+
- Cursor account with webhook signing secret

## Setup

1. Create a virtual environment:
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

4. Add your Cursor webhook signing secret to `.env`

## Run

```bash
uvicorn main:app --reload
```

Server runs on http://localhost:8000

API documentation available at http://localhost:8000/docs

## Test

Run the test suite:

```bash
pytest test_webhook.py
```

## Local Development

Use Hookdeck CLI to receive webhooks locally:

```bash
# Install Hookdeck CLI
npm install -g hookdeck-cli

# Forward webhooks to your local server
hookdeck listen 8000 --path /webhooks/cursor
```

## Endpoints

- `POST /webhooks/cursor` - Receives and verifies Cursor webhooks
- `GET /health` - Health check endpoint