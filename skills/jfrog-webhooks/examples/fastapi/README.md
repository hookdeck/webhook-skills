# JFrog Webhooks - FastAPI Example

Minimal example of receiving JFrog webhooks and authenticating the `X-JFrog-Event-Auth`
secret token (token mode) with FastAPI.

## Prerequisites

- Python 3.9+
- A JFrog Platform webhook with a secret token (and "use secret for signing" **off**)

## Setup

1. Create a virtualenv and install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your webhook's secret token to `.env` as `JFROG_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 (webhook endpoint: `POST /webhooks/jfrog`).

## Receive Webhooks Locally

JFrog can't reach `localhost`. Tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 jfrog --path /webhooks/jfrog
```

Use the printed URL as the webhook's **URL** in JFrog (Platform → Integrations → Webhooks).

## Test

```bash
pytest test_webhook.py -v
```

The webhook's **Test** button in JFrog also sends a sample request.

## Events Handled

`artifact` `deployed`, `deleted`, `moved`; `docker` `pushed`; `build` `uploaded`, `promoted`.

Signing mode (`use_secret_for_signing=true`) is not covered: JFrog does not document which
header carries that signature.
