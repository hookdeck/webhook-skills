# Storyblok Webhooks - FastAPI Example

Minimal example of receiving Storyblok webhooks with signature verification using FastAPI (HMAC-SHA1 hex of the raw body in the `webhook-signature` header). This is not Standard Webhooks, so no `standardwebhooks`/`svix` library is used.

## Prerequisites

- Python 3.10+
- A Storyblok space on a paid plan (Webhook secrets are not available on free plans)

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

4. Add the Webhook secret you set in Storyblok (**Settings → Webhooks**) to `.env` as `STORYBLOK_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the automated tests (they generate real HMAC-SHA1 signatures):

```bash
pytest test_webhook.py
```

To receive real Storyblok webhooks locally, use the Hookdeck CLI:

```bash
npx hookdeck-cli listen 8000 storyblok --path /webhooks/storyblok
```

Then set the Hookdeck URL as the **Endpoint URL** in **Settings → Webhooks** and publish a story.

## Endpoint

- `POST /webhooks/storyblok` - The `verified_body` dependency reads the raw body and checks `webhook-signature`; the route then dispatches on `action` plus the entity id field.
- `GET /health` - Health check

Task (Tasks app) webhooks are unsigned and are not handled by this route.
