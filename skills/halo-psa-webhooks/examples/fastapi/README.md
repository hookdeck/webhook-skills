# HaloPSA Webhooks - FastAPI Example

Minimal example of receiving HaloPSA (and HaloITSM / HaloCRM) webhooks, authenticated with
**Basic Authentication**.

Halo does not sign webhooks, so there is no HMAC signature to verify. The handler decodes the
`Authorization: Basic base64(username:password)` header and compares the username and the
password, each in constant time and both evaluated before deciding. A static shared credential
authenticates the sender, not the body, and gives no replay protection: use HTTPS and rotate the
credential if it leaks.

## Prerequisites

- Python 3.9+
- A Halo instance where you can create webhooks (Configuration > Integrations > Webhooks)

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

3. Set `HALO_PSA_WEBHOOK_USERNAME` and `HALO_PSA_WEBHOOK_PASSWORD` to the values you enter
   on the Halo webhook. **Choose Basic Authentication on the Halo webhook.** The credentials
   must arrive on the first request: Hookdeck never sends a 401 + `WWW-Authenticate` challenge,
   it verifies the request as received.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts `POST /webhooks/halo-psa`.

## Test

```bash
pytest test_webhook.py
```

The tests cover correct and wrong credentials, malformed headers, credentials followed by junk,
any content type, batched (array) deliveries and each event. No Halo instance is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/halo-psa \
  -u "$HALO_PSA_WEBHOOK_USERNAME:$HALO_PSA_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"event":"New Ticket Logged","object_id":4021}'
```

(The payload property names are illustrative: see the Deliveries tab of your Halo webhook for a real one.)

## Receive Webhooks from Halo Locally

Halo can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 8000 halo-psa --path /webhooks/halo-psa
```

Use the printed URL as the **Payload URL** of the Halo webhook.

## How It Works

- `main.py`: `verify_halo_psa_request()`, the `require_halo_psa_auth` dependency and the `POST /webhooks/halo-psa` route

1. The request is authenticated before the body is parsed. The `Authorization` header must be
   `Basic` (any case) followed by strict base64 of `username:password`, split on the first
   colon. Anything else (missing, malformed, junk after the credentials, mismatch) returns `401`.
2. The body is read raw, so any content type works. It must be a JSON object, or an array of
   objects when batching is on (`400` otherwise).
3. The handler dispatches on the event name: `New Ticket Logged`, `Ticket Reassigned`,
   `Document deleted on a Ticket`, `Document edited on a Ticket`.
   Which JSON property carries the event name isn't documented in text, so the examples check
   `event`, `eventName` and `event_name`: confirm against a real delivery.
4. It returns `200 {"received": true}`.
