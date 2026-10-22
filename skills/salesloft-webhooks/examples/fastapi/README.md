# Salesloft Webhooks - FastAPI Example

Minimal example of receiving Salesloft webhooks with `x-salesloft-signature` verification.

## Prerequisites

- Python 3.9+
- A Salesloft webhook subscription (created through the API) with a `callback_token` you chose

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

3. Add the subscription's `callback_token` to `.env` as `SALESLOFT_CALLBACK_TOKEN`

## Run

```bash
python main.py
```

Server runs on http://localhost:8000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 8000 salesloft --path /webhooks/salesloft
```

Use the printed URL as the `callback_url` when you create the subscription (see [../../references/setup.md](../../references/setup.md)).

### Send a signed request by hand

```bash
BODY='{"data":{"id":101}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha1 -hmac "$SALESLOFT_CALLBACK_TOKEN" | sed 's/^.* //')
curl -X POST http://localhost:8000/webhooks/salesloft \
  -H 'Content-Type: application/json' \
  -H 'x-salesloft-event: person_created' \
  -H "x-salesloft-signature: $SIG" -d "$BODY"
```

### Run tests

```bash
pytest test_webhook.py -v
```

## Endpoint

- `POST /webhooks/salesloft` - Verifies the signature over the raw body (read with `await request.body()`) and dispatches on the `x-salesloft-event` header (`person_created`, `person_updated`, `call_created`, `email_updated`, `meeting_booked`, `cadence_membership_created`)
