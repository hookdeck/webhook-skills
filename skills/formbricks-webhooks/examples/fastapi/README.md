# Formbricks Webhooks - FastAPI Example

Minimal example of receiving Formbricks webhooks with signature verification using the
[`standardwebhooks`](https://pypi.org/project/standardwebhooks/) library (Formbricks follows the
Standard Webhooks specification).

## Prerequisites

- Python 3.9+
- Formbricks account (or a self-hosted instance) with a webhook and its signing secret (`whsec_...`)

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

3. Add your Formbricks webhook secret to `.env` as `FORMBRICKS_WEBHOOK_SECRET`
   (the full `whsec_...` value shown when you create the webhook under Configuration > Integrations > Webhooks).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint:

```
POST http://localhost:8000/webhooks/formbricks
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
npx hookdeck-cli listen 8000 formbricks --path /webhooks/formbricks
```

1. In Formbricks go to **Configuration > Integrations > Webhooks > Add Webhook**, paste the tunnel URL and click **Test Endpoint** (it must succeed before you can save), then pick the triggers and surveys.
2. Copy the webhook's signing secret (`whsec_...`) into `.env`.
3. Submit a response to a survey the webhook covers to deliver a signed event.

Webhooks created before Formbricks added signing have no secret and are unsigned. If yours has no secret, create a new webhook. This handler rejects unsigned deliveries with `400`.

## Event Handling

The body is `{ event, data, webhookId }`. The handler reads the event name from the top-level
`event` field (`data` is the survey response), routes these events, and logs anything else:

- `responseCreated`, `responseUpdated`, `responseFinished`

There is no event id in the body: use the `webhook-id` header to deduplicate.

## Timestamp Window

The `standardwebhooks` library enforces a fixed 5-minute timestamp window. Hookdeck retries and
replays resend the original `webhook-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
