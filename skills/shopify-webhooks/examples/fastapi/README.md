# Shopify Webhooks - FastAPI Example

Minimal example of receiving Shopify webhooks with signature verification using FastAPI.

## Prerequisites

- Python 3.9+
- Shopify app or store with webhook secret

## Setup

1. Create virtual environment:
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

4. Add your Shopify API secret to `.env`

## Run

```bash
uvicorn main:app --reload --port 3000
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Install Hookdeck CLI
brew install hookdeck/hookdeck/hookdeck

# Forward webhooks to localhost
hookdeck listen 3000 --path /webhooks/shopify
```

## Endpoint

- `POST /webhooks/shopify` - Receives and verifies Shopify webhook events
