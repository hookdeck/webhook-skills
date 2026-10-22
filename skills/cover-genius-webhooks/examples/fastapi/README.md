# Cover Genius Webhooks - FastAPI Example

Minimal example of receiving Cover Genius **Offers** webhooks with `X-Api-Key` verification.

Offers webhooks carry no payload signature. Cover Genius sends your authentication key as
plain text in the `X-Api-Key` header, and the handler compares it with `COVER_GENIUS_API_KEY`
in constant time. XClaim and RentalCover webhooks use other schemes and aren't covered.

## Prerequisites

- Python 3.9+
- A Cover Genius Offers integration (your Client Solution Engineer configures the webhook, see [../../references/setup.md](../../references/setup.md))

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

3. Set `COVER_GENIUS_API_KEY` to the authentication key you gave your CSE.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/cover-genius`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send each Offers event with a correct, wrong and missing `X-Api-Key`. No Cover
Genius account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/cover-genius \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $COVER_GENIUS_API_KEY" \
  -d '{"event":"BOOKING_CREATED","payload":{"id":"8AMKH-KQ8NR-INS","status":"CONFIRMED","total_price_formatted":"US$68.71","quotes":[]}}'
```

## Receive Webhooks Locally

Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 8000 cover-genius --path /webhooks/cover-genius
```

Give the printed URL to your CSE as the webhook listener URL.

## How It Works

- `main.py`: `verify_cover_genius_request()`, a `require_cover_genius_key` dependency and the `POST /webhooks/cover-genius` route

1. The `X-Api-Key` header is compared with `COVER_GENIUS_API_KEY` before the body is parsed.
   A missing or wrong key (or an unset `COVER_GENIUS_API_KEY`) returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on `event`: `BOOKING_CREATED`, `BOOKING_UPDATED`,
   `BOOKING_CANCELLED`, `RENEWAL_CREATED`, `RENEWAL_NOTIFICATION`, `RENEWAL_DUE`,
   `RENEWAL_EXPIRED`. Unknown events get `200` so new event types don't trigger retries.
4. It returns `200`. Any other response makes Cover Genius retry, up to 3 times.
