# Vern Webhooks - FastAPI Example

Minimal example of receiving Vern webhooks with signature verification using the
official [`svix`](https://pypi.org/project/svix/) library (Vern deliveries are signed by Svix per Standard Webhooks with `svix-*` headers).

## Prerequisites

- Python 3.9+
- Vern account with a webhook endpoint in the Svix portal and its signing secret (`whsec_...`)

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

3. Add your Vern signing secret to `.env` as `VERN_WEBHOOK_SECRET`. Copy it from the
   endpoint in the Svix portal (Settings > Webhooks in Vern).

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint:

```
POST http://localhost:8000/webhooks/vern
```

## Test

```bash
pytest test_webhook.py -v
```

The tests sign requests with the same HMAC-SHA256 algorithm Svix uses
(`{svix-id}.{svix-timestamp}.{raw body}`), including deliveries that carry the `webhook-*`
header names instead of `svix-*`.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 vern --path /webhooks/vern
```

1. Add the tunnel URL as an endpoint in the Svix portal (Settings > Webhooks in Vern) and subscribe it to `workbook.preview.export`.
2. Copy the endpoint's signing secret into `.env`.
3. Export a workbook with the **Webhook** option.

## Event Handling

Vern's body carries no event name (`workbook.production.export` and `workbook.preview.export`
send the same payload), so the handler dispatches on `version` and acknowledges anything else
with `200`:

- `1.0` (flat): counts the rows in `sheets[].data`
- `2.0` (nested): counts the records under each of `root_sheets`

The response reports `batch_id`, `batch_index` and whether this is the `last` batch, so you can
see how to reassemble an export. Use separate endpoints for preview and production.

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
