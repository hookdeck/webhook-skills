# MakePlans Webhooks - FastAPI Example

Minimal FastAPI example of receiving [MakePlans](https://makeplans.com) webhooks and verifying the `X-MakePlans-Signature` HMAC.

## Prerequisites

- Python 3.9+
- A MakePlans account and its Account secret (Setup > Webhooks) (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `MAKEPLANS_ACCOUNT_SECRET` in `.env` to the Account secret shown on the MakePlans Webhooks page (not the API key).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/makeplans` in [main.py](main.py).

## Test

```bash
pytest test_webhook.py -v
```

The tests cover a valid signature, a base64 digest (rejected), a signature without the `sha256=` prefix (rejected), a second event type, another secret, a tampered body, a missing header, a trailing newline in the secret, invalid JSON, and a missing secret.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 makeplans --path /webhooks/makeplans
```

Add a MakePlans webhook with the printed URL and the event `booking.*`, then create a booking.

## Notes

- The handler reads `await request.body()` before parsing. The HMAC covers the exact raw body, so don't parse and re-serialise it first.
- Hex encoding is inferred from MakePlans' example value. If a real delivery doesn't verify, compare against a base64 digest.
