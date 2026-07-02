# WorkOS Webhooks - FastAPI Example

Minimal example of receiving WorkOS webhooks with signature verification using
FastAPI. Verification is done manually (dependency-free) so the exact WorkOS
signing algorithm is explicit.

## Prerequisites

- Python 3.9+
- WorkOS account with a webhook endpoint signing secret

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

4. Add your WorkOS webhook signing secret to `.env`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel WorkOS events to your local server (no account
required):

```bash
npx hookdeck-cli listen 8000 workos --path /webhooks/workos
```

Set the WorkOS Dashboard webhook endpoint URL to the tunnel URL the CLI prints.

## How It Works

- The handler reads the **raw body** with `await request.body()` — parsing first
  would break the HMAC.
- `verify_signature` parses the `WorkOS-Signature` header (`t=<ms>, v1=<hex>`),
  rejects stale timestamps (default 3 minute tolerance), recomputes the
  HMAC-SHA256 over `` `{timestamp}.{raw_body}` ``, and compares timing-safely.
- The event type is in the `event` field; the object is in `data`.

> The WorkOS Python SDK also ships `workos.webhooks.construct_event(...)`. The
> manual approach here keeps dependencies minimal and the algorithm explicit.

## Endpoint

- `POST /webhooks/workos` - Receives and verifies WorkOS webhook events
- `GET /health` - Health check
