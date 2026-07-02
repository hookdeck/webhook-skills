# Bitbucket Webhooks - FastAPI Example

Minimal example of receiving Bitbucket Cloud webhooks with signature verification
using FastAPI.

## Prerequisites

- Python 3.9+
- Bitbucket repository with a webhook configured (with a secret)

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

4. Add your Bitbucket webhook secret to `.env`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 8000 bitbucket --path /webhooks/bitbucket
```

Then configure the Hookdeck URL in your Bitbucket repository webhook settings.

### Run the tests

```bash
pytest test_webhook.py -v
```

## Endpoint

- `POST /webhooks/bitbucket` - Receives and verifies Bitbucket webhook events
