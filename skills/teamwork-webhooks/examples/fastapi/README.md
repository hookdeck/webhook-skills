# Teamwork Webhooks - FastAPI Example

Minimal example of receiving Teamwork.com Projects (Version 2) webhooks with `X-Projects-Signature` verification.

## Prerequisites

- Python 3.10+
- A Teamwork **Version 2** webhook with a **token** set (see [setup](../../references/setup.md))

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the webhook token to `.env` as `TEAMWORK_WEBHOOK_TOKEN`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

### Unit tests

```bash
pytest test_webhook.py -v
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 8000 teamwork --path /webhooks/teamwork
```

Use the Hookdeck URL as the webhook URL in Teamwork, then create or complete a task.

## Endpoint

- `POST /webhooks/teamwork` - Receives and verifies Teamwork webhook events. Returns `401` on a missing or invalid signature.
