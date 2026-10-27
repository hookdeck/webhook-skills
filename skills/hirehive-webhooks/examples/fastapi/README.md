# HireHive Webhooks - FastAPI Example

Minimal example of receiving HireHive webhooks with signature verification using the
[`standardwebhooks`](https://pypi.org/project/standardwebhooks/) library (HireHive follows the
Standard Webhooks specification).

## Prerequisites

- Python 3.9+
- HireHive account with permission to manage webhooks, and a webhook's signing secret (`whsec_...`)

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

3. Add your HireHive webhook secret to `.env` as `HIREHIVE_WEBHOOK_SECRET`
   (the full `whsec_...` value, prefix included, from the webhook's settings in HireHive).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint:

```
POST http://localhost:8000/webhooks/hirehive
```

## Test

```bash
pytest test_webhook.py -v
```

The tests sign requests with the Standard Webhooks algorithm
(`{webhook-id}.{webhook-timestamp}.{raw body}`, HMAC-SHA256, base64), and check that the
`svix-*` header names are accepted too.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 hirehive --path /webhooks/hirehive
```

1. In HireHive, create a webhook (you need the manage-webhooks permission), enter the tunnel URL and choose events.
2. Copy the webhook's signing secret into `.env`.
3. Trigger an event in HireHive (for example create a job) and watch the request log, which can also resend a delivery.

## Event Handling

The body is `{ type, timestamp, data }`, where `timestamp` is ISO 8601 and `data` holds the event's object. The handler reads the event name from the
top-level `type` field, routes the 19 documented events, and logs anything else:

- `job.created`, `job.updated`, `job.status.updated`, `job.deleted`
- `application.created`, `application.stage.updated`, `application.deleted`
- `candidate.updated`, `candidate.note.created`, `candidate.note.updated`, `candidate.note.deleted`, `candidate.tag.added`, `candidate.tag.removed`
- `feedback.requested`, `feedback.submitted`, `feedback.updated`
- `interview.created`, `interview.updated`, `interview.cancelled`

There is no event id in the body, and HireHive doesn't show the contents of `data`: use the `webhook-id` header to deduplicate.

## Timestamp Window

The `standardwebhooks` library enforces a fixed 5-minute timestamp window. Hookdeck retries and
replays resend the original `webhook-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
