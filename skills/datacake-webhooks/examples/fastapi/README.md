# Datacake Webhooks - FastAPI Example

Minimal example of receiving Datacake outgoing webhooks and authenticating them with a secret
header.

Datacake webhooks are not signed, so there is no HMAC to verify. You add a secret header under
**Headers** on the webhook, and a FastAPI dependency compares that header's whole value with
`DATACAKE_WEBHOOK_SECRET` using `hmac.compare_digest` on bytes. The route reads the body with
`await request.body()`, so any content type works.

## Prerequisites

- Python 3.9+
- A Datacake workspace with an outgoing webhook (see [../../references/setup.md](../../references/setup.md))

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

3. Set the two variables:
   - `DATACAKE_WEBHOOK_HEADER`: the header name you added in Datacake (default `Authorization`)
   - `DATACAKE_WEBHOOK_SECRET`: the exact, whole header value, including any `Bearer ` prefix you typed

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/datacake`.

## Test

```bash
pytest test_webhook.py
```

The tests send the documented `device_measurement`, `decoder_output` and `downlink` payloads with
correct, wrong and missing header values. No Datacake account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/datacake \
  -H "Content-Type: application/json" \
  -H "Authorization: $DATACAKE_WEBHOOK_SECRET" \
  -d '{"event":"downlink","data":{"device":"a52e6324-2cf9-4534-b523-819d94299414","payload":"AQI=","meta":{"type":"lorawan","fport":1}}}'
```

## Receive Webhooks Locally

Datacake can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 8000 datacake --path /webhooks/datacake
```

Put the printed URL as the endpoint URL of the Datacake webhook.

## How It Works

- `main.py`: `verify_datacake_request()`, the `require_datacake_secret` dependency and the
  `POST /webhooks/datacake` route

1. The configured header is looked up case-insensitively and its whole value is compared with the
   secret before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on the `event` field: `device_measurement`, `decoder_output`, `downlink`.
4. It returns `200 {"received": true}`.

A static shared secret authenticates the sender, not the body, and gives no replay protection.
Use HTTPS and rotate the secret if it leaks.
