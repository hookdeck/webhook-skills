# Discord Webhooks - FastAPI Example

FastAPI example for receiving Discord webhook events with Ed25519 signature verification using [PyNaCl](https://pypi.org/project/PyNaCl/).

## Prerequisites

- Python 3.9+
- Discord application with a Public Key (from [Developer Portal](https://discord.com/developers/applications) → General Information)

## Setup

1. Create a virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate   # Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Add your Discord application **Public Key** (hex) to `.env`.

## Run

```bash
uvicorn main:app --reload --port 3000
```

Server runs on http://localhost:3000.

## Test

```bash
pytest test_webhook.py -v
```

## Webhook Endpoint

```
POST http://localhost:3000/webhooks/discord
```

## API Documentation

- Swagger UI: http://localhost:3000/docs
- ReDoc: http://localhost:3000/redoc

## Local Testing with Hookdeck

```bash
npx hookdeck-cli listen 3000 discord --path /webhooks/discord
```

Paste the public tunnel URL into Discord Developer Portal → your app → Webhooks → Endpoint URL.
