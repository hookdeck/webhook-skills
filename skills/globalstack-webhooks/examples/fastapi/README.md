# GlobalStack Webhooks - FastAPI Example

Minimal example of receiving GlobalStack webhooks with signature
verification using the official [`svix`](https://pypi.org/project/svix/) library
(GlobalStack delivers webhooks through Svix).

## Prerequisites

- Python 3.9+
- A GlobalStack webhook endpoint and its signing secret (`whsec_...`), shown once when you create it

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

3. Add your GlobalStack signing secret to `.env` as `GLOBALSTACK_WEBHOOK_SECRET`. It is the
   `signing_secret` returned by `POST /v1/notifications/webhooks`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint:

```
POST http://localhost:8000/webhooks/globalstack
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
npx hookdeck-cli listen 8000 globalstack --path /webhooks/globalstack
```

1. Create a GlobalStack webhook endpoint (`POST /v1/notifications/webhooks`) with the tunnel URL
   and the categories you want, e.g. `["onramp", "conversion"]`.
2. Copy the returned `signing_secret` into `.env`.
3. Activate the endpoint: `PATCH /v1/notifications/webhooks/{id}` with `{"active": true}`.
   New endpoints are inactive and deliver nothing.

## Event Handling

The handler reads the event name from the envelope's top-level `event_type` field, routes these
events, and acknowledges anything else with `200`:

- `onramp.awaiting_deposit`, `onramp.funds_received`, `onramp.processing`, `onramp.success`, `onramp.failed`, `onramp.returned`
- `offramp.created`, `offramp.funds_received`, `offramp.processing`, `offramp.success`, `offramp.failed`, `offramp.returned`
- `conversion.created`, `conversion.funds_received`, `conversion.processing`, `conversion.success`, `conversion.failed`, `conversion.returned`
- `transfer.processing`, `transfer.success`, `transfer.failed`
- `deposit.received`, `deposit.held`, `deposit.confirmed`, `deposit.failed`
- `kyc.approved`, `kyc.rejected`

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
