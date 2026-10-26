# TutorCruncher Webhooks - FastAPI Example

Minimal example of receiving TutorCruncher webhooks with signature verification.

`Webhook-Signature` is the bare lowercase hex HMAC-SHA256 of the raw body, keyed with your
integration's private API key (no prefix, no timestamp). The route reads the raw bytes with
`await request.body()`, verifies it in constant time, and only then parses
`{"events": [...]}` and loops over every event. The route accepts GET, POST, PUT, PATCH and
DELETE, because TutorCruncher's docs don't name the method.

## Prerequisites

- Python 3.9+
- A TutorCruncher integration and its private API key (see [../../references/setup.md](../../references/setup.md))

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

3. Set `TUTORCRUNCHER_WEBHOOK_SECRET` to your TutorCruncher private API key.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and serves `/webhooks/tutorcruncher`.

## Test

```bash
pytest test_webhook.py
```

The tests generate real signatures and cover valid, missing, malformed, tampered and wrong-key
signatures, every method (including a signed empty body), any content type, every handled
action, multi-event bodies and wrong-typed payloads. No TutorCruncher account is needed.

## Receive Webhooks Locally

TutorCruncher can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 8000 tutorcruncher --path /webhooks/tutorcruncher
```

Put the printed URL in your TutorCruncher integration. Hookdeck's TutorCruncher source
pre-selects POST without managing the method, so allow any other method the sender uses on the
source.

## How It Works

- `main.py`: `verify_tutorcruncher_signature()` plus the `/webhooks/tutorcruncher` route (`api_route`)

1. The signature is checked over the raw bytes before anything is parsed. Failure returns `401`.
2. A verified empty body is acknowledged with `200`.
3. The body must be `{"events": [...]}` (`400` otherwise); wrong-typed elements are skipped.
4. Each event is dispatched on `action`: `CREATED_A_CONTRACTOR`, `CHANGED_CONTRACTOR_STATUS`,
   `CLIENT_ENQUIRY`, `CREATED_AN_APPOINTMENT`, `RAISED_INVOICE`.
5. It returns `200 {"received": true}`.
