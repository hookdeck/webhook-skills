# Loop Webhooks - FastAPI Example

Minimal example of receiving [Loop](https://loop.com) (freight audit and
logistics payments) webhooks with signature verification. Loop delivers
webhooks through Svix, so verification uses the official
[`svix`](https://docs.svix.com/receiving/verifying-payloads/how) SDK.

## Prerequisites

- Python 3.10+
- A Loop webhook endpoint and its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `LOOP_WEBHOOK_SECRET` to the endpoint's signing secret from Loop's
   webhook portal (secrets are unique per endpoint).

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000. The webhook endpoint is:

```
POST http://localhost:8000/webhooks/loop
```

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads with the same algorithm Loop uses (HMAC-SHA256 over
`{svix-id}.{svix-timestamp}.{raw body}`, base64) and check the signing helper
against the example signature in Loop's docs. They cover every documented
event type, rotated (multi-signature) headers, tampered bodies, stale
timestamps, and deduplication on `eventId`.

## Receive Real Loop Webhooks Locally

Use the Hookdeck CLI to get a public URL that tunnels to this server (no
account required):

```bash
npx hookdeck-cli listen 8000 loop --path /webhooks/loop
```

Add the printed URL as an endpoint in Loop's webhook portal, then use the
**Testing** tab to send a `test-event.created` event.

## How It Works

See [`main.py`](main.py):

1. Reads the **raw** body (Loop signs the exact string it sent).
2. Verifies `svix-id`, `svix-timestamp` and `svix-signature` with the Svix
   SDK, which also rejects timestamps more than 5 minutes old.
3. Parses the JSON and skips events whose `eventId` was already processed.
   Loop recommends deduplicating on the payload `eventId`, not `svix-id`.
4. Dispatches on the top-level `eventType` and returns `200`.
