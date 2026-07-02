# Jira Webhooks - FastAPI Example

Minimal example of receiving Jira Cloud webhooks with signature verification using FastAPI.

## Prerequisites

- Python 3.9+
- A Jira Cloud site with a webhook configured (see [../../references/setup.md](../../references/setup.md))

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

4. Add your Jira webhook secret to `.env` (the `secret` you set when registering the dynamic webhook)

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

### Run the tests

```bash
pytest test_webhook.py
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 8000 jira --path /webhooks/jira
```

## Endpoint

- `POST /webhooks/jira` - Receives and verifies Jira webhook events

> **Note:** Only dynamic webhooks registered via the REST API with a `secret` are
> signed with `X-Hub-Signature`. Webhooks created in the Jira UI are unsigned.
