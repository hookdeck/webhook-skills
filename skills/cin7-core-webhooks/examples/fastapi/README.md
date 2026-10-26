# Cin7 Core Webhooks - FastAPI Example

Minimal example of receiving Cin7 Core webhooks and authenticating them with the Bearer or custom header configured on the webhook.

Cin7 Core does not sign payloads. A FastAPI dependency compares the configured header with your stored value (the whole value, `hmac.compare_digest` on bytes) before the body is read, so any content type works.

> A static shared credential authenticates the sender, not the body, and gives no replay protection. Use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Python 3.9+
- A Cin7 Core webhook created with `bearerauth` or `ExternalHeaders` (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `CIN7_CORE_WEBHOOK_HEADER` and `CIN7_CORE_WEBHOOK_SECRET` (the exact whole header value, e.g. `Bearer <token>`).

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/cin7-core`.

## Test

```bash
pytest test_webhook.py
```

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 8000 cin7-core --path /webhooks/cin7-core
```

Put the printed URL in the Cin7 Core webhook.

## How It Works

1. `require_cin7_core_credential` checks the header before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. `handle_event` dispatches on `EventType`: `Sale/Created`, `Sale/OrderAuthorised`, `Sale/ShipmentAuthorised`, `Purchase/OrderAuthorised`, `Product/Updated`.
4. It returns `200 {"received": true}`.
