# JobAdder Webhooks - FastAPI Example

Minimal example of receiving JobAdder webhooks and authenticating them with the
`Authorization` header.

JobAdder does not sign payloads. The only credential is the optional `authorization` value you
set when creating the webhook; JobAdder sends it back as the `Authorization` header. The handler
compares the **whole header value**, including any `Basic ` or `Bearer ` prefix, with a
constant-time comparison. It never decodes it.

## Prerequisites

- Python 3.9+
- A JobAdder partner application with the `offline_access` scope, to create webhooks through the
  Webhook API (see [../../references/setup.md](../../references/setup.md))

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

3. Set `JOBADDER_AUTHORIZATION` to the authorization value exactly as set in the JobAdder
   webhook, including any "Bearer " or "Basic " prefix.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts webhooks at `POST /webhooks/jobadder`.

## Test

```bash
pytest test_webhook.py
```

The tests post the documented notification envelope with correct, wrong, prefix-less and
missing `Authorization` headers. To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/jobadder \
  -H "Content-Type: application/json" \
  -H "Authorization: $JOBADDER_AUTHORIZATION" \
  -d '{"apiVersion":2,"event":"placement_approved","eventId":"00000000-0000-0000-0000-000000000000","eventDate":"2019-01-01T09:00:00Z","eventUser":{},"eventData":{}}'
```

## Receive JobAdder Webhooks Locally

```bash
npx hookdeck-cli listen 8000 jobadder --path /webhooks/jobadder
```

Use the printed URL as the `url` of your JobAdder webhook.

## How It Works

- `main.py`: `verify_jobadder_request()`, the `require_jobadder_auth` dependency and the `POST /webhooks/jobadder` route

1. The `require_jobadder_auth` dependency compares `Authorization` in full with
   `JOBADDER_AUTHORIZATION` before the body is read. Failure returns `401`.
2. The raw body is parsed as JSON, so any content type works. It must be an object (`400` otherwise).
3. The handler branches on the `event` field (`candidate_status_changed`, `job_status_changed`,
   `jobapplication_status_changed`, `placement_approved`).
4. It returns `200 {"received": true}`.

A static credential authenticates the sender, not the body, and gives no replay protection.
Use HTTPS, dedupe on `eventId`, and rotate the credential if it leaks.
