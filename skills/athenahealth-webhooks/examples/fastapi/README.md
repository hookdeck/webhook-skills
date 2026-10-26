# athenahealth Webhooks - FastAPI Example

Minimal example of receiving athenahealth FHIR Subscription notifications with signature verification.

## Prerequisites

- Python 3.9+
- athenahealth Event Subscription Platform access and a FHIR Subscription created with an `X-Hub-Secret` header

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `ATHENAHEALTH_WEBHOOK_SECRET` in `.env` to the same value you sent as the `X-Hub-Secret` header when creating the Subscription. Without that header, athenahealth sends unsigned notifications.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

### Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 athenahealth --path /webhooks/athenahealth
```

Then create a Subscription (`POST /fhir/r4/Subscription`) whose `channel.endpoint` is the Hookdeck URL, for a topic such as `Appointment.schedule`.

## Endpoint

- `POST /webhooks/athenahealth` - Receives and verifies athenahealth notification Bundles (`X-Hub-Signature`, `sha256=<hex>`). The raw body is read with `await request.body()`, so any content type verifies. Only the `sha256` method is accepted: if athenahealth changes the method, verification fails until you add support for it.
