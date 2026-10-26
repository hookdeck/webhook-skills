# Pinata Webhooks - FastAPI Example

Minimal example of receiving Pinata webhooks with signature verification using the
official [`svix`](https://pypi.org/project/svix/) library (Pinata delivers webhooks through Svix).

## Prerequisites

- Python 3.9+
- Pinata account with a webhook endpoint and its signing secret (`whsec_...`)

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

3. Add your Pinata signing secret to `.env` as `PINATA_WEBHOOK_SECRET`. Reveal it on the
   webhook's dashboard in the Pinata App (right sidebar). It starts with `whsec_`; keep the full value.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint:

```
POST http://localhost:8000/webhooks/pinata
```

## Test

```bash
pytest test_webhook.py -v
```

The tests sign requests with the same HMAC-SHA256 algorithm Svix uses
(`{webhook-id}.{webhook-timestamp}.{raw body}`), including deliveries that carry the `svix-*`
header names instead of `webhook-*`.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 pinata --path /webhooks/pinata
```

1. In the Pinata App, open the Webhooks tab, click "Add Endpoint" and enter the tunnel URL.
2. Copy the webhook's signing secret into `.env`.
3. Upload a file to trigger `ipfs.public.file_added` (or `ipfs.private.file_added`).

## Event Handling

The handler reads the event name from the body's top-level `event_type` field (the two CAR-import
events use `event` instead), routes these events, and acknowledges anything else with `200`:

- `ipfs.private.file_added`, `ipfs.private.file_updated`, `ipfs.private.file_deleted`
- `ipfs.public.file_added`, `ipfs.public.file_updated`, `ipfs.public.file_deleted`
- `ipfs.public.car_import_succeeded`, `ipfs.public.car_import_failed`
- `ipfs.public.pin_by_cid_added`, `ipfs.public.pin_by_cid_succeeded`, `ipfs.public.pin_by_cid_failed`

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `webhook-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
