# Foursquare Webhooks - FastAPI Example

Minimal example of receiving Foursquare Movement SDK (formerly Pilgrim SDK)
server webhooks with `Pilgrim-Secret` authentication and event handling.

> **Foursquare does not sign webhook payloads.** There is no signature to
> compute. Every request carries the secret from the Developer Console's
> Pilgrim page, raw, in the `Pilgrim-Secret` header. This example compares it
> to `FOURSQUARE_PILGRIM_SECRET` in constant time (`hmac.compare_digest`), then
> parses the body as JSON.

## Prerequisites

- Python 3.9+
- A Foursquare Developer Console project with the Movement SDK enabled

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Pilgrim secret (Developer Console > Pilgrim page) to `.env` as
   `FOURSQUARE_PILGRIM_SECRET`. If it is unset, the endpoint returns `500` (fails closed).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the unit tests:

```bash
pytest test_webhook.py -v
```

### Receive webhooks locally

```bash
npx hookdeck-cli listen 8000 foursquare --path /webhooks/foursquare
```

Use the Hookdeck URL as the server URL on the Movement SDK Webhooks page in the
Developer Console.

Send a request manually:

```bash
curl -X POST http://localhost:8000/webhooks/foursquare \
  -H "Pilgrim-Secret: your_pilgrim_secret" \
  -H "Content-Type: application/json" \
  -d '{"pilgrimVisitId":"4c4763f7646e38002cc51789","eventType":"placeArrival","timestamp":1548182419000}'
```

## Endpoint

- `POST /webhooks/foursquare` - Verifies `Pilgrim-Secret`, dispatches on `eventType`
