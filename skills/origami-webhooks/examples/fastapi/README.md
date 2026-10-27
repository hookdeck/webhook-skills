# Origami Webhooks - FastAPI Example

Minimal example of receiving Origami webhooks with signature verification using the
[`standardwebhooks`](https://pypi.org/project/standardwebhooks/) library (Origami signs deliveries with Standard Webhooks).

## Prerequisites

- Python 3.9+
- An Origami account with a webhook endpoint and its signing secret (`whsec_...`)

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

3. Add your Origami endpoint signing secret to `.env` as `ORIGAMI_WEBHOOK_SECRET`. Keep the whole
   `whsec_...` value. The secret is shown once when you create the endpoint in
   **Settings → Developers → Webhooks**.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint:

```
POST http://localhost:8000/webhooks/origami
```

## Test

```bash
pytest test_webhook.py -v
```

The tests sign requests with the same HMAC-SHA256 algorithm Origami uses
(`{webhook-id}.{webhook-timestamp}.{raw body}`), including deliveries that carry the `svix-*`
header names instead of `webhook-*`.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 origami --path /webhooks/origami
```

1. In Origami, open **Settings → Developers → Webhooks** and click **New endpoint**. Enter the
   tunnel URL and pick the event types you want.
2. Copy the signing secret (shown once) into `.env`.
3. Open the endpoint drawer and click **Test endpoint** to send a `webhook.test` event.

## Event Handling

The handler reads the event name from the envelope's top-level `type` field, reads the event from
`data`, routes these events, and acknowledges anything else with `200`:

- `job.succeeded`, `job.failed`, `job.cancelled`, `job.needs_input`
- `table.run.completed`
- `sequence.message.sent`, `sequence.reply.received`
- `sequence.connection.requested`, `sequence.connection.accepted`, `sequence.comment.posted`
- `webhook.test`

## Timestamp Window

The `standardwebhooks` library enforces a fixed 5-minute timestamp window. Hookdeck retries and
replays resend the original `webhook-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
